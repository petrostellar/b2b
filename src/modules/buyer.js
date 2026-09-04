const express = require('express');
const multer = require('multer');
const path = require('path');
const { q } = require('../db');
const H = require('../lib/helpers');
const { flash, requireAuth } = require('../middleware/context');

const r = express.Router();
const upload = multer({ dest: path.join(__dirname, '../../uploads'), limits: { fileSize: 8 * 1024 * 1024 } });

const BR_SELECT = `
  SELECT b.*, u.display_name buyer_name, u.avatar buyer_avatar, u.trust_score,
    p.business_name, p.country, p.city, p.seller_type,
    c.slug cat_slug, c.name_fa cat_name_fa, c.name_en cat_name_en, c.name_tr cat_name_tr, c.name_ar cat_name_ar,
    (SELECT COUNT(*) FROM kyc_cases k WHERE k.user_id=u.id AND k.status='approved') kyc_ok,
    (SELECT COUNT(*) FROM quotes WHERE buy_request_id=b.id) quote_count
  FROM buy_requests b JOIN users u ON u.id=b.buyer_id
  LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN categories c ON c.id=b.category_id`;

/* ============ BUYER FEED (seller-facing discovery) ============ */
r.get('/buy-requests', (req, res) => {
  const w = [`b.status='approved'`]; const p = [];
  if (req.query.q) { w.push('(b.title LIKE ? OR b.description LIKE ? OR b.variety LIKE ?)'); const s = `%${req.query.q}%`; p.push(s, s, s); }
  if (req.query.category_id) { w.push('b.category_id=?'); p.push(+req.query.category_id); }
  if (req.query.destination) { w.push('b.destination LIKE ?'); p.push(`%${req.query.destination}%`); }
  if (req.query.min_qty) { w.push('b.quantity >= ?'); p.push(+req.query.min_qty); }
  if (req.query.verified) w.push(`EXISTS (SELECT 1 FROM kyc_cases k WHERE k.user_id=u.id AND k.status='approved')`);
  if (req.query.days) { w.push(`b.created_at > datetime('now','-${parseInt(req.query.days, 10) || 30} days')`); }
  const where = 'WHERE ' + w.join(' AND ');
  const { page, perPage, offset } = H.paginate(req.query.page, 12);
  const total = q.get(`SELECT COUNT(*) c FROM buy_requests b JOIN users u ON u.id=b.buyer_id ${where}`, p).c;
  res.render('buyer/feed', {
    title: res.locals.t('nav_requests'),
    rows: q.all(`${BR_SELECT} ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`, [...p, perPage, offset]),
    total, page, pages: Math.max(1, Math.ceil(total / perPage)),
    cats: q.all('SELECT * FROM categories WHERE parent_id IS NULL ORDER BY sort_order'),
    suggested: q.all(`SELECT u.id,u.display_name,u.avatar,p.business_name,p.city,p.country,
        (SELECT COUNT(*) FROM buy_requests WHERE buyer_id=u.id AND status='approved') rc
      FROM users u JOIN profiles p ON p.user_id=u.id
      WHERE EXISTS (SELECT 1 FROM buy_requests b WHERE b.buyer_id=u.id AND b.status='approved')
      ORDER BY u.trust_score DESC LIMIT 8`),
  });
});

/* ============ CREATE RFQ ============ */
r.get('/buy-requests/new', requireAuth, (req, res) => {
  res.render('buyer/new', {
    title: 'ثبت درخواست خرید',
    cats: q.all(`SELECT c.*, (SELECT name_fa FROM categories p WHERE p.id=c.parent_id) parent_name
                 FROM categories c WHERE c.status='active' ORDER BY c.parent_id, c.sort_order`),
    units: q.all('SELECT * FROM units'),
    currencies: q.all('SELECT * FROM currencies WHERE enabled=1'),
    countries: q.all('SELECT * FROM countries WHERE enabled=1 ORDER BY name_en'),
  });
});

r.post('/buy-requests/new', requireAuth, upload.single('attachment'), (req, res) => {
  const b = req.body; const errs = [];
  if (!b.title || b.title.length < 5) errs.push('عنوان درخواست حداقل ۵ کاراکتر');
  if (!b.category_id) errs.push('دسته‌بندی الزامی است');
  if (!b.quantity || +b.quantity <= 0) errs.push('مقدار مورد نیاز الزامی است');
  if (!b.description || b.description.length < 15) errs.push('توضیحات حداقل ۱۵ کاراکتر');
  if (errs.length) { flash(req, 'err', errs.join(' • ')); return res.redirect('/buy-requests/new'); }

  const auto = H.setting('auto_approve_requests', '0') === '1';
  const info = q.run(`INSERT INTO buy_requests (buyer_id,category_id,title,variety,quantity,unit,wholesale_experience,
      looking_for,target_price,currency,origin_preference,destination,deadline,packaging_requirement,quality_requirement,
      certificate_requirement,description,attachment,contact_preference,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [req.user.id, +b.category_id, b.title, b.variety || null, +b.quantity, b.unit || null,
     b.wholesale_experience ? 1 : 0, b.looking_for || null, +b.target_price || null, b.currency || req.currency,
     b.origin_preference || null, b.destination || null, b.deadline || null, b.packaging_requirement || null,
     b.quality_requirement || null, b.certificate_requirement || null, b.description,
     req.file ? '/uploads/' + req.file.filename : null, b.contact_preference || 'chat',
     auto ? 'approved' : 'pending_review']);

  H.track('buy_request_created', { actor_id: req.user.id, target_type: 'buy_request', target_id: info.lastInsertRowid, req });
  // match sellers in the same category and notify them
  q.all(`SELECT DISTINCT seller_id FROM listings WHERE category_id=? AND status='approved' LIMIT 50`, [+b.category_id])
    .forEach((s) => H.notify(s.seller_id, { type: 'rfq_match', title: 'درخواست خرید جدید در حوزه شما',
      body: b.title, link: '/buy-requests/' + info.lastInsertRowid }));
  flash(req, 'ok', 'درخواست خرید ثبت شد ✓');
  res.redirect('/buy-requests/' + info.lastInsertRowid + '/submitted');
});

r.get('/buy-requests/:id/submitted', requireAuth, (req, res) => {
  const b = q.get('SELECT * FROM buy_requests WHERE id=? AND buyer_id=?', [req.params.id, req.user.id]);
  if (!b) return res.status(404).render('errors/404');
  res.render('buyer/submitted', { title: 'ثبت شد', b,
    sellers: q.all(`SELECT u.id,u.display_name,u.avatar,p.business_name,p.city,p.country,
        (SELECT COUNT(*) FROM listings WHERE seller_id=u.id AND status='approved') lc
      FROM users u JOIN profiles p ON p.user_id=u.id
      WHERE EXISTS (SELECT 1 FROM listings l WHERE l.seller_id=u.id AND l.category_id=? AND l.status='approved')
      ORDER BY u.trust_score DESC LIMIT 6`, [b.category_id]) });
});

/* ============ MY REQUESTS ============ */
r.get('/my-requests', requireAuth, (req, res) => {
  const tabs = { approved: `status='approved'`, pending: `status IN ('pending_review','submitted')`,
    rejected: `status='rejected'`, closed: `status IN ('closed','awarded','expired','cancelled')`, draft: `status='draft'` };
  const tab = tabs[req.query.tab] ? req.query.tab : 'approved';
  res.render('buyer/mine', {
    title: 'درخواست‌های من', tab,
    counts: Object.fromEntries(Object.entries(tabs).map(([k, w]) =>
      [k, q.get(`SELECT COUNT(*) c FROM buy_requests WHERE buyer_id=? AND ${w}`, [req.user.id]).c])),
    rows: q.all(`SELECT b.*, (SELECT COUNT(*) FROM quotes WHERE buy_request_id=b.id) quote_count
                 FROM buy_requests b WHERE b.buyer_id=? AND ${tabs[tab]} ORDER BY b.id DESC`, [req.user.id]),
  });
});

/* ============ RFQ DETAIL ============ */
r.get('/buy-requests/:id', (req, res) => {
  const b = q.get(`${BR_SELECT} WHERE b.id=?`, [req.params.id]);
  if (!b) return res.status(404).render('errors/404');
  const owner = req.user && req.user.id === b.buyer_id;
  if (b.status !== 'approved' && !owner && !(req.user && req.user.is_admin)) return res.status(404).render('errors/404');
  q.run('UPDATE buy_requests SET views_count=views_count+1 WHERE id=?', [b.id]);

  res.render('buyer/detail', {
    title: b.title, b, owner,
    quotes: q.all(`SELECT qt.*, u.display_name seller_name, u.avatar seller_avatar, p.business_name,
        (SELECT COUNT(*) FROM kyc_cases k WHERE k.user_id=u.id AND k.status='approved') kyc_ok
      FROM quotes qt JOIN users u ON u.id=qt.seller_id LEFT JOIN profiles p ON p.user_id=u.id
      WHERE qt.buy_request_id=? ORDER BY qt.id DESC`, [b.id]),
    myQuote: req.user ? q.get('SELECT * FROM quotes WHERE buy_request_id=? AND seller_id=?', [b.id, req.user.id]) : null,
    sellers: q.all(`SELECT u.id,u.display_name,u.avatar,p.business_name,p.city,
        (SELECT COUNT(*) FROM listings WHERE seller_id=u.id AND status='approved') lc,
        (SELECT COUNT(*) FROM kyc_cases k WHERE k.user_id=u.id AND k.status='approved') kyc_ok
      FROM users u JOIN profiles p ON p.user_id=u.id
      WHERE EXISTS (SELECT 1 FROM listings l WHERE l.seller_id=u.id AND l.category_id=? AND l.status='approved')
      ORDER BY u.trust_score DESC LIMIT 8`, [b.category_id]),
    canPhone: H.canSeePhone(req.user, b.buyer_id),
    currencies: q.all('SELECT * FROM currencies WHERE enabled=1'),
  });
});

/* ============ RFQ actions ============ */
r.post('/buy-requests/:id/close', requireAuth, (req, res) => {
  const b = q.get('SELECT * FROM buy_requests WHERE id=? AND buyer_id=?', [req.params.id, req.user.id]);
  if (!b) return res.sendStatus(404);
  q.run(`UPDATE buy_requests SET status='closed' WHERE id=?`, [b.id]);
  flash(req, 'ok', 'درخواست بسته شد');
  res.redirect('/buy-requests/' + b.id);
});

r.post('/buy-requests/:id/award/:quoteId', requireAuth, (req, res) => {
  const b = q.get('SELECT * FROM buy_requests WHERE id=? AND buyer_id=?', [req.params.id, req.user.id]);
  if (!b) return res.sendStatus(404);
  const qt = q.get('SELECT * FROM quotes WHERE id=? AND buy_request_id=?', [req.params.quoteId, b.id]);
  if (!qt) return res.sendStatus(404);
  q.run(`UPDATE quotes SET status='awarded' WHERE id=?`, [qt.id]);
  q.run(`UPDATE quotes SET status='rejected' WHERE buy_request_id=? AND id!=?`, [b.id, qt.id]);
  q.run(`UPDATE buy_requests SET status='awarded', awarded_seller_id=? WHERE id=?`, [qt.seller_id, b.id]);
  H.notify(qt.seller_id, { type: 'awarded', title: 'پیشنهاد شما پذیرفته شد 🎉', body: b.title, link: '/buy-requests/' + b.id });
  flash(req, 'ok', 'پیشنهاد پذیرفته شد. اکنون می‌توانید سفارش را نهایی کنید.');
  res.redirect('/orders/from-quote/' + qt.id);
});

module.exports = r;

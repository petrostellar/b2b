const express = require('express');
const { q } = require('../db');
const H = require('../lib/helpers');
const { flash, requireAdmin } = require('../middleware/context');

const r = express.Router();
r.use(requireAdmin);
r.use((req, res, next) => { res.locals.adminLayout = true; next(); });

const page = (req) => H.paginate(req.query.page, 25);

/* ================= DASHBOARD ================= */
r.get('/', (req, res) => {
  const c = (sql, p = []) => q.get(sql, p).c;
  res.render('admin/dashboard', {
    title: 'Admin', section: 'dashboard',
    kpis: {
      users: c('SELECT COUNT(*) c FROM users'),
      newUsers: c(`SELECT COUNT(*) c FROM users WHERE created_at > datetime('now','-7 days')`),
      listings: c('SELECT COUNT(*) c FROM listings'),
      pendingListings: c(`SELECT COUNT(*) c FROM listings WHERE status='pending_review'`),
      requests: c('SELECT COUNT(*) c FROM buy_requests'),
      pendingRequests: c(`SELECT COUNT(*) c FROM buy_requests WHERE status='pending_review'`),
      kyc: c(`SELECT COUNT(*) c FROM kyc_cases WHERE status IN ('submitted','under_review')`),
      orders: c('SELECT COUNT(*) c FROM orders'),
      gmv: q.get(`SELECT COALESCE(SUM(total),0) s FROM orders WHERE payment_status='paid'`).s,
      reports: c(`SELECT COUNT(*) c FROM reports WHERE status='open'`),
      tickets: c(`SELECT COUNT(*) c FROM tickets WHERE status IN ('open','pending')`),
      subs: c(`SELECT COUNT(*) c FROM subscriptions WHERE status='active'`),
    },
    chart: q.all(`SELECT date(created_at) d, COUNT(*) c FROM users WHERE created_at > datetime('now','-14 days') GROUP BY d ORDER BY d`),
    listingChart: q.all(`SELECT date(created_at) d, COUNT(*) c FROM listings WHERE created_at > datetime('now','-14 days') GROUP BY d ORDER BY d`),
    recentUsers: q.all('SELECT * FROM users ORDER BY id DESC LIMIT 8'),
    queue: q.all(`SELECT l.*, u.display_name seller FROM listings l JOIN users u ON u.id=l.seller_id
                  WHERE l.status='pending_review' ORDER BY l.id LIMIT 8`),
  });
});

/* ================= USERS ================= */
r.get('/users', (req, res) => {
  const w = ['1=1']; const p = [];
  if (req.query.q) { w.push('(display_name LIKE ? OR phone LIKE ? OR email LIKE ?)'); const s = `%${req.query.q}%`; p.push(s, s, s); }
  if (req.query.status) { w.push('status=?'); p.push(req.query.status); }
  const { page: pg, perPage, offset } = page(req);
  const total = q.get(`SELECT COUNT(*) c FROM users WHERE ${w.join(' AND ')}`, p).c;
  res.render('admin/users', { title: 'کاربران', section: 'users', total, page: pg,
    pages: Math.max(1, Math.ceil(total / perPage)),
    rows: q.all(`SELECT u.*, p.business_name, p.country,
        (SELECT COUNT(*) FROM listings WHERE seller_id=u.id) lc,
        (SELECT COUNT(*) FROM kyc_cases k WHERE k.user_id=u.id AND k.status='approved') kyc_ok
      FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE ${w.join(' AND ')}
      ORDER BY u.id DESC LIMIT ? OFFSET ?`, [...p, perPage, offset]) });
});
r.post('/users/:id/:action', (req, res) => {
  const a = req.params.action, id = +req.params.id;
  if (a === 'suspend') q.run(`UPDATE users SET status='suspended' WHERE id=?`, [id]);
  if (a === 'activate') q.run(`UPDATE users SET status='active' WHERE id=?`, [id]);
  if (a === 'ban') q.run(`UPDATE users SET status='banned' WHERE id=?`, [id]);
  if (a === 'make-admin') q.run(`UPDATE users SET is_admin=1, admin_role=? WHERE id=?`, [req.body.role || 'operations', id]);
  if (a === 'revoke-admin') q.run(`UPDATE users SET is_admin=0, admin_role=NULL WHERE id=?`, [id]);
  H.audit(req.user.id, 'user.' + a, 'user', id, null, req.body, req.ip);
  flash(req, 'ok', 'انجام شد'); res.redirect('/admin/users');
});

/* ================= KYC REVIEW ================= */
r.get('/kyc', (req, res) => {
  const st = req.query.status || 'submitted';
  res.render('admin/kyc', { title: 'KYC/KYB', section: 'kyc', st,
    counts: Object.fromEntries(['submitted', 'under_review', 'need_correction', 'approved', 'rejected'].map((s) =>
      [s, q.get('SELECT COUNT(*) c FROM kyc_cases WHERE status=?', [s]).c])),
    rows: q.all(`SELECT k.*, u.display_name, u.phone FROM kyc_cases k JOIN users u ON u.id=k.user_id
                 WHERE k.status=? ORDER BY k.id DESC LIMIT 60`, [st]) });
});
r.get('/kyc/:id', (req, res) => {
  const k = q.get(`SELECT k.*, u.display_name, u.phone, u.email FROM kyc_cases k JOIN users u ON u.id=k.user_id WHERE k.id=?`, [req.params.id]);
  if (!k) return res.status(404).render('errors/404');
  res.render('admin/kyc-case', { title: 'پرونده #' + k.id, section: 'kyc', k,
    docs: q.all('SELECT * FROM kyc_documents WHERE case_id=?', [k.id]),
    events: q.all('SELECT * FROM kyc_events WHERE case_id=? ORDER BY id DESC', [k.id]) });
});
r.post('/kyc/:id/decide', (req, res) => {
  const k = q.get('SELECT * FROM kyc_cases WHERE id=?', [req.params.id]);
  if (!k) return res.sendStatus(404);
  const to = req.body.decision;
  q.run(`UPDATE kyc_cases SET status=?, reviewer_id=?, review_note=?, decision_reason=?, decided_at=datetime('now') WHERE id=?`,
    [to, req.user.id, req.body.note || null, req.body.reason || null, k.id]);
  q.run('INSERT INTO kyc_events (case_id,actor_id,from_status,to_status,note) VALUES (?,?,?,?,?)',
    [k.id, req.user.id, k.status, to, req.body.note || null]);
  H.trustScore(k.user_id);
  H.notify(k.user_id, { type: 'kyc',
    title: to === 'approved' ? 'احراز هویت تأیید شد ✓' : (to === 'rejected' ? 'احراز هویت رد شد' : 'نیازمند اصلاح'),
    body: req.body.reason || '', link: '/kyc' });
  flash(req, 'ok', 'تصمیم ثبت شد'); res.redirect('/admin/kyc');
});

/* ================= MODERATION: LISTINGS ================= */
r.get('/listings', (req, res) => {
  const st = req.query.status || 'pending_review';
  const { page: pg, perPage, offset } = page(req);
  const total = q.get('SELECT COUNT(*) c FROM listings WHERE status=?', [st]).c;
  res.render('admin/listings', { title: 'آگهی‌ها', section: 'listings', st, total, page: pg,
    pages: Math.max(1, Math.ceil(total / perPage)),
    counts: Object.fromEntries(['pending_review', 'approved', 'rejected', 'need_correction', 'draft', 'suspended'].map((s) =>
      [s, q.get('SELECT COUNT(*) c FROM listings WHERE status=?', [s]).c])),
    rows: q.all(`SELECT l.*, u.display_name seller, c.name_fa cat,
        (SELECT path FROM listing_media WHERE listing_id=l.id LIMIT 1) cover
      FROM listings l JOIN users u ON u.id=l.seller_id LEFT JOIN categories c ON c.id=l.category_id
      WHERE l.status=? ORDER BY l.id DESC LIMIT ? OFFSET ?`, [st, perPage, offset]) });
});
r.post('/listings/:id/moderate', (req, res) => {
  const l = q.get('SELECT * FROM listings WHERE id=?', [req.params.id]);
  if (!l) return res.sendStatus(404);
  const to = req.body.decision;
  const ALLOWED = ['approved', 'rejected', 'need_correction', 'suspended', 'archived', 'pending_review'];
  if (!ALLOWED.includes(to)) { flash(req, 'err', 'تصمیم نامعتبر است'); return res.redirect(req.get('referer') || '/admin/listings'); }
  if (['rejected', 'need_correction'].includes(to) && !String(req.body.reason || '').trim()) {
    flash(req, 'err', 'برای رد یا اصلاح، ذکر دلیل الزامی است'); return res.redirect(req.get('referer') || '/admin/listings');
  }
  q.run(`UPDATE listings SET status=?, moderation_reason=?, published_at=CASE WHEN ?='approved' THEN datetime('now') ELSE published_at END WHERE id=?`,
    [to, req.body.reason || null, to, l.id]);
  q.run('INSERT INTO listing_status_history (listing_id,from_status,to_status,actor_id,reason) VALUES (?,?,?,?,?)',
    [l.id, l.status, to, req.user.id, req.body.reason || null]);
  H.notify(l.seller_id, { type: 'listing',
    title: to === 'approved' ? 'آگهی شما تأیید شد ✓' : 'آگهی نیازمند بررسی',
    body: req.body.reason || l.title, link: '/product/' + (l.slug || l.id) });
  H.audit(req.user.id, 'listing.moderate', 'listing', l.id, { status: l.status }, { status: to, reason: req.body.reason || null }, req.ip);
  flash(req, 'ok', 'انجام شد'); res.redirect(req.get('referer') || '/admin/listings');
});

/* ================= BUY REQUESTS ================= */
r.get('/requests', (req, res) => {
  const st = req.query.status || 'pending_review';
  res.render('admin/requests', { title: 'درخواست‌های خرید', section: 'requests', st,
    counts: Object.fromEntries(['pending_review', 'approved', 'rejected', 'awarded', 'closed'].map((s) =>
      [s, q.get('SELECT COUNT(*) c FROM buy_requests WHERE status=?', [s]).c])),
    rows: q.all(`SELECT b.*, u.display_name buyer FROM buy_requests b JOIN users u ON u.id=b.buyer_id
                 WHERE b.status=? ORDER BY b.id DESC LIMIT 60`, [st]) });
});
r.post('/requests/:id/moderate', (req, res) => {
  const b = q.get('SELECT * FROM buy_requests WHERE id=?', [req.params.id]);
  if (!b) return res.sendStatus(404);
  q.run('UPDATE buy_requests SET status=?, rejection_reason=? WHERE id=?', [req.body.decision, req.body.reason || null, b.id]);
  H.notify(b.buyer_id, { type: 'rfq', title: req.body.decision === 'approved' ? 'درخواست شما تأیید شد ✓' : 'درخواست رد شد',
    body: req.body.reason || b.title, link: '/buy-requests/' + b.id });
  flash(req, 'ok', 'انجام شد'); res.redirect('/admin/requests');
});

/* ================= CATEGORIES ================= */
r.get('/categories', (req, res) => {
  res.render('admin/categories', { title: 'دسته‌بندی‌ها', section: 'categories',
    rows: q.all(`SELECT c.*, (SELECT name_fa FROM categories p WHERE p.id=c.parent_id) parent_name,
      (SELECT COUNT(*) FROM listings l WHERE l.category_id=c.id) lc FROM categories c ORDER BY c.parent_id, c.sort_order`),
    roots: q.all('SELECT * FROM categories WHERE parent_id IS NULL ORDER BY sort_order') });
});
r.post('/categories', (req, res) => {
  const b = req.body;
  if (b.id) {
    q.run(`UPDATE categories SET parent_id=?, slug=?, name_fa=?, name_en=?, name_tr=?, name_ar=?, description=?, icon=?,
      sort_order=?, status=?, seo_title=?, seo_description=?, allowed_listing_types=? WHERE id=?`,
      [b.parent_id || null, b.slug, b.name_fa, b.name_en, b.name_tr, b.name_ar, b.description || null, b.icon || null,
       +b.sort_order || 0, b.status || 'active', b.seo_title || null, b.seo_description || null,
       b.allowed_listing_types || 'wholesale,retail', b.id]);
  } else {
    q.run(`INSERT INTO categories (parent_id,slug,name_fa,name_en,name_tr,name_ar,description,icon,sort_order,status,seo_title,seo_description,allowed_listing_types)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.parent_id || null, b.slug || H.slugify(b.name_en || b.name_fa), b.name_fa, b.name_en, b.name_tr, b.name_ar,
       b.description || null, b.icon || null, +b.sort_order || 0, b.status || 'active',
       b.seo_title || null, b.seo_description || null, b.allowed_listing_types || 'wholesale,retail']);
  }
  flash(req, 'ok', 'ذخیره شد ✓'); res.redirect('/admin/categories');
});
r.post('/categories/:id/delete', (req, res) => {
  q.run('DELETE FROM categories WHERE id=?', [req.params.id]); res.redirect('/admin/categories');
});

/* ================= ATTRIBUTES ================= */
r.get('/attributes', (req, res) => {
  const cid = req.query.category_id ? +req.query.category_id : null;
  res.render('admin/attributes', { title: 'مشخصه‌ها', section: 'attributes', cid,
    cats: q.all(`SELECT c.*, (SELECT name_fa FROM categories p WHERE p.id=c.parent_id) parent_name FROM categories c ORDER BY c.parent_id, c.sort_order`),
    rows: cid ? q.all('SELECT * FROM attributes WHERE category_id=? ORDER BY sort_order', [cid])
              : q.all(`SELECT a.*, c.name_fa cat FROM attributes a LEFT JOIN categories c ON c.id=a.category_id ORDER BY a.category_id, a.sort_order`) });
});
r.post('/attributes', (req, res) => {
  const b = req.body;
  const opts = b.options ? JSON.stringify(b.options.split(',').map((s) => s.trim()).filter(Boolean)) : null;
  q.run(`INSERT INTO attributes (category_id,akey,label_fa,label_en,label_tr,label_ar,data_type,options,unit,required,searchable,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [+b.category_id, b.akey, b.label_fa, b.label_en || b.label_fa, b.label_tr || b.label_fa, b.label_ar || b.label_fa,
     b.data_type, opts, b.unit || null, b.required ? 1 : 0, 1, +b.sort_order || 0]);
  flash(req, 'ok', 'مشخصه افزوده شد ✓'); res.redirect('/admin/attributes?category_id=' + b.category_id);
});
r.post('/attributes/:id/delete', (req, res) => {
  q.run('DELETE FROM attributes WHERE id=?', [req.params.id]); res.redirect(req.get('referer') || '/admin/attributes');
});

/* ================= UNITS / CURRENCIES / COUNTRIES / LANGUAGES ================= */
r.get('/localization', (req, res) => {
  res.render('admin/localization', { title: 'محلی‌سازی', section: 'localization',
    languages: q.all('SELECT * FROM languages ORDER BY sort_order'),
    currencies: q.all('SELECT * FROM currencies'),
    countries: q.all('SELECT * FROM countries ORDER BY name_en'),
    units: q.all('SELECT * FROM units'),
    translations: q.all('SELECT * FROM translations ORDER BY tkey LIMIT 200') });
});
r.post('/localization/language', (req, res) => {
  q.run('INSERT OR REPLACE INTO languages (code,name,native_name,dir,enabled,sort_order) VALUES (?,?,?,?,?,?)',
    [req.body.code, req.body.name, req.body.native_name, req.body.dir || 'ltr', req.body.enabled ? 1 : 0, +req.body.sort_order || 0]);
  flash(req, 'ok', 'زبان ذخیره شد'); res.redirect('/admin/localization');
});
r.post('/localization/currency', (req, res) => {
  q.run('INSERT OR REPLACE INTO currencies (code,symbol,name,rate_to_base,enabled) VALUES (?,?,?,?,?)',
    [req.body.code, req.body.symbol, req.body.name, +req.body.rate_to_base || 1, req.body.enabled ? 1 : 0]);
  res.redirect('/admin/localization');
});
r.post('/localization/country', (req, res) => {
  q.run('INSERT OR REPLACE INTO countries (code,name_fa,name_en,dial_code,enabled) VALUES (?,?,?,?,?)',
    [req.body.code, req.body.name_fa, req.body.name_en, req.body.dial_code, 1]);
  res.redirect('/admin/localization');
});
r.post('/localization/unit', (req, res) => {
  q.run('INSERT OR REPLACE INTO units (code,name_fa,name_en,name_tr,name_ar,kind) VALUES (?,?,?,?,?,?)',
    [req.body.code, req.body.name_fa, req.body.name_en, req.body.name_tr, req.body.name_ar, req.body.kind]);
  res.redirect('/admin/localization');
});
r.post('/localization/translation', (req, res) => {
  q.run('INSERT OR REPLACE INTO translations (locale,tkey,value) VALUES (?,?,?)',
    [req.body.locale, req.body.tkey, req.body.value]);
  res.redirect('/admin/localization');
});

/* ================= PLANS ================= */
r.get('/plans', (req, res) => {
  res.render('admin/plans', { title: 'پلن‌های عضویت', section: 'plans',
    rows: q.all('SELECT * FROM plans ORDER BY sort_order').map((p) => ({
      ...p, features: q.all('SELECT * FROM plan_features WHERE plan_id=?', [p.id]) })) });
});
r.post('/plans', (req, res) => {
  const b = req.body;
  const i = q.run(`INSERT INTO plans (code,name_fa,name_en,name_tr,name_ar,months,price_minor,currency,discount_percent,bonus_months,badge,highlight,sort_order,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'active')`,
    [b.code, b.name_fa, b.name_en, b.name_tr || b.name_en, b.name_ar || b.name_en, +b.months,
     Math.round(+b.price * 100), b.currency || 'TRY', +b.discount_percent || 0, +b.bonus_months || 0,
     b.badge || null, b.highlight ? 1 : 0, +b.sort_order || 0]);
  (b.feature_key ? [].concat(b.feature_key) : []).forEach((k, idx) => {
    const labels = [].concat(b.feature_label), vals = [].concat(b.feature_value);
    if (k) q.run('INSERT INTO plan_features (plan_id,fkey,label_fa,label_en,value) VALUES (?,?,?,?,?)',
      [i.lastInsertRowid, k, labels[idx], labels[idx], vals[idx] || 'on']);
  });
  flash(req, 'ok', 'پلن ساخته شد'); res.redirect('/admin/plans');
});
r.post('/plans/:id/delete', (req, res) => { q.run('DELETE FROM plans WHERE id=?', [req.params.id]); res.redirect('/admin/plans'); });

/* ================= ADS ================= */
r.get('/ads', (req, res) => {
  res.render('admin/ads', { title: 'تبلیغات', section: 'ads',
    rows: q.all('SELECT * FROM ad_campaigns ORDER BY id DESC'),
    cats: q.all('SELECT * FROM categories WHERE parent_id IS NULL') });
});
r.post('/ads', (req, res) => {
  const b = req.body;
  q.run(`INSERT INTO ad_campaigns (owner_id,name,placement,target_category_id,target_country,target_locale,budget_minor,model,
    headline,subtext,link_url,starts_at,ends_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`,
    [req.user.id, b.name, b.placement, b.target_category_id || null, b.target_country || null, b.target_locale || null,
     Math.round((+b.budget || 0) * 100), b.model || 'flat', b.headline, b.subtext, b.link_url, b.starts_at || null, b.ends_at || null]);
  flash(req, 'ok', 'کمپین ساخته شد'); res.redirect('/admin/ads');
});
r.post('/ads/:id/:action', (req, res) => {
  const map = { pause: 'paused', activate: 'active', finish: 'finished', reject: 'rejected' };
  if (map[req.params.action]) q.run('UPDATE ad_campaigns SET status=? WHERE id=?', [map[req.params.action], req.params.id]);
  if (req.params.action === 'delete') q.run('DELETE FROM ad_campaigns WHERE id=?', [req.params.id]);
  res.redirect('/admin/ads');
});

/* ================= ORDERS / PAYMENTS ================= */
r.get('/orders', (req, res) => {
  res.render('admin/orders', { title: 'سفارش‌ها', section: 'orders',
    rows: q.all(`SELECT o.*, bu.display_name buyer, su.display_name seller FROM orders o
      JOIN users bu ON bu.id=o.buyer_id LEFT JOIN users su ON su.id=o.seller_id ORDER BY o.id DESC LIMIT 100`),
    payments: q.all('SELECT * FROM payment_intents ORDER BY id DESC LIMIT 50'),
    gmv: q.get(`SELECT COALESCE(SUM(total),0) s FROM orders WHERE payment_status='paid'`).s });
});

/* ================= MODERATION: REPORTS / REVIEWS / DISPUTES ================= */
r.get('/moderation', (req, res) => {
  res.render('admin/moderation', { title: 'نظارت', section: 'moderation',
    reports: q.all(`SELECT r.*, u.display_name reporter FROM reports r LEFT JOIN users u ON u.id=r.reporter_id ORDER BY r.id DESC LIMIT 60`),
    reviews: q.all(`SELECT rv.*, u.display_name reviewer, tu.display_name target FROM reviews rv
      JOIN users u ON u.id=rv.reviewer_id JOIN users tu ON tu.id=rv.target_user_id ORDER BY rv.id DESC LIMIT 40`),
    disputes: q.all(`SELECT d.*, o.order_no FROM disputes d JOIN orders o ON o.id=d.order_id ORDER BY d.id DESC`),
    flagged: q.all(`SELECT m.*, u.display_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.flagged=1 ORDER BY m.id DESC LIMIT 30`) });
});
r.post('/moderation/report/:id', (req, res) => {
  q.run('UPDATE reports SET status=?, resolution=? WHERE id=?', [req.body.status, req.body.resolution || null, req.params.id]);
  res.redirect('/admin/moderation');
});
r.post('/moderation/review/:id', (req, res) => {
  q.run('UPDATE reviews SET status=? WHERE id=?', [req.body.status, req.params.id]); res.redirect('/admin/moderation');
});
r.post('/moderation/dispute/:id', (req, res) => {
  q.run('UPDATE disputes SET status=?, decision=? WHERE id=?', [req.body.status, req.body.decision || null, req.params.id]);
  res.redirect('/admin/moderation');
});

/* ================= SUPPORT ================= */
r.get('/support', (req, res) => {
  res.render('admin/support', { title: 'تیکت‌ها', section: 'support',
    rows: q.all(`SELECT t.*, u.display_name FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 80`) });
});
r.post('/support/:id', (req, res) => {
  if (req.body.body) q.run('INSERT INTO ticket_messages (ticket_id,sender_id,body,internal) VALUES (?,?,?,?)',
    [req.params.id, req.user.id, req.body.body, req.body.internal ? 1 : 0]);
  if (req.body.status) q.run('UPDATE tickets SET status=?, assignee_id=? WHERE id=?', [req.body.status, req.user.id, req.params.id]);
  res.redirect('/admin/support');
});

/* ================= CMS ================= */
r.get('/cms', (req, res) => {
  res.render('admin/cms', { title: 'محتوا', section: 'cms',
    pages: q.all('SELECT * FROM pages ORDER BY id'),
    posts: q.all('SELECT * FROM blog_posts ORDER BY id DESC'),
    faqs: q.all('SELECT * FROM faqs ORDER BY sort_order') });
});
r.post('/cms/page', (req, res) => {
  const b = req.body;
  q.run(`INSERT INTO pages (slug,title_fa,title_en,title_tr,title_ar,body_fa,body_en,body_tr,body_ar,seo_title,seo_description,status,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(slug) DO UPDATE SET title_fa=excluded.title_fa,title_en=excluded.title_en,title_tr=excluded.title_tr,
      title_ar=excluded.title_ar,body_fa=excluded.body_fa,body_en=excluded.body_en,body_tr=excluded.body_tr,
      body_ar=excluded.body_ar,seo_title=excluded.seo_title,seo_description=excluded.seo_description,
      status=excluded.status,updated_at=datetime('now')`,
    [b.slug, b.title_fa, b.title_en, b.title_tr || b.title_en, b.title_ar || b.title_en,
     b.body_fa, b.body_en, b.body_tr || b.body_en, b.body_ar || b.body_en,
     b.seo_title || null, b.seo_description || null, b.status || 'published']);
  flash(req, 'ok', 'صفحه ذخیره شد'); res.redirect('/admin/cms');
});
r.post('/cms/post', (req, res) => {
  q.run('INSERT INTO blog_posts (slug,title,excerpt,body,author_id) VALUES (?,?,?,?,?)',
    [H.slugify(req.body.title), req.body.title, req.body.excerpt, req.body.body, req.user.id]);
  res.redirect('/admin/cms');
});
r.post('/cms/faq', (req, res) => {
  q.run('INSERT INTO faqs (group_name,q_fa,a_fa,q_en,a_en,sort_order) VALUES (?,?,?,?,?,?)',
    [req.body.group_name, req.body.q_fa, req.body.a_fa, req.body.q_en, req.body.a_en, +req.body.sort_order || 0]);
  res.redirect('/admin/cms');
});

/* ================= THEMES / SETTINGS / FLAGS ================= */
r.get('/settings', (req, res) => {
  res.render('admin/settings', { title: 'تنظیمات', section: 'settings',
    settings: q.all('SELECT * FROM system_settings ORDER BY skey'),
    flags: q.all('SELECT * FROM feature_flags ORDER BY fkey'),
    themesRows: q.all('SELECT * FROM themes') });
});
r.post('/settings', (req, res) => {
  Object.entries(req.body).forEach(([k, v]) => { if (k.startsWith('s_')) H.setSetting(k.slice(2), v); });
  flash(req, 'ok', 'تنظیمات ذخیره شد'); res.redirect('/admin/settings');
});
r.post('/settings/flag', (req, res) => {
  q.run('INSERT OR REPLACE INTO feature_flags (fkey,enabled,description) VALUES (?,?,?)',
    [req.body.fkey, req.body.enabled ? 1 : 0, req.body.description || null]);
  res.redirect('/admin/settings');
});

/* ================= PLUGINS ================= */
r.get('/plugins', (req, res) => {
  res.render('admin/plugins', { title: 'افزونه‌ها', section: 'plugins', rows: q.all('SELECT * FROM plugins ORDER BY id') });
});
r.post('/plugins/install', (req, res) => {
  let manifest;
  try { manifest = JSON.parse(req.body.manifest); }
  catch { flash(req, 'err', 'manifest.json نامعتبر است'); return res.redirect('/admin/plugins'); }
  const required = ['id', 'name', 'version'];
  const missing = required.filter((k) => !manifest[k]);
  if (missing.length) { flash(req, 'err', 'فیلدهای الزامی: ' + missing.join(', ')); return res.redirect('/admin/plugins'); }
  q.run(`INSERT INTO plugins (plugin_id,name,version,author,description,manifest_json,status,health)
    VALUES (?,?,?,?,?,?,'installed','ok')
    ON CONFLICT(plugin_id) DO UPDATE SET version=excluded.version, manifest_json=excluded.manifest_json`,
    [manifest.id, manifest.name, manifest.version, manifest.author || null, manifest.description || null, JSON.stringify(manifest)]);
  flash(req, 'ok', 'افزونه نصب شد ✓'); res.redirect('/admin/plugins');
});
r.post('/plugins/:id/:action', (req, res) => {
  const map = { enable: 'enabled', disable: 'disabled' };
  if (map[req.params.action]) q.run('UPDATE plugins SET status=? WHERE id=?', [map[req.params.action], req.params.id]);
  if (req.params.action === 'uninstall') q.run('DELETE FROM plugins WHERE id=?', [req.params.id]);
  res.redirect('/admin/plugins');
});

/* ================= AUDIT / SYSTEM HEALTH ================= */
r.get('/audit', (req, res) => {
  res.render('admin/audit', { title: 'گزارش ممیزی', section: 'audit',
    rows: q.all(`SELECT a.*, u.display_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200`),
    events: q.all('SELECT name, COUNT(*) c FROM events GROUP BY name ORDER BY c DESC LIMIT 30') });
});
r.get('/health', (req, res) => {
  const tables = q.all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
  res.render('admin/health', { title: 'سلامت سیستم', section: 'health',
    tables: tables.map((t) => ({ name: t.name, rows: q.get(`SELECT COUNT(*) c FROM "${t.name}"`).c })),
    uptime: Math.round(process.uptime()),
    mem: Math.round(process.memoryUsage().rss / 1048576),
    node: process.version });
});

module.exports = r;

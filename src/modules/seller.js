const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { q } = require('../db');
const H = require('../lib/helpers');
const { flash, requireAuth } = require('../middleware/context');

const r = express.Router();

/* ---------- upload pipeline (validated, persisted) ---------- */
const UP = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UP)) fs.mkdirSync(UP, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, f, cb) => cb(null, UP),
  filename: (req, f, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(f.originalname).toLowerCase()}`),
});
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const upload = multer({
  storage, limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (req, f, cb) => cb(null, ALLOWED.includes(f.mimetype)),
});

function own(req, id) {
  const l = q.get('SELECT * FROM listings WHERE id=?', [id]);
  if (!l) return null;
  if (l.seller_id !== req.user.id && !req.user.is_admin) return null;
  return l;
}
function setStatus(listingId, from, to, actorId, reason) {
  q.run(`UPDATE listings SET status=?, updated_at=datetime('now') WHERE id=?`, [to, listingId]);
  q.run('INSERT INTO listing_status_history (listing_id,from_status,to_status,actor_id,reason) VALUES (?,?,?,?,?)',
    [listingId, from, to, actorId, reason || null]);
}

/* ================= SELLER DASHBOARD ================= */
r.get('/dashboard', requireAuth, (req, res) => {
  const uid = req.user.id;
  const today = new Date().toISOString().slice(0, 10);
  res.render('seller/dashboard', {
    title: res.locals.t('nav_dashboard'),
    kpis: {
      listings: q.get(`SELECT COUNT(*) c FROM listings WHERE seller_id=? AND status='approved'`, [uid]).c,
      pending: q.get(`SELECT COUNT(*) c FROM listings WHERE seller_id=? AND status='pending_review'`, [uid]).c,
      viewsToday: q.get(`SELECT COUNT(*) c FROM listing_views lv JOIN listings l ON l.id=lv.listing_id WHERE l.seller_id=? AND lv.day=?`, [uid, today]).c,
      views7: q.get(`SELECT COUNT(*) c FROM listing_views lv JOIN listings l ON l.id=lv.listing_id WHERE l.seller_id=? AND lv.created_at > datetime('now','-7 days')`, [uid]).c,
      quotes: q.get(`SELECT COUNT(*) c FROM quotes WHERE seller_id=?`, [uid]).c,
      orders: q.get(`SELECT COUNT(*) c FROM orders WHERE seller_id=?`, [uid]).c,
      revenue: q.get(`SELECT COALESCE(SUM(total),0) s FROM orders WHERE seller_id=? AND payment_status='paid'`, [uid]).s,
      unread: q.get(`SELECT COUNT(*) c FROM messages m JOIN conversations cv ON cv.id=m.conversation_id
                     WHERE m.sender_id!=? AND m.read_at IS NULL AND (cv.a_id=? OR cv.b_id=?)`, [uid, uid, uid]).c,
    },
    chart: q.all(`SELECT day, COUNT(*) c FROM listing_views lv JOIN listings l ON l.id=lv.listing_id
                  WHERE l.seller_id=? AND lv.created_at > datetime('now','-14 days') GROUP BY day ORDER BY day`, [uid]),
    completion: H.computeCompletion(uid),
    recent: q.all(`SELECT l.*, (SELECT path FROM listing_media WHERE listing_id=l.id LIMIT 1) cover
                   FROM listings WHERE seller_id=? ORDER BY id DESC LIMIT 6`.replace('FROM listings ', 'FROM listings l '), [uid]),
    matches: q.all(`SELECT b.*, u.display_name buyer_name FROM buy_requests b JOIN users u ON u.id=b.buyer_id
                    WHERE b.status='approved' AND b.category_id IN (SELECT DISTINCT category_id FROM listings WHERE seller_id=?)
                    ORDER BY b.id DESC LIMIT 5`, [uid]),
    notifs: q.all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 6', [uid]),
    sub: H.activeSubscription(uid),
  });
});

/* ================= MY PRODUCTS (tabbed, real queries) ================= */
r.get('/sell', requireAuth, (req, res) => {
  const uid = req.user.id;
  const tabMap = {
    approved: `status='approved'`, pending: `status='pending_review'`, rejected: `status IN ('rejected','need_correction')`,
    draft: `status IN ('draft','incomplete')`, expired: `status='expired'`, archived: `status IN ('archived','paused')`,
  };
  const tab = tabMap[req.query.tab] ? req.query.tab : 'approved';
  const { page, perPage, offset } = H.paginate(req.query.page, 10);
  const total = q.get(`SELECT COUNT(*) c FROM listings WHERE seller_id=? AND ${tabMap[tab]}`, [uid]).c;
  res.render('seller/products', {
    title: 'کالاهای من', tab, page, pages: Math.max(1, Math.ceil(total / perPage)), total,
    counts: Object.fromEntries(Object.entries(tabMap).map(([k, w]) =>
      [k, q.get(`SELECT COUNT(*) c FROM listings WHERE seller_id=? AND ${w}`, [uid]).c])),
    rows: q.all(`SELECT l.*, (SELECT path FROM listing_media WHERE listing_id=l.id ORDER BY sort_order LIMIT 1) cover,
                 (SELECT COUNT(*) FROM listing_views WHERE listing_id=l.id) views
                 FROM listings l WHERE l.seller_id=? AND ${tabMap[tab]} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      [uid, perPage, offset]),
  });
});

/* ================= CREATE WIZARD (7 steps, draft-persisted) ================= */
const STEPS = 7;

r.get('/sell/new', requireAuth, (req, res) => {
  const info = q.run(`INSERT INTO listings (seller_id,title,status,wizard_step,currency) VALUES (?,?,'draft',1,?)`,
    [req.user.id, '', req.currency]);
  res.redirect(`/sell/${info.lastInsertRowid}/wizard/1`);
});

r.get('/sell/:id/wizard/:step', requireAuth, (req, res) => {
  const l = own(req, req.params.id);
  if (!l) return res.status(404).render('errors/404');
  const step = Math.min(STEPS, Math.max(1, +req.params.step || 1));
  const cat = l.category_id ? q.get('SELECT * FROM categories WHERE id=?', [l.category_id]) : null;
  res.render('seller/wizard', {
    title: 'ثبت کالا', l, step, STEPS, cat,
    roots: q.all(`SELECT * FROM categories WHERE parent_id IS NULL AND status='active' ORDER BY sort_order`),
    subs: cat ? q.all('SELECT * FROM categories WHERE parent_id=? ORDER BY sort_order', [cat.parent_id || cat.id]) : [],
    allCats: q.all(`SELECT c.*, (SELECT name_fa FROM categories p WHERE p.id=c.parent_id) parent_name
                    FROM categories c WHERE c.status='active' ORDER BY c.parent_id, c.sort_order`),
    units: q.all('SELECT * FROM units ORDER BY id'),
    currencies: q.all('SELECT * FROM currencies WHERE enabled=1'),
    countries: q.all('SELECT * FROM countries WHERE enabled=1 ORDER BY name_en'),
    attrs: l.category_id ? q.all('SELECT * FROM attributes WHERE category_id=? ORDER BY sort_order', [l.category_id]) : [],
    attrValues: Object.fromEntries(q.all('SELECT akey,value FROM listing_attributes WHERE listing_id=?', [l.id]).map((x) => [x.akey, x.value])),
    media: q.all('SELECT * FROM listing_media WHERE listing_id=? ORDER BY sort_order, id', [l.id]),
  });
});

r.post('/sell/:id/wizard/:step', requireAuth, upload.array('images', 10), (req, res) => {
  const l = own(req, req.params.id);
  if (!l) return res.status(404).render('errors/404');
  const step = +req.params.step;
  const b = req.body;
  const errs = [];

  if (step === 1) {
    if (!b.title || b.title.trim().length < 5) errs.push('عنوان کالا حداقل ۵ کاراکتر باشد');
    if (!b.category_id) errs.push('انتخاب دسته‌بندی الزامی است');
    if (!errs.length) q.run(`UPDATE listings SET title=?, category_id=?, listing_type=?, slug=?, updated_at=datetime('now') WHERE id=?`,
      [b.title.trim(), +b.category_id, b.listing_type || 'wholesale', H.slugify(b.title, l.id), l.id]);
  }
  if (step === 2) {
    q.run(`UPDATE listings SET variety=?, origin_country=?, origin_province=?, origin_city=?, measure_unit=? WHERE id=?`,
      [b.variety || null, b.origin_country || null, b.origin_province || null, b.origin_city || null, b.measure_unit || null, l.id]);
  }
  if (step === 3) {
    if (!b.price_on_request && (!b.price || +b.price <= 0)) errs.push('قیمت باید بزرگ‌تر از صفر باشد');
    if (b.moq && +b.moq < 0) errs.push('حداقل سفارش نامعتبر است');
    let tiers = null;
    if (b.tier_from && b.tier_price) {
      const froms = [].concat(b.tier_from), prices = [].concat(b.tier_price);
      const arr = froms.map((f, i) => ({ from: +f, price: +prices[i] })).filter((x) => x.from && x.price);
      if (arr.length) tiers = JSON.stringify(arr);
    }
    if (!errs.length) q.run(`UPDATE listings SET inventory=?, inventory_unit=?, low_stock_threshold=?, moq=?, moq_unit=?,
        price=?, currency=?, price_unit=?, retail_price=?, wholesale_price=?, negotiable=?, price_on_request=?,
        tier_pricing=?, tax_mode=?, lead_time_days=?, availability=?, price_updated_at=datetime('now') WHERE id=?`,
      [+b.inventory || 0, b.inventory_unit || null, b.low_stock_threshold || null, +b.moq || null, b.moq_unit || null,
       b.price_on_request ? null : (+b.price || null), b.currency || 'TRY', b.price_unit || null,
       +b.retail_price || null, +b.wholesale_price || null, b.negotiable ? 1 : 0, b.price_on_request ? 1 : 0,
       tiers, b.tax_mode || 'excluded', +b.lead_time_days || null, b.availability || 'in_stock', l.id]);
  }
  if (step === 4) {
    (req.files || []).forEach((f, i) => {
      q.run('INSERT INTO listing_media (listing_id,path,kind,sort_order) VALUES (?,?,?,?)',
        [l.id, '/uploads/' + f.filename, f.mimetype.startsWith('image') ? 'image' : 'doc', i]);
    });
    const cnt = q.get('SELECT COUNT(*) c FROM listing_media WHERE listing_id=?', [l.id]).c;
    if (!cnt) errs.push('حداقل یک تصویر برای کالا الزامی است');
  }
  if (step === 5) {
    if (!b.description || b.description.trim().length < 20) errs.push('توضیحات حداقل ۲۰ کاراکتر باشد');
    if (!errs.length) q.run(`UPDATE listings SET description=?, quality=?, packaging=?, grade=?, freshness=?,
        storage_method=?, maintenance=?, dimensions=?, certifications=?, benefits=?, payment_terms=?, delivery_terms=?, seller_notes=? WHERE id=?`,
      [b.description, b.quality || null, b.packaging || null, b.grade || null, b.freshness || null,
       b.storage_method || null, b.maintenance || null, b.dimensions || null, b.certifications || null,
       b.benefits || null, b.payment_terms || null, b.delivery_terms || null, b.seller_notes || null, l.id]);
  }
  if (step === 6) {
    const attrs = q.all('SELECT * FROM attributes WHERE category_id=?', [l.category_id || 0]);
    q.run('DELETE FROM listing_attributes WHERE listing_id=?', [l.id]);
    attrs.forEach((a) => {
      let v = b['attr_' + a.akey];
      if (Array.isArray(v)) v = v.join(', ');
      if (a.required && !v) errs.push(`فیلد «${a.label_fa}» الزامی است`);
      if (v) q.run('INSERT INTO listing_attributes (listing_id,attribute_id,akey,value) VALUES (?,?,?,?)', [l.id, a.id, a.akey, v]);
    });
  }
  if (step === 7) {
    if (!b.legal) errs.push('تأیید صحت اطلاعات الزامی است');
    const fresh = q.get('SELECT * FROM listings WHERE id=?', [l.id]);
    if (!fresh.title || !fresh.category_id) errs.push('مرحله ۱ ناقص است');
    if (!fresh.description) errs.push('مرحله ۵ ناقص است');
    if (!q.get('SELECT 1 x FROM listing_media WHERE listing_id=?', [l.id])) errs.push('تصویر کالا الزامی است');
    if (!errs.length) {
      const autoApprove = H.setting('auto_approve_listings', '0') === '1';
      setStatus(l.id, l.status, autoApprove ? 'approved' : 'pending_review', req.user.id);
      if (autoApprove) q.run(`UPDATE listings SET published_at=datetime('now') WHERE id=?`, [l.id]);
      H.track('listing_submitted', { actor_id: req.user.id, target_type: 'listing', target_id: l.id, req });
      H.notify(req.user.id, { type: 'listing', title: 'آگهی ثبت شد', body: autoApprove ? 'آگهی شما منتشر شد.' : 'آگهی شما در صف بررسی قرار گرفت.', link: '/product/' + (l.slug || l.id) });
      flash(req, 'ok', 'کالای شما با موفقیت ثبت شد ✓');
      return res.redirect('/sell/' + l.id + '/submitted');
    }
  }

  if (errs.length) { flash(req, 'err', errs.join(' • ')); return res.redirect(`/sell/${l.id}/wizard/${step}`); }
  q.run('UPDATE listings SET wizard_step=? WHERE id=?', [Math.max(l.wizard_step, Math.min(STEPS, step + 1)), l.id]);
  res.redirect(`/sell/${l.id}/wizard/${Math.min(STEPS, step + 1)}`);
});

r.post('/sell/:id/media/:mid/delete', requireAuth, (req, res) => {
  const l = own(req, req.params.id); if (!l) return res.sendStatus(404);
  q.run('DELETE FROM listing_media WHERE id=? AND listing_id=?', [req.params.mid, l.id]);
  res.redirect(`/sell/${l.id}/wizard/4`);
});

r.get('/sell/:id/submitted', requireAuth, (req, res) => {
  const l = own(req, req.params.id); if (!l) return res.status(404).render('errors/404');
  res.render('seller/submitted', { title: 'ثبت شد', l });
});

/* ================= EDIT (reuse wizard) ================= */
r.get('/sell/:id/edit', requireAuth, (req, res) => res.redirect(`/sell/${req.params.id}/wizard/1`));

/* ================= ACTIONS ================= */
r.post('/sell/:id/action', requireAuth, (req, res) => {
  const l = own(req, req.params.id); if (!l) return res.sendStatus(404);
  const a = req.body.action;
  if (a === 'pause') setStatus(l.id, l.status, 'paused', req.user.id);
  if (a === 'activate') setStatus(l.id, l.status, 'approved', req.user.id);
  if (a === 'archive') setStatus(l.id, l.status, 'archived', req.user.id);
  if (a === 'resubmit') setStatus(l.id, l.status, 'pending_review', req.user.id);
  if (a === 'delete') q.run('DELETE FROM listings WHERE id=?', [l.id]);
  if (a === 'duplicate') {
    const info = q.run(`INSERT INTO listings (seller_id,category_id,title,listing_type,variety,origin_country,origin_province,
      origin_city,measure_unit,inventory,inventory_unit,moq,moq_unit,price,currency,price_unit,description,status,wizard_step)
      SELECT seller_id,category_id,title||' (کپی)',listing_type,variety,origin_country,origin_province,origin_city,
      measure_unit,inventory,inventory_unit,moq,moq_unit,price,currency,price_unit,description,'draft',7
      FROM listings WHERE id=?`, [l.id]);
    q.run('UPDATE listings SET slug=? WHERE id=?', [H.slugify(l.title + ' copy', info.lastInsertRowid), info.lastInsertRowid]);
    return res.redirect(`/sell/${info.lastInsertRowid}/wizard/1`);
  }
  H.audit(req.user.id, 'listing.' + a, 'listing', l.id, { status: l.status }, null, req.ip);
  flash(req, 'ok', 'عملیات انجام شد ✓');
  res.redirect(req.get('referer') || '/sell');
});

/* ================= PRICE UPDATE ================= */
r.get('/sell/:id/price', requireAuth, (req, res) => {
  const l = own(req, req.params.id); if (!l) return res.status(404).render('errors/404');
  res.render('seller/price', { title: 'به‌روزرسانی قیمت', l,
    history: q.all('SELECT * FROM listing_price_history WHERE listing_id=? ORDER BY id DESC LIMIT 20', [l.id]),
    currencies: q.all('SELECT * FROM currencies WHERE enabled=1'),
    watchers: q.get(`SELECT COUNT(*) c FROM bookmarks WHERE target_type='listing' AND target_id=?`, [l.id]).c });
});
r.post('/sell/:id/price', requireAuth, (req, res) => {
  const l = own(req, req.params.id); if (!l) return res.sendStatus(404);
  const np = +req.body.new_price;
  if (!np || np <= 0) { flash(req, 'err', 'قیمت نامعتبر'); return res.redirect(`/sell/${l.id}/price`); }
  q.run('INSERT INTO listing_price_history (listing_id,old_price,new_price,currency,price_unit,reason,actor_id,notified) VALUES (?,?,?,?,?,?,?,?)',
    [l.id, l.price, np, req.body.currency || l.currency, req.body.price_unit || l.price_unit, req.body.reason || null, req.user.id, req.body.notify ? 1 : 0]);
  q.run(`UPDATE listings SET price=?, currency=?, price_unit=?, price_updated_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
    [np, req.body.currency || l.currency, req.body.price_unit || l.price_unit, l.id]);
  if (req.body.notify) {
    q.all(`SELECT user_id FROM bookmarks WHERE target_type='listing' AND target_id=?`, [l.id]).forEach((bm) =>
      H.notify(bm.user_id, { type: 'price_update', title: 'تغییر قیمت', body: `قیمت «${l.title}» به‌روزرسانی شد.`, link: '/product/' + (l.slug || l.id) }));
  }
  H.track('price_updated', { actor_id: req.user.id, target_type: 'listing', target_id: l.id, payload: { from: l.price, to: np }, req });
  flash(req, 'ok', 'قیمت به‌روزرسانی شد ✓');
  res.redirect(`/sell/${l.id}/price`);
});

/* ================= STOCK UPDATE ================= */
r.get('/sell/:id/stock', requireAuth, (req, res) => {
  const l = own(req, req.params.id); if (!l) return res.status(404).render('errors/404');
  res.render('seller/stock', { title: 'به‌روزرسانی موجودی', l,
    history: q.all('SELECT * FROM listing_inventory_history WHERE listing_id=? ORDER BY id DESC LIMIT 20', [l.id]) });
});
r.post('/sell/:id/stock', requireAuth, (req, res) => {
  const l = own(req, req.params.id); if (!l) return res.sendStatus(404);
  const ns = +req.body.new_stock;
  const avail = req.body.availability || (ns > 0 ? 'in_stock' : 'sold_out');
  q.run('INSERT INTO listing_inventory_history (listing_id,old_stock,new_stock,unit,availability,actor_id) VALUES (?,?,?,?,?,?)',
    [l.id, l.inventory, ns, req.body.unit || l.inventory_unit, avail, req.user.id]);
  q.run(`UPDATE listings SET inventory=?, inventory_unit=?, availability=?, restock_date=?, low_stock_threshold=?,
         status=CASE WHEN ?='sold_out' AND status='approved' THEN 'sold_out' WHEN ?='in_stock' AND status='sold_out' THEN 'approved' ELSE status END,
         updated_at=datetime('now') WHERE id=?`,
    [ns, req.body.unit || l.inventory_unit, avail, req.body.restock_date || null, req.body.low_stock_threshold || null, avail, avail, l.id]);
  if (req.body.notify) q.all(`SELECT user_id FROM bookmarks WHERE target_type='listing' AND target_id=?`, [l.id])
    .forEach((bm) => H.notify(bm.user_id, { type: 'stock', title: 'موجودی به‌روز شد', body: l.title, link: '/product/' + (l.slug || l.id) }));
  flash(req, 'ok', 'موجودی به‌روزرسانی شد ✓');
  res.redirect(`/sell/${l.id}/stock`);
});

/* ================= PRODUCT ANALYTICS ================= */
r.get('/sell/:id/analytics', requireAuth, (req, res) => {
  const l = own(req, req.params.id); if (!l) return res.status(404).render('errors/404');
  const today = new Date().toISOString().slice(0, 10);
  res.render('seller/analytics', {
    title: 'گزارش محصول', l,
    today: q.get('SELECT COUNT(*) c FROM listing_views WHERE listing_id=? AND day=?', [l.id, today]).c,
    week: q.get(`SELECT COUNT(*) c FROM listing_views WHERE listing_id=? AND created_at > datetime('now','-7 days')`, [l.id]).c,
    total: l.views_count,
    unique: q.get('SELECT COUNT(DISTINCT viewer_id) c FROM listing_views WHERE listing_id=? AND viewer_id IS NOT NULL', [l.id]).c,
    chart: q.all(`SELECT day, COUNT(*) c FROM listing_views WHERE listing_id=? AND created_at > datetime('now','-14 days') GROUP BY day ORDER BY day`, [l.id]),
    viewers: q.all(`SELECT DISTINCT u.id,u.display_name,u.avatar,p.city,p.country,p.business_name, MAX(lv.created_at) last_seen
                    FROM listing_views lv JOIN users u ON u.id=lv.viewer_id LEFT JOIN profiles p ON p.user_id=u.id
                    WHERE lv.listing_id=? GROUP BY u.id ORDER BY last_seen DESC LIMIT 30`, [l.id]),
    interested: q.all(`SELECT DISTINCT u.id,u.display_name,u.avatar,p.business_name,p.city
                       FROM conversations cv JOIN users u ON u.id = CASE WHEN cv.a_id=? THEN cv.b_id ELSE cv.a_id END
                       LEFT JOIN profiles p ON p.user_id=u.id
                       WHERE cv.context_type='listing' AND cv.context_id=?`, [l.seller_id, l.id]),
    saves: q.get(`SELECT COUNT(*) c FROM bookmarks WHERE target_type='listing' AND target_id=?`, [l.id]).c,
    quotes: q.get('SELECT COUNT(*) c FROM quotes WHERE listing_id=?', [l.id]).c,
    orders: q.get('SELECT COUNT(*) c FROM order_items WHERE listing_id=?', [l.id]).c,
    sources: q.all('SELECT source, COUNT(*) c FROM listing_views WHERE listing_id=? GROUP BY source', [l.id]),
    canSeeViewers: H.entitlement(req.user.id, 'analytics_depth', 'basic') !== 'basic' || req.user.is_admin,
    recos: (() => {
      const out = [];
      if (!H.isVerified(req.user.id)) out.push({ ic: '✔', t: 'احراز هویت را تکمیل کنید', d: 'آگهی‌های فروشندگان احراز شده تا ۳ برابر بیشتر دیده می‌شوند.', link: '/kyc' });
      if (!H.activeSubscription(req.user.id)) out.push({ ic: '★', t: 'ارتقا به عضویت ویژه', d: 'دسترسی به شماره خریداران و رتبه بالاتر در جستجو.', link: '/pricing' });
      if (l.boost_rank <= 0) out.push({ ic: '🚀', t: 'استفاده از نردبان', d: 'آگهی خود را به بالای لیست دسته‌بندی ببرید.', link: `/sell/${l.id}/boost` });
      const mc = q.get('SELECT COUNT(*) c FROM listing_media WHERE listing_id=?', [l.id]).c;
      if (mc < 4) out.push({ ic: '📷', t: 'تصاویر بیشتری اضافه کنید', d: `اکنون ${mc} تصویر دارید؛ آگهی‌های با ۴+ تصویر بازدید بیشتری دارند.`, link: `/sell/${l.id}/wizard/4` });
      const age = q.get(`SELECT julianday('now')-julianday(COALESCE(price_updated_at,created_at)) d FROM listings WHERE id=?`, [l.id]).d;
      if (age > 14) out.push({ ic: '💲', t: 'قیمت را به‌روز کنید', d: 'آگهی‌های تازه به‌روز شده در رتبه‌بندی بالاتر قرار می‌گیرند.', link: `/sell/${l.id}/price` });
      const comp = H.computeCompletion(req.user.id);
      if (comp.score < 90) out.push({ ic: '👤', t: 'تکمیل پروفایل', d: `پروفایل شما ${comp.score}% تکمیل است.`, link: '/account/profile' });
      return out;
    })(),
  });
});

/* ================= BOOST / LADDER ================= */
r.get('/sell/:id/boost', requireAuth, (req, res) => {
  const l = own(req, req.params.id); if (!l) return res.status(404).render('errors/404');
  res.render('seller/boost', { title: 'نردبان و ارتقا', l,
    options: [
      { kind: 'ladder', name: 'نردبان یکباره', desc: 'انتقال فوری به بالای لیست دسته‌بندی', days: 3, price: 149 },
      { kind: 'featured', name: 'آگهی ویژه', desc: 'نمایش با نشان ویژه در نتایج جستجو', days: 7, price: 399 },
      { kind: 'homepage', name: 'نمایش در صفحه اصلی', desc: 'قرارگیری در بخش ویژه صفحه نخست', days: 7, price: 899 },
      { kind: 'sponsored_search', name: 'نتیجه اسپانسری جستجو', desc: 'بالاترین جایگاه با برچسب Sponsored', days: 14, price: 1290 },
    ],
    history: q.all('SELECT * FROM boosts WHERE listing_id=? ORDER BY id DESC', [l.id]) });
});
r.post('/sell/:id/boost', requireAuth, (req, res) => {
  const l = own(req, req.params.id); if (!l) return res.sendStatus(404);
  const kind = req.body.kind, days = +req.body.days || 7, price = +req.body.price || 0;
  q.run(`INSERT INTO boosts (listing_id,user_id,kind,duration_days,price_minor,currency,starts_at,ends_at,status)
         VALUES (?,?,?,?,?,?,datetime('now'),datetime('now','+${days} days'),'active')`,
    [l.id, req.user.id, kind, days, Math.round(price * 100), req.currency]);
  const rank = { ladder: 10, featured: 20, homepage: 30, sponsored_search: 40 }[kind] || 10;
  q.run(`UPDATE listings SET boost_rank=?, boosted_until=datetime('now','+${days} days'), is_featured=?,
         published_at=datetime('now') WHERE id=?`, [rank, kind === 'featured' || kind === 'homepage' ? 1 : l.is_featured, l.id]);
  H.track('listing_boosted', { actor_id: req.user.id, target_type: 'listing', target_id: l.id, payload: { kind }, req });
  flash(req, 'ok', 'ارتقا فعال شد ✓ آگهی شما در رتبه بالاتری نمایش داده می‌شود.');
  res.redirect(`/sell/${l.id}/boost`);
});

module.exports = r;

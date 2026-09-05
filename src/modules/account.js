/** Account, profile, company, team, KYC/KYB, notifications, CRM lists, stories, subscriptions. */
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { q } = require('../db');
const H = require('../lib/helpers');
const { flash, requireAuth } = require('../middleware/context');

const r = express.Router();

/** Flat listing fee for a VIP homepage banner, in minor units (TRY). */
const VIP_PRICE_MINOR = 150000;
const UP = path.join(__dirname, '../../uploads');
const upload = multer({ dest: UP, limits: { fileSize: 8 * 1024 * 1024 } });

/* ================= ACCOUNT HOME ================= */
r.get('/account', requireAuth, (req, res) => {
  const uid = req.user.id;
  res.render('account/home', {
    title: res.locals.t('nav_account'),
    completion: H.computeCompletion(uid),
    trust: H.trustScore(uid),
    kyc: q.get('SELECT * FROM kyc_cases WHERE user_id=? ORDER BY id DESC LIMIT 1', [uid]),
    sub: H.activeSubscription(uid),
    counts: {
      listings: q.get('SELECT COUNT(*) c FROM listings WHERE seller_id=?', [uid]).c,
      requests: q.get('SELECT COUNT(*) c FROM buy_requests WHERE buyer_id=?', [uid]).c,
      orders: q.get('SELECT COUNT(*) c FROM orders WHERE buyer_id=? OR seller_id=?', [uid, uid]).c,
      bookmarks: q.get('SELECT COUNT(*) c FROM bookmarks WHERE user_id=?', [uid]).c,
      lists: q.get('SELECT COUNT(*) c FROM saved_lists WHERE owner_id=?', [uid]).c,
      quotes: q.get('SELECT COUNT(*) c FROM quotes WHERE buyer_id=? OR seller_id=?', [uid, uid]).c,
    },
    notifs: q.all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 8', [uid]),
  });
});

/* ================= PROFILE ================= */
r.get('/account/profile', requireAuth, (req, res) => {
  res.render('account/profile', { title: 'ویرایش پروفایل',
    p: q.get('SELECT * FROM profiles WHERE user_id=?', [req.user.id]) || {},
    countries: q.all('SELECT * FROM countries WHERE enabled=1 ORDER BY name_en'),
    cats: q.all('SELECT * FROM categories WHERE parent_id IS NULL ORDER BY sort_order'),
    completion: H.computeCompletion(req.user.id) });
});

r.post('/account/profile', requireAuth, upload.fields([{ name: 'avatar' }, { name: 'cover' }, { name: 'catalog_pdf' }]), (req, res) => {
  const b = req.body; const f = req.files || {};
  if (f.avatar) q.run('UPDATE users SET avatar=? WHERE id=?', ['/uploads/' + f.avatar[0].filename, req.user.id]);
  q.run(`UPDATE users SET first_name=?, last_name=?, display_name=?, email=?, locale=?, currency=?, theme=?, updated_at=datetime('now') WHERE id=?`,
    [b.first_name, b.last_name, b.display_name || `${b.first_name} ${b.last_name}`.trim(), b.email || null,
     b.locale || req.locale, b.currency || req.currency, b.theme || req.theme, req.user.id]);
  q.run(`UPDATE profiles SET business_name=?, about=?, industry=?, category_id=?, country=?, province=?, city=?, address=?,
      lat=?, lng=?, phone_public=?, website=?, social_instagram=?, social_linkedin=?, social_x=?, social_whatsapp=?,
      business_hours=?, seller_type=?, export_markets=?, import_markets=?, incoterms=?, moq_preference=?, company_video=?,
      cover=COALESCE(?,cover), catalog_pdf=COALESCE(?,catalog_pdf), updated_at=datetime('now') WHERE user_id=?`,
    [b.business_name || null, b.about || null, b.industry || null, b.category_id || null, b.country || null,
     b.province || null, b.city || null, b.address || null, +b.lat || null, +b.lng || null, b.phone_public ? 1 : 0,
     b.website || null, b.social_instagram || null, b.social_linkedin || null, b.social_x || null, b.social_whatsapp || null,
     b.business_hours || null, b.seller_type || null, b.export_markets || null, b.import_markets || null,
     b.incoterms || null, b.moq_preference || null, b.company_video || null,
     f.cover ? '/uploads/' + f.cover[0].filename : null, f.catalog_pdf ? '/uploads/' + f.catalog_pdf[0].filename : null,
     req.user.id]);
  H.computeCompletion(req.user.id);
  H.audit(req.user.id, 'profile.update', 'profile', req.user.id, null, b, req.ip);
  flash(req, 'ok', 'پروفایل به‌روزرسانی شد ✓');
  res.redirect('/account/profile');
});

/* ================= COMPANY (KYB fields) ================= */
r.get('/account/company', requireAuth, (req, res) => {
  res.render('account/company', { title: 'اطلاعات شرکت',
    p: q.get('SELECT * FROM profiles WHERE user_id=?', [req.user.id]) || {},
    kyb: q.get(`SELECT * FROM kyc_cases WHERE user_id=? AND kind='kyb' ORDER BY id DESC LIMIT 1`, [req.user.id]) });
});
r.post('/account/company', requireAuth, (req, res) => {
  const b = req.body;
  q.run('UPDATE profiles SET business_name=?, registration_no=?, tax_no=?, address=? WHERE user_id=?',
    [b.business_name, b.registration_no, b.tax_no, b.address, req.user.id]);
  H.computeCompletion(req.user.id);
  flash(req, 'ok', 'ذخیره شد ✓');
  res.redirect('/account/company');
});

/* ================= TEAM ================= */
r.get('/account/team', requireAuth, (req, res) => {
  res.render('account/team', { title: 'تیم', rows: q.all('SELECT * FROM team_members WHERE owner_id=?', [req.user.id]) });
});
r.post('/account/team', requireAuth, (req, res) => {
  q.run('INSERT INTO team_members (owner_id,name,role,email,phone) VALUES (?,?,?,?,?)',
    [req.user.id, req.body.name, req.body.role, req.body.email || null, req.body.phone || null]);
  H.computeCompletion(req.user.id);
  flash(req, 'ok', 'همکار افزوده شد ✓'); res.redirect('/account/team');
});
r.post('/account/team/:id/delete', requireAuth, (req, res) => {
  q.run('DELETE FROM team_members WHERE id=? AND owner_id=?', [req.params.id, req.user.id]); res.redirect('/account/team');
});

/* ================= KYC / KYB ================= */
r.get('/kyc', requireAuth, (req, res) => {
  const kyc = q.get(`SELECT * FROM kyc_cases WHERE user_id=? AND kind='kyc' ORDER BY id DESC LIMIT 1`, [req.user.id]);
  res.render('account/kyc', { title: 'احراز هویت', kyc,
    docs: kyc ? q.all('SELECT * FROM kyc_documents WHERE case_id=?', [kyc.id]) : [],
    events: kyc ? q.all('SELECT * FROM kyc_events WHERE case_id=? ORDER BY id DESC', [kyc.id]) : [],
    history: q.all('SELECT * FROM kyc_cases WHERE user_id=? ORDER BY id DESC', [req.user.id]),
    countries: q.all('SELECT * FROM countries WHERE enabled=1 ORDER BY name_en') });
});

r.post('/kyc', requireAuth, upload.fields([
  { name: 'id_front' }, { name: 'id_back' }, { name: 'selfie_declaration' }, { name: 'trade_license' }, { name: 'tax_cert' },
]), (req, res) => {
  const b = req.body; const f = req.files || {};
  const kind = b.kind === 'kyb' ? 'kyb' : 'kyc';
  let kc = q.get(`SELECT * FROM kyc_cases WHERE user_id=? AND kind=? AND status IN ('draft','need_correction','rejected') ORDER BY id DESC LIMIT 1`, [req.user.id, kind]);
  if (!kc) {
    const i = q.run('INSERT INTO kyc_cases (user_id,kind) VALUES (?,?)', [req.user.id, kind]);
    kc = q.get('SELECT * FROM kyc_cases WHERE id=?', [i.lastInsertRowid]);
  }
  q.run(`UPDATE kyc_cases SET legal_name=?, national_id=?, birth_date=?, country=?, company_name=?, company_reg_no=?,
      company_tax_no=?, trade_registry=?, legal_address=?, authorized_person=?, authorized_person_id=?, beneficial_owner=?,
      status='submitted', submitted_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
    [b.legal_name || null, b.national_id || null, b.birth_date || null, b.country || null, b.company_name || null,
     b.company_reg_no || null, b.company_tax_no || null, b.trade_registry || null, b.legal_address || null,
     b.authorized_person || null, b.authorized_person_id || null, b.beneficial_owner || null, kc.id]);

  Object.entries(f).forEach(([field, arr]) => arr.forEach((file) => {
    const buf = fs.readFileSync(file.path);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    q.run('INSERT INTO kyc_documents (case_id,doc_type,file_path,mime,size_bytes,hash,country,issue_date,expiry_date) VALUES (?,?,?,?,?,?,?,?,?)',
      [kc.id, field, '/uploads/' + file.filename, file.mimetype, file.size, hash, b.country || null, b.issue_date || null, b.expiry_date || null]);
  }));
  q.run('INSERT INTO kyc_events (case_id,actor_id,from_status,to_status,note) VALUES (?,?,?,?,?)',
    [kc.id, req.user.id, kc.status, 'submitted', 'ارسال توسط کاربر']);
  H.notify(req.user.id, { type: 'kyc', title: 'مدارک ارسال شد', body: 'پرونده احراز هویت شما در صف بررسی است.', link: '/kyc' });
  H.track('kyc_submitted', { actor_id: req.user.id, target_type: 'kyc', target_id: kc.id, req });
  flash(req, 'ok', 'مدارک ارسال شد و در صف بررسی قرار گرفت ✓');
  res.redirect('/kyc');
});

/* ================= NOTIFICATIONS ================= */
r.get('/account/notifications', requireAuth, (req, res) => {
  const rows = q.all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100', [req.user.id]);
  q.run(`UPDATE notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL`, [req.user.id]);
  res.render('account/notifications', { title: 'اعلان‌ها', rows,
    prefs: q.get('SELECT * FROM notification_prefs WHERE user_id=?', [req.user.id]) || {} });
});
r.post('/account/notifications/prefs', requireAuth, (req, res) => {
  q.run(`INSERT INTO notification_prefs (user_id,in_app,email,sms,push,quiet_from,quiet_to) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET in_app=excluded.in_app,email=excluded.email,sms=excluded.sms,push=excluded.push,
    quiet_from=excluded.quiet_from,quiet_to=excluded.quiet_to`,
    [req.user.id, req.body.in_app ? 1 : 0, req.body.email ? 1 : 0, req.body.sms ? 1 : 0, req.body.push ? 1 : 0,
     req.body.quiet_from || null, req.body.quiet_to || null]);
  flash(req, 'ok', 'تنظیمات ذخیره شد'); res.redirect('/account/notifications');
});

/* ================= PRIVACY CENTER (KVKK/GDPR) ================= */
r.get('/account/privacy', requireAuth, (req, res) => {
  res.render('account/privacy', { title: 'حریم خصوصی',
    consents: q.all('SELECT * FROM consents WHERE user_id=? ORDER BY id DESC', [req.user.id]) });
});
r.get('/account/export', requireAuth, (req, res) => {
  const uid = req.user.id;
  res.json({
    user: q.get('SELECT id,uuid,phone,email,display_name,created_at FROM users WHERE id=?', [uid]),
    profile: q.get('SELECT * FROM profiles WHERE user_id=?', [uid]),
    listings: q.all('SELECT * FROM listings WHERE seller_id=?', [uid]),
    buy_requests: q.all('SELECT * FROM buy_requests WHERE buyer_id=?', [uid]),
    orders: q.all('SELECT * FROM orders WHERE buyer_id=? OR seller_id=?', [uid, uid]),
    messages: q.all('SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.a_id=? OR c.b_id=?', [uid, uid]),
    consents: q.all('SELECT * FROM consents WHERE user_id=?', [uid]),
  });
});
r.post('/account/delete', requireAuth, (req, res) => {
  q.run(`UPDATE users SET status='deleted', deleted_at=datetime('now'), phone=NULL, email=NULL,
         display_name='کاربر حذف‌شده', avatar=NULL WHERE id=?`, [req.user.id]);
  H.audit(req.user.id, 'account.delete', 'user', req.user.id, null, null, req.ip);
  req.session.destroy(() => res.redirect('/'));
});

/* ================= CRM: SAVED LISTS ================= */
r.get('/crm', requireAuth, (req, res) => {
  const lists = q.all(`SELECT sl.*, (SELECT COUNT(*) FROM saved_list_members WHERE list_id=sl.id) cnt
                       FROM saved_lists sl WHERE sl.owner_id=?`, [req.user.id]);
  const activeId = req.query.list ? +req.query.list : (lists[0] ? lists[0].id : null);
  res.render('crm/lists', {
    title: 'کاربران ذخیره‌شده', lists, activeId,
    members: activeId ? q.all(`SELECT m.*, u.display_name, u.avatar, u.trust_score, p.business_name, p.city, p.country,
        (SELECT COUNT(*) FROM kyc_cases k WHERE k.user_id=u.id AND k.status='approved') kyc_ok,
        (SELECT body FROM user_notes n WHERE n.owner_id=? AND n.target_user_id=u.id ORDER BY n.id DESC LIMIT 1) last_note
      FROM saved_list_members m JOIN users u ON u.id=m.target_user_id LEFT JOIN profiles p ON p.user_id=u.id
      WHERE m.list_id=? ORDER BY m.id DESC`, [req.user.id, activeId]) : [],
    bookmarks: q.all(`SELECT b.*, u.display_name, u.avatar, p.business_name FROM bookmarks b
      JOIN users u ON u.id=b.target_id LEFT JOIN profiles p ON p.user_id=u.id
      WHERE b.user_id=? AND b.target_type='user'`, [req.user.id]),
    savedListings: q.all(`SELECT b.id bid, l.*, (SELECT path FROM listing_media WHERE listing_id=l.id LIMIT 1) cover
      FROM bookmarks b JOIN listings l ON l.id=b.target_id WHERE b.user_id=? AND b.target_type='listing'`, [req.user.id]),
  });
});
r.post('/crm/lists', requireAuth, (req, res) => {
  q.run('INSERT INTO saved_lists (owner_id,name,color) VALUES (?,?,?)', [req.user.id, req.body.name, req.body.color || '#C8A15A']);
  res.redirect('/crm');
});
r.post('/crm/lists/:id/rename', requireAuth, (req, res) => {
  q.run('UPDATE saved_lists SET name=? WHERE id=? AND owner_id=?', [req.body.name, req.params.id, req.user.id]);
  res.redirect('/crm?list=' + req.params.id);
});
r.post('/crm/lists/:id/delete', requireAuth, (req, res) => {
  q.run('DELETE FROM saved_lists WHERE id=? AND owner_id=?', [req.params.id, req.user.id]); res.redirect('/crm');
});
r.post('/crm/add', requireAuth, (req, res) => {
  let listId = +req.body.list_id;
  if (listId && !q.get('SELECT 1 x FROM saved_lists WHERE id=? AND owner_id=?', [listId, req.user.id])) return res.sendStatus(403);
  const targetId = +(req.body.target_user_id || req.body.user_id);
  if (!targetId || targetId === req.user.id) { flash(req, 'err', 'کاربر نامعتبر است'); return res.redirect(req.get('referer') || '/crm'); }
  if (!listId) {
    const i = q.run('INSERT INTO saved_lists (owner_id,name) VALUES (?,?)', [req.user.id, 'لیست پیش‌فرض']);
    listId = i.lastInsertRowid;
  }
  q.run('INSERT OR IGNORE INTO saved_list_members (list_id,target_user_id,status) VALUES (?,?,?)',
    [listId, targetId, H.CRM_KEYS.includes(req.body.status) ? req.body.status : 'medium']);
  flash(req, 'ok', 'به لیست افزوده شد ✓');
  res.redirect(req.get('referer') || '/crm');
});
r.post('/crm/member/:id/status', requireAuth, (req, res) => {
  if (!H.CRM_KEYS.includes(req.body.status)) { flash(req, 'err', 'وضعیت نامعتبر است'); return res.redirect(req.get('referer') || '/crm'); }
  q.run(`UPDATE saved_list_members SET status=? WHERE id=? AND list_id IN (SELECT id FROM saved_lists WHERE owner_id=?)`,
    [req.body.status, req.params.id, req.user.id]);
  res.redirect(req.get('referer') || '/crm');
});
r.post('/crm/member/:id/remove', requireAuth, (req, res) => {
  q.run(`DELETE FROM saved_list_members WHERE id=? AND list_id IN (SELECT id FROM saved_lists WHERE owner_id=?)`,
    [req.params.id, req.user.id]);
  res.redirect(req.get('referer') || '/crm');
});
r.post('/crm/note', requireAuth, (req, res) => {
  q.run('INSERT INTO user_notes (owner_id,target_user_id,list_id,body) VALUES (?,?,?,?)',
    [req.user.id, +req.body.target_user_id, req.body.list_id || null, req.body.body]);
  flash(req, 'ok', 'یادداشت ثبت شد');
  res.redirect(req.get('referer') || '/crm');
});
r.get('/crm/user/:id', requireAuth, (req, res) => {
  const u = q.get('SELECT * FROM users WHERE id=?', [req.params.id]);
  if (!u) return res.status(404).render('errors/404');
  u.profile = q.get('SELECT * FROM profiles WHERE user_id=?', [u.id]) || {};
  res.render('crm/user', { title: u.display_name, u,
    lists: q.all(`SELECT sl.*, m.id member_id, m.status FROM saved_lists sl
      LEFT JOIN saved_list_members m ON m.list_id=sl.id AND m.target_user_id=? WHERE sl.owner_id=?`, [u.id, req.user.id]),
    notes: q.all('SELECT * FROM user_notes WHERE owner_id=? AND target_user_id=? ORDER BY id DESC', [req.user.id, u.id]),
    canPhone: H.canSeePhone(req.user, u.id) });
});

/* ================= STORIES ================= */
r.get('/stories', (req, res) => {
  res.render('story/index', { title: res.locals.t('nav_stories'),
    rows: q.all(`SELECT s.*, u.display_name, u.avatar, p.business_name FROM stories s JOIN users u ON u.id=s.user_id
      LEFT JOIN profiles p ON p.user_id=u.id WHERE s.status='active' ORDER BY s.id DESC`) });
});
r.get('/stories/new', requireAuth, (req, res) => {
  res.render('story/new', { title: 'ثبت استوری',
    listings: q.all(`SELECT id,title FROM listings WHERE seller_id=? AND status='approved'`, [req.user.id]) });
});
r.post('/stories/new', requireAuth, upload.single('media'), (req, res) => {
  const days = +req.body.duration_days || 1;
  q.run(`INSERT INTO stories (user_id,media_path,media_kind,caption,cta_label,cta_type,cta_target_id,status,expires_at)
    VALUES (?,?,?,?,?,?,?,'active',datetime('now','+${days} days'))`,
    [req.user.id, req.file ? '/uploads/' + req.file.filename : null,
     req.file && req.file.mimetype.startsWith('video') ? 'video' : 'image',
     req.body.caption || null, req.body.cta_label || null, req.body.cta_type || null, +req.body.cta_target_id || null]);
  flash(req, 'ok', 'استوری منتشر شد ✓'); res.redirect('/stories');
});

/* ---- VIP hero banner: seller-facing request flow ----
   The seller submits a request with their desired copy; it lands in the admin queue as
   `pending` and only goes live once an admin approves it and marks the fee as paid. */
r.get('/stories/:id/vip', requireAuth, (req, res) => {
  const s = q.get('SELECT * FROM stories WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  if (!s) return res.status(404).render('errors/404');
  res.render('story/vip', { title: res.locals.t('vip_request'), story: s, price: VIP_PRICE_MINOR / 100 });
});

r.post('/stories/:id/vip', requireAuth, (req, res) => {
  const s = q.get('SELECT * FROM stories WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  if (!s) return res.status(404).render('errors/404');
  q.run(`UPDATE stories SET is_vip=1, vip_status='pending', vip_price_minor=?, vip_currency='TRY',
           vip_headline=?, vip_subtext=?, vip_link=?, vip_image=? WHERE id=?`,
    [VIP_PRICE_MINOR, req.body.headline || null, req.body.subtext || null,
     req.body.link || null, s.media_path || null, s.id]);
  flash(req, 'ok', 'درخواست بنر ویژه ثبت شد — پس از تأیید مدیر و پرداخت، روی صفحه اصلی نمایش داده می‌شود.');
  res.redirect('/stories/' + s.id);
});

r.get('/stories/:id', (req, res) => {
  const s = q.get(`SELECT s.*, u.display_name, u.avatar, p.business_name FROM stories s JOIN users u ON u.id=s.user_id
    LEFT JOIN profiles p ON p.user_id=u.id WHERE s.id=?`, [req.params.id]);
  if (!s) return res.status(404).render('errors/404');
  if (req.user) {
    q.run('INSERT OR IGNORE INTO story_views (story_id,viewer_id) VALUES (?,?)', [s.id, req.user.id]);
    q.run('UPDATE stories SET views_count=(SELECT COUNT(*) FROM story_views WHERE story_id=?) WHERE id=?', [s.id, s.id]);
  }
  let target = null;
  if (s.cta_type === 'listing') target = q.get('SELECT id,title,slug,price,currency FROM listings WHERE id=?', [s.cta_target_id]);
  res.render('story/view', { title: 'استوری', s, target,
    isOwner: req.user && req.user.id === s.user_id,
    viewers: (req.user && req.user.id === s.user_id)
      ? q.all(`SELECT u.id,u.display_name,u.avatar,sv.created_at FROM story_views sv JOIN users u ON u.id=sv.viewer_id
               WHERE sv.story_id=? ORDER BY sv.id DESC`, [s.id]) : [],
    next: q.get(`SELECT id FROM stories WHERE id > ? AND status='active' ORDER BY id LIMIT 1`, [s.id]) });
});

/* ================= SUBSCRIPTION / PRICING ================= */
r.get('/pricing', (req, res) => {
  res.render('account/pricing', { title: res.locals.t('nav_pricing'),
    plans: q.all(`SELECT * FROM plans WHERE status='active' ORDER BY sort_order`).map((p) => ({
      ...p, features: q.all('SELECT * FROM plan_features WHERE plan_id=?', [p.id]) })),
    current: req.user ? H.activeSubscription(req.user.id) : null });
});

r.post('/pricing/:planId/subscribe', requireAuth, (req, res) => {
  const p = q.get('SELECT * FROM plans WHERE id=?', [req.params.planId]);
  if (!p) return res.sendStatus(404);
  const months = p.months + (p.bonus_months || 0);
  q.run(`UPDATE subscriptions SET status='cancelled' WHERE user_id=? AND status='active'`, [req.user.id]);
  const i = q.run(`INSERT INTO subscriptions (user_id,plan_id,status,starts_at,ends_at)
    VALUES (?,?,'active',datetime('now'),datetime('now','+${months} months'))`, [req.user.id, p.id]);
  const key = `sub-${i.lastInsertRowid}`;
  q.run(`INSERT OR IGNORE INTO payment_intents (idempotency_key,subscription_id,payer_id,amount_minor,currency,provider,status)
    VALUES (?,?,?,?,?,'mock','succeeded')`, [key, i.lastInsertRowid, req.user.id, p.price_minor, p.currency]);
  // grant entitlements defined by the plan (fully admin-configurable)
  q.all('SELECT * FROM plan_features WHERE plan_id=?', [p.id]).forEach((ft) =>
    q.run(`INSERT INTO entitlements (user_id,ekey,value,expires_at) VALUES (?,?,?,datetime('now','+${months} months'))
      ON CONFLICT(user_id,ekey) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at`,
      [req.user.id, ft.fkey, ft.value]));
  H.notify(req.user.id, { type: 'subscription', title: 'عضویت فعال شد 🎉', body: p.name_fa, link: '/account/subscription' });
  H.track('subscription_activated', { actor_id: req.user.id, payload: { plan: p.code }, req });
  flash(req, 'ok', 'عضویت ویژه فعال شد ✓');
  res.redirect('/account/subscription');
});

r.get('/account/subscription', requireAuth, (req, res) => {
  res.render('account/subscription', { title: 'عضویت من',
    sub: H.activeSubscription(req.user.id),
    ents: q.all('SELECT * FROM entitlements WHERE user_id=?', [req.user.id]),
    history: q.all(`SELECT s.*, p.name_fa, p.name_en, p.price_minor, p.currency FROM subscriptions s
      JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? ORDER BY s.id DESC`, [req.user.id]),
    payments: q.all('SELECT * FROM payment_intents WHERE payer_id=? ORDER BY id DESC LIMIT 20', [req.user.id]) });
});
r.post('/account/subscription/cancel', requireAuth, (req, res) => {
  q.run(`UPDATE subscriptions SET status='cancelled' WHERE user_id=? AND status='active'`, [req.user.id]);
  q.run('DELETE FROM entitlements WHERE user_id=?', [req.user.id]);
  flash(req, 'ok', 'عضویت لغو شد'); res.redirect('/account/subscription');
});

/* ================= SUPPORT ================= */
r.get('/support', requireAuth, (req, res) => {
  res.render('account/support', { title: 'پشتیبانی',
    tickets: q.all('SELECT * FROM tickets WHERE user_id=? ORDER BY id DESC', [req.user.id]) });
});
r.post('/support', requireAuth, (req, res) => {
  const i = q.run('INSERT INTO tickets (user_id,category,subject,priority) VALUES (?,?,?,?)',
    [req.user.id, req.body.category, req.body.subject, req.body.priority || 'normal']);
  q.run('INSERT INTO ticket_messages (ticket_id,sender_id,body) VALUES (?,?,?)', [i.lastInsertRowid, req.user.id, req.body.body]);
  flash(req, 'ok', 'تیکت ثبت شد ✓'); res.redirect('/support/' + i.lastInsertRowid);
});
r.get('/support/:id', requireAuth, (req, res) => {
  const tk = q.get('SELECT * FROM tickets WHERE id=? AND (user_id=? OR ?=1)', [req.params.id, req.user.id, req.user.is_admin ? 1 : 0]);
  if (!tk) return res.status(404).render('errors/404');
  res.render('account/ticket', { title: tk.subject, ticket: tk,
    msgs: q.all(`SELECT tm.*, u.display_name FROM ticket_messages tm LEFT JOIN users u ON u.id=tm.sender_id
                 WHERE tm.ticket_id=? ORDER BY tm.id`, [tk.id]) });
});
r.post('/support/:id', requireAuth, (req, res) => {
  q.run('INSERT INTO ticket_messages (ticket_id,sender_id,body) VALUES (?,?,?)', [req.params.id, req.user.id, req.body.body]);
  q.run(`UPDATE tickets SET status='pending' WHERE id=?`, [req.params.id]);
  res.redirect('/support/' + req.params.id);
});

/* ================= REPORT ================= */
r.get('/report', requireAuth, (req, res) => res.render('account/report', { title: 'گزارش تخلف', type: req.query.type, id: req.query.id }));
r.post('/report', requireAuth, (req, res) => {
  q.run('INSERT INTO reports (reporter_id,target_type,target_id,reason,details) VALUES (?,?,?,?,?)',
    [req.user.id, req.body.type, +req.body.id, req.body.reason, req.body.details]);
  flash(req, 'ok', 'گزارش ثبت شد. تیم اعتماد بررسی می‌کند.'); res.redirect('/');
});

module.exports = r;

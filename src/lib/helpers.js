const crypto = require('crypto');
const { q } = require('../db');

const uuid = () => crypto.randomUUID();

function slugify(str, id) {
  const base = String(str || '')
    .toLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'item';
  return id ? `${base}-${id}` : base;
}

function setting(key, def = null) {
  const r = q.get('SELECT svalue FROM system_settings WHERE skey=?', [key]);
  return r ? r.svalue : def;
}
function setSetting(key, value) {
  q.run(
    `INSERT INTO system_settings (skey,svalue,updated_at) VALUES (?,?,datetime('now'))
     ON CONFLICT(skey) DO UPDATE SET svalue=excluded.svalue, updated_at=datetime('now')`,
    [key, String(value)]
  );
}
function flag(key, def = true) {
  const r = q.get('SELECT enabled FROM feature_flags WHERE fkey=?', [key]);
  return r ? !!r.enabled : def;
}

/** Append-only analytics event. */
function track(name, { actor_id = null, target_type = null, target_id = null, payload = null, req = null } = {}) {
  q.run(
    'INSERT INTO events (name,actor_id,target_type,target_id,payload,ip,ua) VALUES (?,?,?,?,?,?,?)',
    [name, actor_id, target_type, target_id, payload ? JSON.stringify(payload) : null,
     req ? req.ip : null, req ? String(req.get('user-agent') || '').slice(0, 240) : null]
  );
}

function audit(actor_id, action, entity, entity_id, before, after, ip) {
  q.run(
    'INSERT INTO audit_logs (actor_id,action,entity,entity_id,before_json,after_json,ip) VALUES (?,?,?,?,?,?,?)',
    [actor_id, action, entity, entity_id,
     before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, ip || null]
  );
}

function notify(user_id, { type, title, body, link = null, channel = 'in_app' }) {
  if (!user_id) return;
  q.run('INSERT INTO notifications (user_id,type,title,body,link,channel) VALUES (?,?,?,?,?,?)',
    [user_id, type, title, body, link, channel]);
}

function entitlement(user_id, key, def = null) {
  if (!user_id) return def;
  const r = q.get(
    `SELECT value FROM entitlements WHERE user_id=? AND ekey=?
     AND (expires_at IS NULL OR expires_at > datetime('now'))`, [user_id, key]);
  return r ? r.value : def;
}

function activeSubscription(user_id) {
  if (!user_id) return null;
  return q.get(
    `SELECT s.*, p.code AS plan_code, p.name_fa, p.name_en, p.badge
     FROM subscriptions s JOIN plans p ON p.id=s.plan_id
     WHERE s.user_id=? AND s.status='active' AND (s.ends_at IS NULL OR s.ends_at > datetime('now'))
     ORDER BY s.id DESC LIMIT 1`, [user_id]);
}

/** Profile completion engine — rule-based, weights configurable via settings. */
function computeCompletion(userId) {
  const u = q.get('SELECT * FROM users WHERE id=?', [userId]);
  const p = q.get('SELECT * FROM profiles WHERE user_id=?', [userId]) || {};
  const kyc = q.get(`SELECT status FROM kyc_cases WHERE user_id=? ORDER BY id DESC LIMIT 1`, [userId]);
  const steps = [
    { key: 'identity', label_fa: 'احراز هویت', label_en: 'Identity verification', weight: 25, done: kyc && kyc.status === 'approved', link: '/kyc' },
    { key: 'about', label_fa: 'درباره کسب‌وکار', label_en: 'Business description', weight: 15, done: !!(p.about && p.about.length > 30), link: '/account/profile' },
    { key: 'avatar', label_fa: 'تصویر پروفایل', label_en: 'Profile image', weight: 10, done: !!u.avatar, link: '/account/profile' },
    { key: 'company', label_fa: 'اطلاعات حقوقی شرکت', label_en: 'Company legal info', weight: 20, done: !!(p.business_name && p.registration_no), link: '/account/company' },
    { key: 'team', label_fa: 'دعوت همکاران', label_en: 'Invite team', weight: 10, done: !!q.get('SELECT 1 x FROM team_members WHERE owner_id=?', [userId]), link: '/account/team' },
    { key: 'listing', label_fa: 'افزودن اولین کالا', label_en: 'Add first listing', weight: 20, done: !!q.get('SELECT 1 x FROM listings WHERE seller_id=?', [userId]), link: '/sell/new' },
  ];
  const score = steps.reduce((s, x) => s + (x.done ? x.weight : 0), 0);
  const level = score >= 90 ? 'excellent' : score >= 65 ? 'good' : score >= 35 ? 'medium' : 'weak';
  q.run('UPDATE profiles SET completion_score=? WHERE user_id=?', [score, userId]);
  return { score, level, steps };
}

function trustScore(userId) {
  const u = q.get('SELECT * FROM users WHERE id=?', [userId]);
  if (!u) return 0;
  let s = 10;
  const kyc = q.get(`SELECT status FROM kyc_cases WHERE user_id=? AND kind='kyc' ORDER BY id DESC LIMIT 1`, [userId]);
  const kyb = q.get(`SELECT status FROM kyc_cases WHERE user_id=? AND kind='kyb' ORDER BY id DESC LIMIT 1`, [userId]);
  if (kyc && kyc.status === 'approved') s += 30;
  if (kyb && kyb.status === 'approved') s += 15;
  if (u.phone_verified) s += 5;
  const rev = q.get('SELECT AVG(score) a, COUNT(*) c FROM reviews WHERE target_user_id=? AND status=\'published\'', [userId]);
  if (rev && rev.c) s += Math.min(20, Math.round((rev.a / 5) * 20));
  const ord = q.get('SELECT COUNT(*) c FROM orders WHERE seller_id=? AND status IN (\'completed\',\'delivered\')', [userId]);
  s += Math.min(15, (ord ? ord.c : 0) * 3);
  const rep = q.get('SELECT COUNT(*) c FROM reports WHERE target_type=\'user\' AND target_id=? AND status=\'actioned\'', [userId]);
  s -= (rep ? rep.c : 0) * 10;
  s = Math.max(0, Math.min(100, s));
  q.run('UPDATE users SET trust_score=? WHERE id=?', [s, userId]);
  return s;
}

function isVerified(userId) {
  const k = q.get(`SELECT status FROM kyc_cases WHERE user_id=? AND status='approved' LIMIT 1`, [userId]);
  return !!k;
}

/** Can the viewer see this user's phone number? Membership/KYC/policy driven. */
function canSeePhone(viewer, targetUserId) {
  if (!viewer) return false;
  if (viewer.is_admin) return true;
  if (viewer.id === targetUserId) return true;
  const prof = q.get('SELECT phone_public FROM profiles WHERE user_id=?', [targetUserId]);
  if (prof && prof.phone_public) return true;
  return entitlement(viewer.id, 'contact_access') === 'on';
}

function paginate(page, perPage = 12) {
  const p = Math.max(1, parseInt(page || 1, 10) || 1);
  return { page: p, perPage, offset: (p - 1) * perPage };
}

function money(minor) { return (minor || 0) / 100; }

const STATUS_TONE = {
  approved: 'ok', active: 'ok', published: 'ok', completed: 'ok', paid: 'ok', succeeded: 'ok', delivered: 'ok',
  pending_review: 'warn', pending: 'warn', under_review: 'warn', submitted: 'warn', need_correction: 'warn',
  draft: 'muted', incomplete: 'muted', archived: 'muted', expired: 'muted', closed: 'muted', paused: 'muted',
  rejected: 'err', suspended: 'err', banned: 'err', cancelled: 'err', failed: 'err', disputed: 'err',
};
function tone(s) { return STATUS_TONE[s] || 'info'; }

/** Canonical CRM pipeline statuses (single source of truth for views + validation). */
const CRM_STATUSES = [
  ['high', 'اولویت بالا', 'High priority'],
  ['medium', 'اولویت متوسط', 'Medium priority'],
  ['low', 'اولویت پایین', 'Low priority'],
  ['following', 'در حال پیگیری', 'Following up'],
  ['negotiating', 'در حال مذاکره', 'Negotiating'],
  ['won', 'معامله انجام شد', 'Won'],
  ['no_response', 'بدون پاسخ', 'No response'],
  ['no_need', 'بدون نیاز', 'Not needed'],
];
const CRM_KEYS = CRM_STATUSES.map((x) => x[0]);

const STATUS_LABEL = {
  fa: {
    draft: 'پیش‌نویس', incomplete: 'ناقص', pending_review: 'در انتظار بررسی', approved: 'تأیید شده',
    rejected: 'رد شده', need_correction: 'نیازمند اصلاح', paused: 'متوقف', sold_out: 'اتمام موجودی',
    expired: 'منقضی', archived: 'بایگانی', suspended: 'تعلیق', submitted: 'ارسال شده',
    under_review: 'در حال بررسی', matched: 'مچ شده', negotiating: 'در حال مذاکره', awarded: 'واگذار شده',
    closed: 'بسته', cancelled: 'لغو شده', active: 'فعال', pending_payment: 'در انتظار پرداخت',
    paid: 'پرداخت شده', confirmed: 'تأیید شده', processing: 'در حال پردازش', ready_to_ship: 'آماده ارسال',
    shipped: 'ارسال شده', delivered: 'تحویل شده', completed: 'تکمیل شده', refunded: 'مسترد شده',
    disputed: 'اختلاف', open: 'باز', sent: 'ارسال شده', countered: 'پیشنهاد متقابل', accepted: 'پذیرفته شده',
  },
  en: {
    draft: 'Draft', incomplete: 'Incomplete', pending_review: 'Pending review', approved: 'Approved',
    rejected: 'Rejected', need_correction: 'Needs correction', paused: 'Paused', sold_out: 'Sold out',
    expired: 'Expired', archived: 'Archived', suspended: 'Suspended', submitted: 'Submitted',
    under_review: 'Under review', matched: 'Matched', negotiating: 'Negotiating', awarded: 'Awarded',
    closed: 'Closed', cancelled: 'Cancelled', active: 'Active', pending_payment: 'Pending payment',
    paid: 'Paid', confirmed: 'Confirmed', processing: 'Processing', ready_to_ship: 'Ready to ship',
    shipped: 'Shipped', delivered: 'Delivered', completed: 'Completed', refunded: 'Refunded',
    disputed: 'Disputed', open: 'Open', sent: 'Sent', countered: 'Countered', accepted: 'Accepted',
  },
};
function statusLabel(locale, s) {
  const d = STATUS_LABEL[locale] || STATUS_LABEL.en;
  return d[s] || STATUS_LABEL.en[s] || s;
}

module.exports = {
  uuid, slugify, setting, setSetting, flag, track, audit, notify,
  entitlement, activeSubscription, computeCompletion, trustScore, isVerified,
  canSeePhone, paginate, money, tone, statusLabel, CRM_STATUSES, CRM_KEYS,
};

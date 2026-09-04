const express = require('express');
const bcrypt = require('bcryptjs');
const { q } = require('../db');
const H = require('../lib/helpers');
const { flash, requireAuth } = require('../middleware/context');

const r = express.Router();

const OTP_TTL_MIN = 5;
const norm = (p) => String(p || '').replace(/[^\d+]/g, '');

function logEvent(req, userId, event) {
  q.run('INSERT INTO sessions_log (user_id,ip,user_agent,event) VALUES (?,?,?,?)',
    [userId, req.ip, String(req.get('user-agent') || '').slice(0, 200), event]);
}

/* ---------- landing ---------- */
r.get('/login', (req, res) => res.render('auth/login', { title: res.locals.t('login'), mode: 'login' }));
r.get('/register', (req, res) => res.render('auth/login', { title: res.locals.t('register'), mode: 'register' }));

/* ---------- step 1: phone -> OTP ---------- */
r.post('/otp/request', (req, res) => {
  const phone = norm(req.body.phone);
  if (phone.length < 8) { flash(req, 'err', 'شماره موبایل معتبر نیست / Invalid phone number'); return res.redirect('/auth/login'); }

  // rate limit: max 3 in 10 minutes
  const recent = q.get(
    `SELECT COUNT(*) c FROM otp_challenges WHERE phone=? AND created_at > datetime('now','-10 minutes')`, [phone]).c;
  if (recent >= 3) { flash(req, 'err', 'تعداد درخواست بیش از حد. چند دقیقه صبر کنید.'); return res.redirect('/auth/login'); }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  q.run(`INSERT INTO otp_challenges (phone,code,purpose,expires_at) VALUES (?,?,?,datetime('now','+${OTP_TTL_MIN} minutes'))`,
    [phone, code, 'login']);
  req.session.otpPhone = phone;
  H.track('otp_requested', { req, payload: { phone } });
  // Dev delivery: surfaced in UI. Production: SMS provider abstraction.
  req.session.devOtp = code;
  res.redirect('/auth/otp');
});

r.get('/otp', (req, res) => {
  if (!req.session.otpPhone) return res.redirect('/auth/login');
  res.render('auth/otp', { title: 'OTP', phone: req.session.otpPhone, devOtp: req.session.devOtp });
});

r.post('/otp/verify', (req, res) => {
  const phone = req.session.otpPhone;
  const code = String(req.body.code || '').trim();
  if (!phone) return res.redirect('/auth/login');
  const ch = q.get(
    `SELECT * FROM otp_challenges WHERE phone=? AND consumed=0 AND expires_at > datetime('now')
     ORDER BY id DESC LIMIT 1`, [phone]);
  if (!ch) { flash(req, 'err', 'کد منقضی شده است / Code expired'); return res.redirect('/auth/login'); }
  if (ch.attempts >= 5) { flash(req, 'err', 'تلاش بیش از حد'); return res.redirect('/auth/login'); }
  if (ch.code !== code) {
    q.run('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=?', [ch.id]);
    flash(req, 'err', 'کد وارد شده اشتباه است / Wrong code');
    return res.redirect('/auth/otp');
  }
  q.run('UPDATE otp_challenges SET consumed=1 WHERE id=?', [ch.id]);

  let user = q.get('SELECT * FROM users WHERE phone=?', [phone]);
  let isNew = false;
  if (!user) {
    isNew = true;
    const info = q.run(
      'INSERT INTO users (uuid,phone,phone_verified,display_name,locale,currency,theme) VALUES (?,?,1,?,?,?,?)',
      [H.uuid(), phone, phone.slice(-4), req.locale, req.currency, req.theme]);
    q.run('INSERT INTO profiles (user_id) VALUES (?)', [info.lastInsertRowid]);
    q.run('INSERT INTO wallets (user_id,currency) VALUES (?,?)', [info.lastInsertRowid, req.currency]);
    q.run('INSERT INTO notification_prefs (user_id) VALUES (?)', [info.lastInsertRowid]);
    user = q.get('SELECT * FROM users WHERE id=?', [info.lastInsertRowid]);
    H.track('user_registered', { actor_id: user.id, req });
  }
  q.run('UPDATE users SET phone_verified=1 WHERE id=?', [user.id]);
  req.session.userId = user.id;
  req.session.otpPhone = null; req.session.devOtp = null;
  logEvent(req, user.id, 'login');
  H.track('user_login', { actor_id: user.id, req });

  if (isNew || !user.first_name) return res.redirect('/auth/onboarding');
  const to = req.session.returnTo || '/account'; req.session.returnTo = null;
  res.redirect(to);
});

/* ---------- password login (optional path) ---------- */
r.post('/password/login', (req, res) => {
  const id = String(req.body.identifier || '').trim();
  const user = q.get('SELECT * FROM users WHERE email=? OR phone=?', [id, norm(id)]);
  // anti-enumeration: identical message both ways
  if (!user || !user.password_hash || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    logEvent(req, user ? user.id : null, 'login_fail');
    flash(req, 'err', 'اطلاعات ورود نادرست است / Invalid credentials');
    return res.redirect('/auth/login');
  }
  if (user.status !== 'active') { flash(req, 'err', 'حساب مسدود است'); return res.redirect('/auth/login'); }
  req.session.userId = user.id;
  logEvent(req, user.id, 'login');
  const to = req.session.returnTo || '/account'; req.session.returnTo = null;
  res.redirect(to);
});

/* ---------- onboarding: profile + role choice ---------- */
r.get('/onboarding', requireAuth, (req, res) => {
  res.render('auth/onboarding', {
    title: 'تکمیل حساب',
    countries: q.all('SELECT * FROM countries WHERE enabled=1 ORDER BY name_en'),
    cats: q.all('SELECT * FROM categories WHERE parent_id IS NULL ORDER BY sort_order'),
  });
});

r.post('/onboarding', requireAuth, (req, res) => {
  const b = req.body;
  if (!b.first_name || !b.last_name) { flash(req, 'err', 'نام و نام خانوادگی الزامی است'); return res.redirect('/auth/onboarding'); }
  if (!b.terms) { flash(req, 'err', 'پذیرش قوانین الزامی است'); return res.redirect('/auth/onboarding'); }
  const mode = ['buyer', 'seller'].includes(b.mode) ? b.mode : 'buyer';
  q.run(`UPDATE users SET first_name=?, last_name=?, display_name=?, email=?, active_mode=?, updated_at=datetime('now') WHERE id=?`,
    [b.first_name, b.last_name, `${b.first_name} ${b.last_name}`.trim(), b.email || null, mode, req.user.id]);
  q.run(`UPDATE profiles SET country=?, province=?, city=?, seller_type=?, category_id=? WHERE user_id=?`,
    [b.country || 'TR', b.province || null, b.city || null, b.seller_type || null, b.category_id || null, req.user.id]);
  q.run('INSERT OR IGNORE INTO personas (user_id,persona) VALUES (?,?)', [req.user.id, mode]);
  q.run('INSERT INTO consents (user_id,purpose,granted,version,ip) VALUES (?,?,1,?,?)', [req.user.id, 'terms', 'v1', req.ip]);
  if (b.marketing) q.run('INSERT INTO consents (user_id,purpose,granted,version,ip) VALUES (?,?,1,?,?)', [req.user.id, 'marketing', 'v1', req.ip]);
  H.computeCompletion(req.user.id);
  H.notify(req.user.id, { type: 'welcome', title: 'به میدان خوش آمدید', body: 'حساب شما ساخته شد. برای دریافت نشان اعتماد، احراز هویت را تکمیل کنید.', link: '/kyc' });
  flash(req, 'ok', 'حساب شما تکمیل شد ✓');
  res.redirect(mode === 'seller' ? '/dashboard' : '/account');
});

/* ---------- mode switch ---------- */
r.post('/mode', requireAuth, (req, res) => {
  const mode = ['buyer', 'seller'].includes(req.body.mode) ? req.body.mode : 'buyer';
  q.run('UPDATE users SET active_mode=? WHERE id=?', [mode, req.user.id]);
  q.run('INSERT OR IGNORE INTO personas (user_id,persona) VALUES (?,?)', [req.user.id, mode]);
  H.track('mode_switched', { actor_id: req.user.id, payload: { mode }, req });
  res.redirect(req.get('referer') || (mode === 'seller' ? '/dashboard' : '/account'));
});

/* ---------- sessions / logout ---------- */
r.get('/sessions', requireAuth, (req, res) => {
  res.render('auth/sessions', {
    title: 'نشست‌ها',
    logs: q.all('SELECT * FROM sessions_log WHERE user_id=? ORDER BY id DESC LIMIT 50', [req.user.id]),
  });
});

r.post('/logout', (req, res) => {
  if (req.user) logEvent(req, req.user.id, 'logout');
  req.session.destroy(() => res.redirect('/'));
});
r.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

module.exports = r;

const { q } = require('../db');
const i18n = require('../lib/i18n');
const { localize } = require('../lib/localize');
const { THEMES, THEME_CODES, cssVars } = require('../lib/themes');
const H = require('../lib/helpers');

/** Attaches locale, theme, currency, user, nav data and view helpers to every request. */
function context(req, res, next) {
  // --- locale ---
  let locale = req.query.lang || req.session.locale || null;
  if (!i18n.LOCALES.includes(locale)) locale = null;
  if (req.query.lang && locale) req.session.locale = locale;
  if (!locale) {
    const al = String(req.headers['accept-language'] || '').toLowerCase();
    locale = i18n.LOCALES.find((l) => al.startsWith(l)) || 'fa';
  }

  // --- theme ---
  let theme = req.query.theme || req.session.theme || null;
  if (!THEME_CODES.includes(theme)) theme = null;
  if (req.query.theme && theme) req.session.theme = theme;

  // --- currency ---
  let currency = req.query.currency || req.session.currency || null;
  const curRows = q.all('SELECT * FROM currencies WHERE enabled=1 ORDER BY id');
  if (!curRows.some((c) => c.code === currency)) currency = null;
  if (req.query.currency && currency) req.session.currency = currency;

  // --- user ---
  let user = null;
  if (req.session.userId) {
    user = q.get('SELECT * FROM users WHERE id=? AND status!=\'deleted\'', [req.session.userId]);
    if (user) {
      q.run("UPDATE users SET last_active_at=datetime('now') WHERE id=?", [user.id]);
      user.profile = q.get('SELECT * FROM profiles WHERE user_id=?', [user.id]) || {};
      user.verified = H.isVerified(user.id);
      user.subscription = H.activeSubscription(user.id);
      user.unread = q.get(
        `SELECT COUNT(*) c FROM messages m JOIN conversations cv ON cv.id=m.conversation_id
         WHERE m.sender_id!=? AND m.read_at IS NULL AND (cv.a_id=? OR cv.b_id=?)`,
        [user.id, user.id, user.id]).c;
      user.notif_count = q.get('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL', [user.id]).c;
    } else { req.session.userId = null; }
  }
  if (!theme) theme = (user && user.theme) || H.setting('default_theme', 'luxury');
  if (!THEME_CODES.includes(theme)) theme = 'luxury';
  if (!currency) currency = (user && user.currency) || H.setting('default_currency', 'TRY');

  req.locale = locale;
  req.user = user;
  req.theme = theme;
  req.currency = currency;

  // --- automatic row localisation ---
  // Wrap res.render so any row passed to a view gets its `title`/`caption`/`headline`
  // etc. swapped to the active locale. Doing it here means every current and future
  // route is covered, rather than each one having to remember to localise.
  const _render = res.render.bind(res);
  res.render = (view, opts, cb) => {
    if (opts && typeof opts === 'object') {
      for (const key of Object.keys(opts)) {
        const v = opts[key];
        if (!v || typeof v !== 'object') continue;
        if (Array.isArray(v)) {
          if (v.length && typeof v[0] === 'object') localize(v, locale);
        } else if (!(v instanceof Date) && Object.getPrototypeOf(v) === Object.prototype) {
          localize(v, locale);
        }
      }
    }
    return _render(view, opts, cb);
  };

  // --- view locals ---
  res.locals.locale = locale;
  res.locals.dir = i18n.dir(locale);
  res.locals.locales = i18n.LOCALES.map((l) => ({ code: l, name: i18n.DICT[l].name, flag: i18n.DICT[l].flag }));
  res.locals.t = (k) => i18n.t(locale, k);
  res.locals.pick = (row, base) => i18n.pick(row, base, locale);
  res.locals.num = (n) => i18n.fmtNumber(locale, n);
  res.locals.money = (a, c) => i18n.fmtMoney(locale, a, c || currency);
  res.locals.date = (d) => i18n.fmtDate(locale, d);
  res.locals.statusLabel = (s) => H.statusLabel(locale, s);
  res.locals.tone = H.tone;
  res.locals.crmStatuses = H.CRM_STATUSES.map((x) => [x[0], locale === 'fa' ? x[1] : x[2]]);
  res.locals.user = user;
  res.locals.theme = theme;
  res.locals.themes = THEME_CODES.map((c) => ({ code: c, name: THEMES[c].name }));
  res.locals.themeVars = cssVars(theme);
  res.locals.currency = currency;
  res.locals.currencies = curRows;
  res.locals.path = req.path;
  res.locals.query = req.query;
  res.locals.siteName = H.setting('site_name', 'MYDAN');
  res.locals.flash = req.session.flash || null;
  req.session.flash = null;
  res.locals.rootCategories = q.all(
    "SELECT * FROM categories WHERE parent_id IS NULL AND status='active' ORDER BY sort_order, id");
  res.locals.megaMenu = res.locals.rootCategories.map((c) => ({
    ...c, children: q.all("SELECT * FROM categories WHERE parent_id=? AND status='active' ORDER BY sort_order, id LIMIT 8", [c.id]),
  }));
  res.locals.buildQS = (overrides = {}) => {
    const p = new URLSearchParams(req.query);
    Object.entries(overrides).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '') p.delete(k); else p.set(k, v);
    });
    const s = p.toString();
    return s ? '?' + s : '';
  };
  next();
}

function flash(req, type, msg) { req.session.flash = { type, msg }; }

function requireAuth(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).render('errors/403');
  next();
}
function requireSeller(req, res, next) {
  if (!req.user) { req.session.returnTo = req.originalUrl; return res.redirect('/auth/login'); }
  next();
}

module.exports = { context, flash, requireAuth, requireAdmin, requireSeller };

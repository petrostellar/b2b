const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SqliteWasmStore = require('./lib/session-store');
const ejs = require('ejs');

const { q, migrate, DB_PATH } = require('./db');
const H = require('./lib/helpers');
const { context } = require('./middleware/context');

const ROOT = path.join(__dirname, '..');
const VIEWS = path.join(__dirname, 'views');

function createApp() {
  migrate();

  const app = express();
  app.set('trust proxy', 1);
  app.set('views', VIEWS);
  app.set('view engine', 'ejs');
  app.disable('x-powered-by');

  /* ---- security baseline ---- */
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    });
    next();
  });

  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(express.json({ limit: '2mb' }));

  app.use('/css', express.static(path.join(ROOT, 'public/css'), { maxAge: '7d' }));
  app.use('/js', express.static(path.join(ROOT, 'public/js'), { maxAge: '7d' }));
  app.use('/img', express.static(path.join(ROOT, 'public/img'), { maxAge: '30d' }));
  app.use('/uploads', express.static(path.join(ROOT, 'uploads'), { maxAge: '30d' }));

  const sessDir = path.join(ROOT, 'data');
  fs.mkdirSync(sessDir, { recursive: true });
  app.use(session({
    store: new SqliteWasmStore(),
    secret: process.env.SESSION_SECRET || 'mydan-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30, secure: false },
  }));

  /* ---- layout rendering: normal layout vs admin layout ---- */
  app.use((req, res, next) => {
    const render = res.render.bind(res);
    res.render = (view, opts = {}, cb) => {
      if (cb) return render(view, opts, cb);
      const locals = Object.assign({}, res.locals, opts);
      const file = path.join(VIEWS, view.endsWith('.ejs') ? view : view + '.ejs');
      ejs.renderFile(file, locals, { filename: file }, (err, body) => {
        if (err) return next(err);
        const layout = res.locals.adminLayout ? 'admin/layout.ejs' : 'layout.ejs';
        const lf = path.join(VIEWS, layout);
        ejs.renderFile(lf, Object.assign({}, locals, { body }), { filename: lf }, (e2, html) => {
          if (e2) return next(e2);
          res.set('Content-Type', 'text/html; charset=utf-8').send(html);
        });
      });
    };
    next();
  });

  app.use(context);

  /* ---- routers ---- */
  app.use('/auth', require('./modules/auth'));
  app.use('/', require('./modules/catalog').router);
  app.use('/', require('./modules/seller'));
  app.use('/', require('./modules/buyer'));
  app.use('/', require('./modules/messaging').router);
  app.use('/', require('./modules/trade'));
  app.use('/', require('./modules/account'));
  app.use('/', require('./modules/cms'));
  app.use('/api/v1', require('./modules/api'));
  app.use('/admin', require('./middleware/context').requireAdmin, require('./modules/admin'));

  /* ---- ops ---- */
  app.get('/healthz', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
  app.get('/readyz', (req, res) => {
    try {
      q.get('SELECT 1 x');
      res.json({ status: 'ready', db: DB_PATH || 'sqlite' });
    } catch (e) { res.status(503).json({ status: 'degraded', error: e.message }); }
  });
  app.get('/metrics', (req, res) => {
    const m = {
      users: q.get('SELECT COUNT(*) c FROM users').c,
      listings: q.get('SELECT COUNT(*) c FROM listings').c,
      orders: q.get('SELECT COUNT(*) c FROM orders').c,
      requests: q.get('SELECT COUNT(*) c FROM buy_requests').c,
    };
    res.type('text/plain').send(Object.entries(m).map(([k, v]) => `mydan_${k}_total ${v}`).join('\n'));
  });

  /* ---- 404 / 500 ---- */
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'not_found' });
    res.status(404).render('errors/404', { title: '404' });
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', req.method, req.originalUrl, '\n', err && err.stack ? err.stack : err);
    try { H.track('server_error', { target_type: 'route', payload: { url: req.originalUrl, msg: String(err && err.message) }, req }); } catch (_) {}
    if (req.path.startsWith('/api/')) return res.status(500).json({ ok: false, error: 'server_error' });
    res.status(500).render('errors/500', { title: '500', err: process.env.NODE_ENV === 'production' ? null : err });
  });

  return app;
}

module.exports = { createApp };

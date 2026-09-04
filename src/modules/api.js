/** JSON API v1 — used by the client for bookmarks, chat polling, live search, notifications. */
const express = require('express');
const { q } = require('../db');
const H = require('../lib/helpers');
const { requireAuth } = require('../middleware/context');

const r = express.Router();
r.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const need = (req, res) => {
  if (!req.user) { res.status(401).json({ ok: false, error: 'unauthenticated' }); return false; }
  return true;
};

r.post('/bookmarks/toggle', (req, res) => {
  if (!need(req, res)) return;
  const { type = 'listing', id } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });
  const ex = q.get('SELECT * FROM bookmarks WHERE user_id=? AND target_type=? AND target_id=?', [req.user.id, type, id]);
  if (ex) { q.run('DELETE FROM bookmarks WHERE id=?', [ex.id]); return res.json({ ok: true, saved: false }); }
  q.run('INSERT INTO bookmarks (user_id,target_type,target_id) VALUES (?,?,?)', [req.user.id, type, id]);
  H.track('bookmark_add', { actor_id: req.user.id, target_type: type, target_id: id, req });
  res.json({ ok: true, saved: true });
});

r.get('/messages/:id', (req, res) => {
  if (!need(req, res)) return;
  const c = q.get('SELECT * FROM conversations WHERE id=? AND (a_id=? OR b_id=?)', [req.params.id, req.user.id, req.user.id]);
  if (!c) return res.status(404).json({ ok: false });
  const after = parseInt(req.query.after || 0, 10) || 0;
  const rows = q.all(
    `SELECT m.*, u.display_name sender_name, u.avatar sender_avatar FROM messages m
     JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=? AND m.id>? ORDER BY m.id`, [c.id, after]);
  q.run("UPDATE messages SET read_at=datetime('now') WHERE conversation_id=? AND sender_id!=? AND read_at IS NULL", [c.id, req.user.id]);
  res.json({ ok: true, messages: rows.map((m) => ({
    id: m.id, body: m.body, mine: m.sender_id === req.user.id, sender: m.sender_name,
    avatar: m.sender_avatar, attachment: m.attachment, created_at: m.created_at })) });
});

r.get('/suggest', (req, res) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 2) return res.json({ ok: true, items: [] });
  const like = `%${term}%`;
  const items = [
    ...q.all(`SELECT id,slug,title FROM listings WHERE status='approved' AND title LIKE ? LIMIT 6`, [like])
      .map((x) => ({ kind: 'product', label: x.title, url: '/product/' + (x.slug || x.id) })),
    ...q.all(`SELECT slug,name_fa,name_en FROM categories WHERE status='active' AND (name_fa LIKE ? OR name_en LIKE ?) LIMIT 4`, [like, like])
      .map((x) => ({ kind: 'category', label: res.locals.pick(x, 'name'), url: '/category/' + x.slug })),
    ...q.all(`SELECT u.id, COALESCE(pr.business_name,u.display_name) nm FROM users u LEFT JOIN profiles pr ON pr.user_id=u.id
       WHERE u.status='active' AND (u.display_name LIKE ? OR pr.business_name LIKE ?) LIMIT 4`, [like, like])
      .map((x) => ({ kind: 'supplier', label: x.nm, url: '/u/' + x.id })),
  ];
  res.json({ ok: true, items });
});

r.get('/notifications', (req, res) => {
  if (!need(req, res)) return;
  res.json({ ok: true,
    unread: q.get('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL', [req.user.id]).c,
    items: q.all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 10', [req.user.id]) });
});

r.post('/notifications/read', (req, res) => {
  if (!need(req, res)) return;
  q.run("UPDATE notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL", [req.user.id]);
  res.json({ ok: true });
});

r.post('/track', (req, res) => {
  const { name, target_type, target_id } = req.body || {};
  if (!name) return res.status(400).json({ ok: false });
  H.track(String(name).slice(0, 60), { actor_id: req.user ? req.user.id : null, target_type, target_id, req });
  res.json({ ok: true });
});

r.get('/categories', (req, res) => {
  const parent = req.query.parent ? Number(req.query.parent) : null;
  res.json({ ok: true, items: parent
    ? q.all("SELECT id,slug,name_fa,name_en FROM categories WHERE parent_id=? AND status='active' ORDER BY sort_order", [parent])
    : q.all("SELECT id,slug,name_fa,name_en FROM categories WHERE parent_id IS NULL AND status='active' ORDER BY sort_order") });
});

r.get('/attributes', (req, res) => {
  const cat = Number(req.query.category || 0);
  res.json({ ok: true, items: cat ? q.all('SELECT * FROM attributes WHERE category_id=? ORDER BY sort_order', [cat]) : [] });
});

r.get('/docs', (req, res) => {
  res.json({
    name: 'Mydan API', version: '1.0.0', base: '/api/v1',
    auth: 'session cookie (same-origin)',
    endpoints: [
      { method: 'POST', path: '/bookmarks/toggle', body: { type: 'listing|user|request', id: 'number' }, auth: true },
      { method: 'GET', path: '/messages/:id?after=<messageId>', auth: true },
      { method: 'GET', path: '/suggest?q=<term>', auth: false },
      { method: 'GET', path: '/notifications', auth: true },
      { method: 'POST', path: '/notifications/read', auth: true },
      { method: 'POST', path: '/track', body: { name: 'string', target_type: 'string', target_id: 'number' }, auth: false },
      { method: 'GET', path: '/categories?parent=<id>', auth: false },
      { method: 'GET', path: '/attributes?category=<id>', auth: false },
      { method: 'GET', path: '/health', auth: false },
    ],
  });
});

r.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

r.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

module.exports = r;

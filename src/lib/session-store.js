/**
 * Session store backed by the same WASM SQLite database — MOBILE EDITION.
 *
 * Replaces `connect-sqlite3`, which depends on the native `sqlite3` addon and would
 * need a C++ toolchain on the phone. Sessions live in a `sessions` table, so logins
 * survive an app restart exactly as they do on the desktop build.
 */
const session = require('express-session');
const { q } = require('../db');

const Store = session.Store;

class SqliteWasmStore extends Store {
  constructor(opts = {}) {
    super(opts);
    this.ttl = opts.ttl || 60 * 60 * 24 * 30; // seconds
    q.run(`CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expire INTEGER NOT NULL
    )`);
    q.run('CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire)');
    this.reap();
    // Drop expired rows hourly; unref so it never holds the process open.
    this.timer = setInterval(() => this.reap(), 60 * 60 * 1000);
    if (this.timer.unref) this.timer.unref();
  }

  reap() {
    try { q.run('DELETE FROM sessions WHERE expire < ?', [Date.now()]); } catch (_) {}
  }

  expiryOf(sess) {
    const ms = sess && sess.cookie && sess.cookie.maxAge;
    return Date.now() + (ms || this.ttl * 1000);
  }

  get(sid, cb) {
    try {
      const row = q.get('SELECT sess, expire FROM sessions WHERE sid=?', [sid]);
      if (!row) return cb(null, null);
      if (row.expire < Date.now()) {
        q.run('DELETE FROM sessions WHERE sid=?', [sid]);
        return cb(null, null);
      }
      return cb(null, JSON.parse(row.sess));
    } catch (e) { return cb(e); }
  }

  set(sid, sess, cb) {
    try {
      q.run(
        `INSERT INTO sessions (sid, sess, expire) VALUES (?,?,?)
         ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expire=excluded.expire`,
        [sid, JSON.stringify(sess), this.expiryOf(sess)]
      );
      return cb && cb(null);
    } catch (e) { return cb && cb(e); }
  }

  destroy(sid, cb) {
    try {
      q.run('DELETE FROM sessions WHERE sid=?', [sid]);
      return cb && cb(null);
    } catch (e) { return cb && cb(e); }
  }

  touch(sid, sess, cb) {
    try {
      q.run('UPDATE sessions SET expire=? WHERE sid=?', [this.expiryOf(sess), sid]);
      return cb && cb(null);
    } catch (e) { return cb && cb(e); }
  }

  length(cb) {
    try { return cb(null, q.get('SELECT COUNT(*) c FROM sessions').c); } catch (e) { return cb(e); }
  }

  clear(cb) {
    try { q.run('DELETE FROM sessions'); return cb && cb(null); } catch (e) { return cb && cb(e); }
  }
}

module.exports = SqliteWasmStore;

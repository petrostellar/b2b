/**
 * Database gateway — MOBILE EDITION.
 *
 * Driver: node-sqlite3-wasm (SQLite compiled to WebAssembly, zero native code).
 * This is the only file that knows which driver is in use; every module, route and
 * view talks to the `q.all / q.get / q.run / q.tx` API below.
 *
 * Why WASM here: the desktop build uses better-sqlite3, which is a native addon and
 * must be compiled with a C++ toolchain at install time. On a phone (Termux) that is
 * slow at best and usually fails outright. The WASM build is pure JavaScript, installs
 * in seconds on any CPU, and runs the same SQLite engine with the same SQL.
 *
 * Trade-off: WASM SQLite is meaningfully slower than the native addon. For a personal
 * instance on a handset that is irrelevant; for a production server, use the desktop
 * build (../../mydan) instead.
 */
const fs = require('fs');
const path = require('path');
const { Database } = require('node-sqlite3-wasm');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'mydan.sqlite');
const db = new Database(DB_PATH);

db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA busy_timeout = 5000');

function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
}

/**
 * node-sqlite3-wasm rejects `undefined` and JS booleans as bound parameters, whereas
 * better-sqlite3 tolerates them. Normalise so the shared application code — written
 * against the desktop driver — runs unmodified on both.
 */
function norm(params) {
  if (!Array.isArray(params)) return params;
  return params.map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number' && !Number.isFinite(v)) return null;
    return v;
  });
}

const q = {
  all: (sql, params = []) => db.all(sql, norm(params)),
  get: (sql, params = []) => {
    const r = db.get(sql, norm(params));
    return r === undefined ? undefined : r;
  },
  run: (sql, params = []) => db.run(sql, norm(params)),
  /** Mirrors better-sqlite3's `tx(fn)` — returns a callable that runs inside a transaction. */
  tx: (fn) => (...args) => {
    db.run('BEGIN');
    try {
      const out = fn(...args);
      db.run('COMMIT');
      return out;
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (_) { /* already unwound */ }
      throw e;
    }
  },
};

process.on('exit', () => { try { db.close(); } catch (_) {} });

module.exports = { db, q, migrate, DB_PATH };

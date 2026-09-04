/**
 * Production entrypoint for hosted deployments (Railway / Render / Fly).
 *
 * Hosts run `npm start` on a fresh container with no database file, so the schema and
 * demo data must be created on first boot. The seeder registers a process-exit hook
 * that closes the shared SQLite handle, so it CANNOT simply be require()d here — doing
 * so leaves the server with an already-closed database. Run it as a child process
 * instead, then start the server once it has finished.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dbFile = path.join(__dirname, 'data', 'mydan.sqlite');

if (!fs.existsSync(dbFile)) {
  console.log('No database found — seeding for first run...');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'src', 'db', 'seed.js')], {
    stdio: 'inherit',
    cwd: __dirname,
  });
  if (r.status !== 0) {
    console.error('Seeding failed; aborting startup.');
    process.exit(1);
  }
  console.log('Seed complete.');
}

require('./server.js');

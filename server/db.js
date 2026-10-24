// Tiny JSON-file database. Good for a single-server deployment; swap for Postgres to scale out.
const fs = require('fs');
const path = require('path');
const { DATA, mkdirp } = require('./util');

mkdirp(DATA);
const FILE = path.join(DATA, 'db.json');

const empty = { users: [], sessions: [], projects: [], deployments: [], events: [] };
let db = { ...empty };
try { db = { ...empty, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* first run */ }

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
function flush() {
  clearTimeout(timer);
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}
process.on('exit', () => { try { flush(); } catch { /* ignore */ } });

module.exports = { db: () => db, save, flush };

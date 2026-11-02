// Tiny JSON-file database. Good for a single-server deployment; swap for Postgres to scale out.
// Secrets (Git tokens, environment-variable values) are encrypted on disk with AES-256-GCM
// when SHIPSTACK_SECRET_KEY is set, so a copied db.json does not reveal them.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA, mkdirp } = require('./util');

mkdirp(DATA);
try { fs.chmodSync(DATA, 0o700); } catch { /* not supported on this filesystem */ }
const FILE = path.join(DATA, 'db.json');

const KEY = process.env.SHIPSTACK_SECRET_KEY ? crypto.createHash('sha256').update(process.env.SHIPSTACK_SECRET_KEY).digest() : null;
const PREFIX = 'enc:v1:';

function encrypt(value) {
  if (!KEY || value == null || String(value).startsWith(PREFIX)) return value;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}
function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  if (!KEY) throw new Error('db.json contains encrypted secrets but SHIPSTACK_SECRET_KEY is not set');
  const b = Buffer.from(value.slice(PREFIX.length), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
function mapSecrets(data, fn) {
  for (const p of data.projects || []) {
    if (p.source && p.source.token) p.source.token = fn(p.source.token);
    if (p.env) for (const k of Object.keys(p.env)) p.env[k] = fn(p.env[k]);
  }
  return data;
}

const empty = { users: [], sessions: [], projects: [], deployments: [], events: [] };
let db = { ...empty };
let raw = null;
try { raw = fs.readFileSync(FILE, 'utf8'); } catch { /* first run */ }
if (raw) db = mapSecrets({ ...empty, ...JSON.parse(raw) }, decrypt); // a wrong or missing key stops start-up instead of losing data

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
function flush() {
  clearTimeout(timer);
  const tmp = FILE + '.tmp';
  const onDisk = mapSecrets(JSON.parse(JSON.stringify(db)), encrypt);
  fs.writeFileSync(tmp, JSON.stringify(onDisk), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}
process.on('exit', () => { try { flush(); } catch { /* ignore */ } });

module.exports = { db: () => db, save, flush, encrypted: !!KEY };

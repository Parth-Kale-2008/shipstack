// ShipStack – DevOps deployment service for small web projects.
// HTTP API + dashboard + accounts + live streams + webhook triggers + subdomain routing.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, DATA, iso, id, lanIp, mkdirp } = require('./util');
const { db, save } = require('./db');
const runtime = require('./runtime');
const proxy = require('./proxy');
const core = require('./core');

const PORT = core.PORT;
const HOST = process.env.HOST || '0.0.0.0';
const PUB = path.join(ROOT, 'public');
const LAN = lanIp();
const MAX_ZIP = 250 * 1024 * 1024;
const VERSION = require('../package.json').version;
const SECURE = /^https:/.test(process.env.SHIPSTACK_PUBLIC_URL || '') ? '; Secure' : '';
// Behind Caddy/nginx every request comes from 127.0.0.1, so read the client IP from X-Forwarded-For.
const clientIp = (req) => (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress);

/* ---------------- auth ---------------- */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((c) => { const i = c.indexOf('='); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}
function currentUser(req) {
  const t = cookies(req).ss_session;
  if (!t) return null;
  const s = db().sessions.find((x) => x.hash === sha(t));
  if (!s || s.expires < Date.now()) return null;
  return db().users.find((u) => u.id === s.userId) || null;
}
function startSession(res, user) {
  const t = crypto.randomBytes(32).toString('base64url');
  db().sessions = db().sessions.filter((s) => s.expires > Date.now());
  db().sessions.push({ hash: sha(t), userId: user.id, expires: Date.now() + 30 * 864e5 });
  save();
  res.setHeader('Set-Cookie', `ss_session=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${SECURE}`);
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt });
const attempts = new Map(); // ip -> { n, until }
function throttled(ip) { const a = attempts.get(ip); return a && a.n >= 10 && a.until > Date.now(); }
function failed(ip) { const a = attempts.get(ip) || { n: 0, until: 0 }; if (a.until < Date.now()) a.n = 0; a.n++; a.until = Date.now() + 15 * 60000; attempts.set(ip, a); }

/* ---------------- helpers ---------------- */
function send(res, code, data) {
  const text = typeof data === 'string';
  res.writeHead(code, { 'Content-Type': text ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store' });
  res.end(text ? data : JSON.stringify(data));
}
function readJson(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(core.httpErr('Request body too large', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(core.httpErr('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function sse(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(': connected\n\n');
  const beat = setInterval(() => res.write(': ping\n\n'), 25000);
  const offs = [];
  req.on('close', () => { clearInterval(beat); offs.forEach((f) => f()); });
  return {
    send: (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
    on: (ev, fn) => { core.bus.on(ev, fn); offs.push(() => core.bus.off(ev, fn)); },
    close: () => res.end(),
  };
}
function owned(user, pid) {
  const p = core.getProject(pid);
  if (!p || p.ownerId !== user.id) throw core.httpErr('Project not found', 404);
  return p;
}
const baseUrl = (req) => (process.env.SHIPSTACK_PUBLIC_URL || `http://${req.headers.host || `localhost:${PORT}`}`).replace(/\/$/, '');
const MIME = { '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

/* ---------------- API ---------------- */
async function api(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  const ip = clientIp(req);
  let m;

  // Webhook / deploy hook (token-authenticated, no session).
  if ((m = /^\/api\/hooks\/(\w+)$/.exec(p)) && method === 'POST') {
    const proj = core.getProject(m[1]);
    const tok = url.searchParams.get('token') || '';
    if (!proj || !proj.hookToken || tok.length !== proj.hookToken.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(proj.hookToken))) return send(res, 404, { error: 'Unknown hook' });
    if (req.headers['x-github-event'] === 'ping') return send(res, 200, { ok: true, pong: true });
    const body = await readJson(req, 5e6).catch(() => ({}));
    if (body.ref && proj.source.branch && body.ref !== `refs/heads/${proj.source.branch}`) return send(res, 200, { ok: true, skipped: `push to ${body.ref} ignored` });
    if (core.busy.has(proj.id)) return send(res, 409, { error: 'A deployment is already running' });
    core.addEvent(proj.id, 'info', `Deploy hook called${req.headers['x-github-event'] ? ' by GitHub (push)' : ''}`);
    const d = core.createDeployment(proj, { trigger: req.headers['x-github-event'] ? 'git push' : 'webhook' });
    return send(res, 202, { ok: true, deployment: d.number });
  }

  // CSRF guard: state-changing requests must carry our custom header (cannot be sent cross-site without CORS).
  if (method !== 'GET' && req.headers['x-requested-with'] !== 'ShipStack') return send(res, 403, { error: 'Missing X-Requested-With header' });

  if (p === '/api/auth/signup' && method === 'POST') {
    if (process.env.ALLOW_SIGNUP === 'false') return send(res, 403, { error: 'Sign-ups are closed on this server' });
    const b = await readJson(req);
    const email = String(b.email || '').trim().toLowerCase();
    const name = String(b.name || '').trim().slice(0, 60);
    const pw = String(b.password || '');
    if (!name) return send(res, 400, { error: 'Enter your name' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email address' });
    if (pw.length < 8) return send(res, 400, { error: 'Password must be at least 8 characters' });
    if (db().users.some((u) => u.email === email)) return send(res, 409, { error: 'An account with this email already exists. Log in instead.' });
    const user = { id: id(4), name, email, password: hashPassword(pw), createdAt: iso() };
    db().users.push(user); save();
    startSession(res, user);
    return send(res, 201, { user: publicUser(user) });
  }
  if (p === '/api/auth/login' && method === 'POST') {
    if (throttled(ip)) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    const b = await readJson(req);
    const user = db().users.find((u) => u.email === String(b.email || '').trim().toLowerCase());
    if (!user || !checkPassword(String(b.password || ''), user.password)) { failed(ip); return send(res, 401, { error: 'Email or password is incorrect' }); }
    attempts.delete(ip);
    startSession(res, user);
    return send(res, 200, { user: publicUser(user) });
  }
  if (p === '/api/auth/logout' && method === 'POST') {
    const t = cookies(req).ss_session;
    if (t) { db().sessions = db().sessions.filter((s) => s.hash !== sha(t)); save(); }
    res.setHeader('Set-Cookie', `ss_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE}`);
    return send(res, 200, { ok: true });
  }

  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Please log in' });
  if (p === '/api/auth/me') return send(res, 200, { user: publicUser(user) });
  if (p === '/api/auth/password' && method === 'POST') {
    const b = await readJson(req);
    if (!checkPassword(String(b.current || ''), user.password)) return send(res, 400, { error: 'Current password is incorrect' });
    if (String(b.password || '').length < 8) return send(res, 400, { error: 'New password must be at least 8 characters' });
    user.password = hashPassword(String(b.password)); save();
    return send(res, 200, { ok: true });
  }

  if (p === '/api/system') {
    const mine = core.projects().filter((x) => x.ownerId === user.id);
    const ids = new Set(mine.map((x) => x.id));
    const deps = db().deployments.filter((d) => ids.has(d.projectId));
    return send(res, 200, {
      version: VERSION, mode: runtime.mode(), dockerVersion: runtime.info.dockerVersion, platform: process.platform, git: runtime.info.git,
      tunnels: core.APP_DOMAIN ? { cloudflared: false, ssh: false } : { ...core.tunnel.avail }, domain: core.APP_DOMAIN || null, port: PORT, lan: core.APP_DOMAIN ? null : LAN, plans: core.PLANS, user: publicUser(user),
      stats: { projects: mine.length, live: mine.filter((x) => x.status === 'live').length, deployments: deps.length, successful: deps.filter((d) => d.status === 'success').length, failed: deps.filter((d) => d.status === 'failed').length },
    });
  }
  if (p === '/api/samples') return send(res, 200, core.SAMPLES);

  if (p === '/api/projects' && method === 'GET') {
    return send(res, 200, core.projects().filter((x) => x.ownerId === user.id).map((x) => core.view(x, false, baseUrl(req), LAN)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
  }
  if (p === '/api/projects' && method === 'POST') {
    const { p: proj, d } = await core.createProject(user, await readJson(req));
    return send(res, 201, { project: core.view(proj, false, baseUrl(req), LAN), deployment: core.brief(d) });
  }

  if ((m = /^\/api\/projects\/(\w+)(?:\/([\w-]+))?(?:\/(\w+))?$/.exec(p))) {
    const proj = owned(user, m[1]);
    const act = m[2];
    const full = () => core.view(proj, true, baseUrl(req), LAN);
    if (!act && method === 'GET') return send(res, 200, full());
    if (!act && method === 'PATCH') { core.updateProject(proj, await readJson(req)); return send(res, 200, full()); }
    if (!act && method === 'DELETE') { await core.deleteProject(proj); return send(res, 200, { ok: true }); }
    if (act === 'deploy' && method === 'POST') return send(res, 200, { deployment: core.brief(core.createDeployment(proj, { trigger: 'manual' })) });
    if (act === 'rollback' && method === 'POST') return send(res, 200, { deployment: core.brief(core.createDeployment(proj, { trigger: 'rollback', rollbackOf: m[3] })) });
    if (act === 'stop' && method === 'POST') { await core.stopProject(proj); return send(res, 200, core.view(proj, false, baseUrl(req), LAN)); }
    if (act === 'start' && method === 'POST') { await core.startProject(proj); return send(res, 200, { project: core.view(proj, false, baseUrl(req), LAN), deployment: null }); }
    if (act === 'restart' && method === 'POST') { await core.restartProject(proj); return send(res, 200, core.view(proj, false, baseUrl(req), LAN)); }
    if (act === 'public' && method === 'POST') {
      const b = await readJson(req);
      core.updateProject(proj, { services: { publicUrl: !!b.enabled } });
      if (b.enabled) { if (proj.status !== 'live') throw core.httpErr('Deploy the app first'); await core.openPublic(proj); if (!core.tunnel.get(proj.id)) throw core.httpErr(core.tunnel.avail.cloudflared || core.tunnel.avail.ssh ? 'The tunnel did not start – check your internet connection' : 'Install cloudflared to get public URLs (winget install Cloudflare.cloudflared)'); }
      return send(res, 200, core.view(proj, false, baseUrl(req), LAN));
    }
    if (act === 'logs' && method === 'GET') return send(res, 200, await core.appLogs(proj, Math.min(2000, +url.searchParams.get('tail') || 300)));
    if (act === 'archive' && method === 'PUT') {
      if (proj.source.type !== 'zip') throw core.httpErr('This project does not deploy from a ZIP');
      const len = +req.headers['content-length'] || 0;
      if (len > MAX_ZIP) throw core.httpErr('ZIP is larger than 250 MB', 413);
      mkdirp(path.join(DATA, 'uploads'));
      const dest = path.join(DATA, 'uploads', proj.id + '.zip');
      await new Promise((resolve, reject) => {
        let size = 0;
        const out = fs.createWriteStream(dest + '.tmp');
        req.on('data', (c) => { size += c.length; if (size > MAX_ZIP) { req.destroy(); out.destroy(); reject(core.httpErr('ZIP is larger than 250 MB', 413)); } });
        req.pipe(out);
        out.on('finish', resolve); out.on('error', reject); req.on('error', reject);
      });
      fs.renameSync(dest + '.tmp', dest);
      const name = String(req.headers['x-file-name'] || 'upload.zip').replace(/[^\w.\- ]/g, '').slice(0, 120);
      proj.source.fileName = name; save();
      return send(res, 200, { deployment: core.brief(core.createDeployment(proj, { trigger: 'upload' })) });
    }
    throw core.httpErr('Not found', 404);
  }

  if ((m = /^\/api\/deployments\/(\w+)(\/stream)?$/.exec(p))) {
    const d = core.getDep(m[1]);
    if (!d) throw core.httpErr('Deployment not found', 404);
    owned(user, d.projectId);
    if (!m[2]) return send(res, 200, { ...core.brief(d), files: d.files || {}, projectId: d.projectId });
    const s = sse(req, res);
    s.send('stages', d.stages);
    core.getLogs(d.id).forEach((e) => s.send('log', e));
    s.send('status', { status: d.status, error: d.error });
    if (d.status === 'success' || d.status === 'failed') { s.send('end', {}); return; }
    s.on('log:' + d.id, (e) => s.send('log', e));
    s.on('stage:' + d.id, (st) => s.send('stages', st));
    s.on('status:' + d.id, (st) => { s.send('status', st); s.send('end', {}); });
    return;
  }

  if (p === '/api/events') {
    const s = sse(req, res);
    s.on('change', (c) => { if (c.ownerId === user.id) s.send('change', [c.id]); });
    return;
  }
  throw core.httpErr('Not found', 404);
}

/* ---------------- server ---------------- */
// Public site: "/" is the landing page (logged-in users go straight to the dashboard), "/app" is the dashboard.
const PAGES = { '/': 'landing.html', '/app': 'index.html', '/app/': 'index.html', '/legal': 'legal.html' };
function serveStatic(req, res, url) {
  if (url.pathname === '/' && currentUser(req)) { res.writeHead(302, { Location: '/app' }); return res.end(); }
  const page = PAGES[url.pathname];
  let file = path.normalize(path.join(PUB, page || decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUB + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) {
      const pg = proxy.page('Page not found', 'Go back to <a href="/" style="color:#ff8f61">shipzo.tech</a>.', 404);
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      return res.end(pg.html);
    }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.png' ? 'public, max-age=86400' : 'no-cache' });
    res.end(buf);
  });
}
// <slug>.localhost locally, <slug>.<APP_DOMAIN> in production. Returns undefined for the dashboard host.
function slugForHost(req) {
  const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  let m = /^([a-z0-9-]+)\.localhost$/.exec(host);
  if (!m && core.APP_DOMAIN && host.endsWith('.' + core.APP_DOMAIN)) m = /^([a-z0-9-]+)$/.exec(host.slice(0, -core.APP_DOMAIN.length - 1));
  return m && m[1] !== 'www' ? m[1] : undefined;
}
function appForHost(req) {
  const slug = slugForHost(req);
  return slug ? core.projects().find((p) => p.slug === slug) || null : undefined;
}

const server = http.createServer(async (req, res) => {
  const app = appForHost(req);
  if (app) return proxy.handle(app.id, req, res);
  if (app === null) { const pg = proxy.page('App not found', 'No ShipStack project lives at this address.', 404); res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pg.html); }
  // Caddy asks this before issuing an on-demand HTTPS certificate, so certificates are only made for real hosts.
  if (req.url.startsWith('/internal/tls-check')) {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const d = new URL(req.url, 'http://x').searchParams.get('domain') || '';
    const ok = local && core.APP_DOMAIN && (d === core.APP_DOMAIN || d === 'www.' + core.APP_DOMAIN || (d.endsWith('.' + core.APP_DOMAIN) && core.projects().some((p) => `${p.slug}.${core.APP_DOMAIN}` === d)));
    res.writeHead(ok ? 200 : 404); return res.end();
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
  try { await api(req, res, url); } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong on the server' });
    if (!e.status) console.error('[api]', req.method, url.pathname, e);
  }
});
server.on('upgrade', (req, socket, head) => { const app = appForHost(req); if (app) proxy.upgrade(app.id, req, socket, head); else socket.destroy(); });
async function main() {
  console.log('ShipStack starting…');
  if (!(await require('./util').portFree(PORT))) {
    console.error(`\n  Port ${PORT} is already in use by another program. Start ShipStack on another port, e.g.\n    PowerShell:  $env:PORT=8090; npm start\n    bash:        PORT=8090 npm start\n`);
    process.exit(1);
  }
  await runtime.probeTools();
  await core.tunnel.detectTunnels();
  console.log(`  runtime : ${runtime.mode()}${runtime.info.docker ? ` (Docker ${runtime.info.dockerVersion})` : ' (Docker not available – apps run as native processes)'}`);
  console.log(`  git     : ${runtime.info.git || 'NOT FOUND – GitHub deploys will fail'}`);
  console.log(`  python  : ${runtime.info.python || 'not found'}   tunnels: ${Object.entries(core.tunnel.avail).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`);
  console.log(`  data    : ${DATA}`);
  await core.restore();
  core.startLoops();
  server.listen(PORT, HOST, () => console.log(`\n  ShipStack dashboard → http://localhost:${PORT}   (LAN: http://${LAN}:${PORT})\n`));
}
main().catch((e) => { console.error(e); process.exit(1); });
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

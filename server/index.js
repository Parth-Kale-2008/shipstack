// ShipStack – DevOps deployment service for small web projects.
// HTTP API + dashboard + accounts + live streams + webhook triggers + subdomain routing.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, DATA, lanIp, mkdirp } = require('./util');
const { db, save } = require('./db');
const runtime = require('./runtime');
const proxy = require('./proxy');
const core = require('./core');
const accounts = require('./accounts');

const PORT = core.PORT;
const HOST = process.env.HOST || '0.0.0.0';
const PUB = path.join(ROOT, 'public');
const LAN = lanIp();
const MAX_ZIP = 250 * 1024 * 1024;
const VERSION = require('../package.json').version;
// Only our own scripts, styles and Google Fonts may load on platform pages; no framing, no form posts elsewhere.
const CSP = ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: https:", "connect-src 'self'", "object-src 'none'",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');
const SECURE = /^https:/.test(process.env.SHIPSTACK_PUBLIC_URL || '') ? '; Secure' : '';
// Behind Caddy/nginx every request comes from 127.0.0.1, so read the client IP from X-Forwarded-For.
const clientIp = (req) => (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress);

/* ---------------- auth ---------------- */
function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((c) => { const i = c.indexOf('='); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}
const sessionToken = (req) => cookies(req).ss_session;
const currentUser = (req) => accounts.sessionUser(sessionToken(req));
const setSession = (res, token) => res.setHeader('Set-Cookie', `ss_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${SECURE}`);
const clearSession = (res) => res.setHeader('Set-Cookie', `ss_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE}`);
const attempts = new Map(); // ip -> { n, until }
const accountFails = new Map(); // email -> { n, until }: stops password guessing spread across many IPs
function accountLocked(email) { const a = accountFails.get(email); return a && a.n >= 10 && a.until > Date.now(); }
function accountFailed(email) { const a = accountFails.get(email) || { n: 0, until: 0 }; if (a.until < Date.now()) a.n = 0; a.n++; a.until = Date.now() + 15 * 60000; accountFails.set(email, a); }

// Sliding-window limiter: limit('api:' + ip, 1200, 5 * 60000) → true when over the limit.
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => t > now - windowMs);
  arr.push(now);
  buckets.set(key, arr);
  return arr.length > max;
}
setInterval(() => { const cut = Date.now() - 3600e3; for (const [k, v] of buckets) if (!v.length || v[v.length - 1] < cut) buckets.delete(k); }, 10 * 60000).unref();
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
const MIME = { '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

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
    if (limited('hook:' + proj.id, 30, 3600e3)) return send(res, 429, { error: 'Too many deploy hooks for this project. Try again later.' });
    const d = core.createDeployment(proj, { trigger: req.headers['x-github-event'] ? 'git push' : 'webhook' });
    return send(res, 202, { ok: true, deployment: d.number });
  }

  // CSRF guard: state-changing requests must carry our custom header (cannot be sent cross-site without CORS).
  if (method !== 'GET' && req.headers['x-requested-with'] !== 'ShipStack') return send(res, 403, { error: 'Missing X-Requested-With header' });

  const ua = req.headers['user-agent'];
  if (p === '/api/auth/signup' && method === 'POST') {
    const user = accounts.signup(await readJson(req), ip, ua);
    setSession(res, accounts.newSession(user, ip, ua));
    return send(res, 201, { user: accounts.publicUser(user) });
  }
  if (p === '/api/auth/login' && method === 'POST') {
    if (throttled(ip)) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    const b = await readJson(req);
    const loginEmail = String(b.email || '').trim().toLowerCase();
    if (accountLocked(loginEmail)) return send(res, 429, { error: 'Too many failed attempts on this account. Try again in 15 minutes.' });
    const user = db().users.find((u) => u.email === String(b.email || '').trim().toLowerCase());
    if (!user || !accounts.checkPassword(String(b.password || ''), user.password)) { failed(ip); accountFailed(loginEmail); return send(res, 401, { error: 'Email or password is incorrect' }); }
    if (user.status === 'suspended') return send(res, 403, { error: 'This account has been suspended. Contact support if you think this is a mistake.' });
    attempts.delete(ip);
    accountFails.delete(loginEmail);
    accounts.recordLogin(user, ip, ua);
    setSession(res, accounts.newSession(user, ip, ua));
    return send(res, 200, { user: accounts.publicUser(user), mustChangePassword: !!user.mustChangePassword });
  }
  if (p === '/api/auth/logout' && method === 'POST') {
    accounts.endSession(sessionToken(req));
    clearSession(res);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/auth/status' && method === 'GET') return send(res, 200, { signupOpen: accounts.settings().signupOpen });

  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Please log in' });
  if (p === '/api/auth/me') return send(res, 200, { user: accounts.publicUser(user), mustChangePassword: !!user.mustChangePassword });

  /* ----- the signed-in user's own account ----- */
  if (p === '/api/account' && method === 'GET') {
    return send(res, 200, { user: accounts.publicUser(user), usage: { projects: accounts.projectsOf(user).length, maxProjects: accounts.maxProjectsFor(user) }, logins: (user.logins || []).slice(0, 8), mustChangePassword: !!user.mustChangePassword });
  }
  if (p === '/api/account' && method === 'PATCH') {
    const b = await readJson(req);
    if (b.name !== undefined) { const n = String(b.name).trim().replace(/\s+/g, ' ').slice(0, 60); if (n.length < 2) throw core.httpErr('Enter your full name'); user.name = n; }
    if (b.useCase !== undefined) user.useCase = accounts.USE_CASES.includes(b.useCase) ? b.useCase : null;
    save();
    return send(res, 200, { user: accounts.publicUser(user) });
  }
  if (p === '/api/account' && method === 'DELETE') {
    const b = await readJson(req);
    if (!accounts.checkPassword(String(b.password || ''), user.password)) throw core.httpErr('Password is incorrect');
    if (accounts.isAdmin(user)) throw core.httpErr('Admin accounts cannot be deleted from the app');
    await accounts.deleteUser(user);
    clearSession(res);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/auth/password' && method === 'POST') {
    const b = await readJson(req);
    if (!accounts.checkPassword(String(b.current || ''), user.password)) throw core.httpErr('Current password is incorrect');
    const problem = accounts.passwordProblem(b.password, user.email);
    if (problem) throw core.httpErr(problem);
    user.password = accounts.hashPassword(String(b.password));
    delete user.mustChangePassword;
    accounts.revokeSessions(user.id, sessionToken(req)); // sign out every other device
    return send(res, 200, { ok: true });
  }

  /* ----- admin back-office (404 for everyone else, so it is not discoverable) ----- */
  if (p.startsWith('/api/admin/')) {
    if (!accounts.isAdmin(user)) return send(res, 404, { error: 'Not found' });
    return adminApi(req, res, url, user);
  }

  if (p === '/api/system') {
    const mine = core.projects().filter((x) => x.ownerId === user.id);
    const ids = new Set(mine.map((x) => x.id));
    const deps = db().deployments.filter((d) => ids.has(d.projectId));
    return send(res, 200, {
      version: VERSION, mode: runtime.mode(), dockerVersion: runtime.info.dockerVersion, platform: process.platform, git: runtime.info.git,
      tunnels: core.APP_DOMAIN ? { cloudflared: false, ssh: false } : { ...core.tunnel.avail }, domain: core.APP_DOMAIN || null, port: PORT, lan: core.APP_DOMAIN ? null : LAN, plans: core.PLANS, user: accounts.publicUser(user),
      stats: { projects: mine.length, live: mine.filter((x) => x.status === 'live').length, deployments: deps.length, successful: deps.filter((d) => d.status === 'success').length, failed: deps.filter((d) => d.status === 'failed').length },
    });
  }
  if (p === '/api/samples') return send(res, 200, core.SAMPLES);

  if (p === '/api/projects' && method === 'GET') {
    return send(res, 200, core.projects().filter((x) => x.ownerId === user.id).map((x) => core.view(x, false, baseUrl(req), LAN)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
  }
  if (method === 'POST' && (p === '/api/projects' || /\/(deploy|rollback|archive)(\/|$)/.test(p)) && !accounts.isAdmin(user) && limited('deploy:' + user.id, 30, 3600e3)) {
    return send(res, 429, { error: 'You have started too many deployments in the last hour. Please wait a bit.' });
  }
  if (p === '/api/projects' && method === 'POST') {
    const { p: proj, d } = await core.createProject(user, await readJson(req), accounts.maxProjectsFor(user));
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

/* ---------------- admin API ---------------- */
async function adminApi(req, res, url, admin) {
  const p = url.pathname.replace('/api/admin', '');
  const method = req.method;
  let m;
  const findUser = (uid) => { const u = db().users.find((x) => x.id === uid); if (!u) throw core.httpErr('User not found', 404); return u; };
  const findProject = (pid) => { const pr = core.getProject(pid); if (!pr) throw core.httpErr('Project not found', 404); return pr; };

  if (p === '/overview') return send(res, 200, await accounts.overview());
  if (p === '/users' && method === 'GET') return send(res, 200, db().users.map(accounts.adminUser).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  if ((m = /^\/users\/(\w+)$/.exec(p)) && method === 'GET') {
    const u = findUser(m[1]);
    return send(res, 200, { ...accounts.adminUser(u), signupUa: u.signupUa || null, logins: u.logins || [], projectList: accounts.projectsOf(u).map(accounts.adminProject) });
  }
  if ((m = /^\/users\/(\w+)$/.exec(p)) && method === 'PATCH') {
    const u = findUser(m[1]);
    const b = await readJson(req);
    const changes = [];
    if (b.status !== undefined) {
      if (!['active', 'suspended'].includes(b.status)) throw core.httpErr('Unknown status');
      if (accounts.isAdmin(u)) throw core.httpErr('Admins cannot be suspended');
      u.status = b.status; changes.push(`status=${b.status}`);
      if (b.status === 'suspended') {
        accounts.revokeSessions(u.id);
        for (const pr of accounts.projectsOf(u)) if (pr.status === 'live') await core.stopProject(pr);
      }
    }
    if (b.maxProjects !== undefined) {
      if (b.maxProjects === null || b.maxProjects === '') { delete u.maxProjects; changes.push('limit=default'); }
      else { const n = Math.round(+b.maxProjects); if (!(n >= 0 && n <= 100)) throw core.httpErr('Project limit must be between 0 and 100'); u.maxProjects = n; changes.push(`limit=${n}`); }
    }
    if (b.name !== undefined) { const n = String(b.name).trim().slice(0, 60); if (n.length >= 2) { u.name = n; changes.push('name'); } }
    save();
    accounts.audit(admin, 'user.update', u.email, changes.join(', '));
    return send(res, 200, accounts.adminUser(u));
  }
  if ((m = /^\/users\/(\w+)\/reset-password$/.exec(p)) && method === 'POST') {
    const u = findUser(m[1]);
    const temp = accounts.temporaryPassword();
    u.password = accounts.hashPassword(temp);
    u.mustChangePassword = true;
    accounts.revokeSessions(u.id);
    save();
    accounts.audit(admin, 'user.reset_password', u.email);
    return send(res, 200, { temporaryPassword: temp });
  }
  if ((m = /^\/users\/(\w+)\/logout$/.exec(p)) && method === 'POST') {
    const u = findUser(m[1]);
    accounts.revokeSessions(u.id);
    accounts.audit(admin, 'user.sign_out_everywhere', u.email);
    return send(res, 200, { ok: true });
  }
  if ((m = /^\/users\/(\w+)$/.exec(p)) && method === 'DELETE') {
    const u = findUser(m[1]);
    if (accounts.isAdmin(u)) throw core.httpErr('Admins cannot be deleted');
    const n = accounts.projectsOf(u).length;
    await accounts.deleteUser(u);
    accounts.audit(admin, 'user.delete', u.email, `${n} project(s) removed`);
    return send(res, 200, { ok: true });
  }
  if (p === '/projects' && method === 'GET') return send(res, 200, core.projects().map(accounts.adminProject).sort((a, b) => (b.lastDeployedAt || b.createdAt).localeCompare(a.lastDeployedAt || a.createdAt)));
  if ((m = /^\/projects\/(\w+)\/(stop|start|redeploy)$/.exec(p)) && method === 'POST') {
    const pr = findProject(m[1]);
    if (m[2] === 'stop') await core.stopProject(pr);
    else if (m[2] === 'start') await core.startProject(pr, 'admin');
    else core.createDeployment(pr, { trigger: 'admin' });
    accounts.audit(admin, `project.${m[2]}`, pr.slug);
    return send(res, 200, accounts.adminProject(pr));
  }
  if ((m = /^\/projects\/(\w+)$/.exec(p)) && method === 'DELETE') {
    const pr = findProject(m[1]);
    await core.deleteProject(pr);
    accounts.audit(admin, 'project.delete', pr.slug);
    return send(res, 200, { ok: true });
  }
  if (p === '/deployments' && method === 'GET') {
    const deps = db().deployments.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60);
    return send(res, 200, deps.map((d) => { const pr = core.getProject(d.projectId) || {}; return { id: d.id, number: d.number, project: pr.slug || '(deleted)', status: d.status, trigger: d.trigger, stack: d.stack ? d.stack.framework : null, durationMs: d.durationMs || null, createdAt: d.createdAt, error: d.error || null }; }));
  }
  if (p === '/audit' && method === 'GET') return send(res, 200, (db().audit || []).slice(0, 200));
  if (p === '/settings' && method === 'PATCH') {
    const b = await readJson(req);
    const st = accounts.settings();
    if (b.signupOpen !== undefined) st.signupOpen = !!b.signupOpen;
    if (b.defaultMaxProjects !== undefined) { const n = Math.round(+b.defaultMaxProjects); if (!(n >= 1 && n <= 50)) throw core.httpErr('Default limit must be between 1 and 50'); st.defaultMaxProjects = n; }
    save();
    accounts.audit(admin, 'settings.update', 'platform', JSON.stringify(b));
    return send(res, 200, st);
  }
  throw core.httpErr('Not found', 404);
}

/* ---------------- server ---------------- */
// Public site: "/" is the landing page (logged-in users go straight to the dashboard), "/app" is the dashboard.
const PAGES = { '/': 'landing.html', '/app': 'index.html', '/app/': 'index.html', '/legal': 'legal.html', '/login': 'auth.html', '/signup': 'auth.html', '/admin': 'admin.html' };
function serveStatic(req, res, url) {
  const gated = ['/', '/login', '/signup', '/admin'].includes(url.pathname);
  const me = gated ? currentUser(req) : null;
  if (me && url.pathname !== '/admin') { res.writeHead(302, { Location: '/app' }); return res.end(); }
  if (url.pathname === '/admin' && !accounts.isAdmin(me)) { const pg = proxy.page('Page not found', 'Go back to <a href="/" style="color:#ff8f61">shipzo.tech</a>.', 404); res.writeHead(404, { 'Content-Type': MIME['.html'] }); return res.end(pg.html); }
  const page = PAGES[url.pathname];
  let rel = page || decodeURIComponent(url.pathname);
  // Clean URLs for content pages: /guides → guides/index.html, /guides/foo → guides/foo.html
  if (!page && !path.extname(rel)) rel = fs.existsSync(path.join(PUB, rel + '.html')) ? rel + '.html' : path.join(rel, 'index.html');
  let file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB + path.sep) || (!page && /^(admin|auth|landing|legal)\.html$/.test(path.basename(file)))) return send(res, 404, 'Not found');
  fs.readFile(file, (err, buf) => {
    if (err) {
      const pg = proxy.page('Page not found', 'Go back to <a href="/" style="color:#ff8f61">shipzo.tech</a>.', 404);
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      return res.end(pg.html);
    }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ['.png', '.ico', '.svg'].includes(ext) ? 'public, max-age=86400' : 'no-cache' });
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
  // One address for search engines: www.shipzo.tech/... → shipzo.tech/... (avoids duplicate pages in Google).
  const reqHost = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  if (core.APP_DOMAIN && reqHost === 'www.' + core.APP_DOMAIN) {
    res.writeHead(301, { Location: `https://${core.APP_DOMAIN}${req.url}` });
    return res.end();
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (req.url.startsWith('/api/') && !req.url.startsWith('/api/hooks/') && limited('api:' + clientIp(req), 1200, 5 * 60000)) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
    return res.end(JSON.stringify({ error: 'Too many requests. Slow down and try again in a minute.' }));
  }
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

// Accounts, sessions, user profiles and the admin back-office.
const crypto = require('crypto');
const os = require('os');
const { db, save } = require('./db');
const { DATA, id, iso, run } = require('./util');
const core = require('./core');
const runtime = require('./runtime');

// Admins are configured on the server (never through the app), e.g. ADMIN_EMAILS=you@example.com
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
const USE_CASES = ['student', 'developer', 'startup', 'agency', 'other'];
const SESSION_DAYS = 30;

/* ---------------- passwords & sessions ---------------- */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(String(pw), Buffer.from(salt, 'hex'), 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function passwordProblem(pw, email) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 200) return 'Password is too long';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use at least one letter and one number in your password';
  if (email && pw.toLowerCase().includes(String(email).split('@')[0].toLowerCase()) && String(email).split('@')[0].length > 3) return 'Your password should not contain your email name';
  return null;
}
function newSession(user, ip, ua) {
  const t = crypto.randomBytes(32).toString('base64url');
  db().sessions = db().sessions.filter((s) => s.expires > Date.now());
  db().sessions.push({ hash: sha(t), userId: user.id, expires: Date.now() + SESSION_DAYS * 864e5, createdAt: iso(), ip, ua: String(ua || '').slice(0, 200) });
  save();
  return t;
}
function sessionUser(token) {
  if (!token) return null;
  const s = db().sessions.find((x) => x.hash === sha(token));
  if (!s || s.expires < Date.now()) return null;
  const u = db().users.find((x) => x.id === s.userId);
  if (!u || u.status === 'suspended') return null;
  if (!u.lastSeenAt || Date.now() - Date.parse(u.lastSeenAt) > 5 * 60000) { u.lastSeenAt = iso(); save(); }
  return u;
}
function endSession(token) { if (token) { db().sessions = db().sessions.filter((s) => s.hash !== sha(token)); save(); } }
function revokeSessions(userId, keepToken) {
  const keep = keepToken ? sha(keepToken) : null;
  db().sessions = db().sessions.filter((s) => s.userId !== userId || s.hash === keep);
  save();
}

/* ---------------- users ---------------- */
const settings = () => {
  const d = db();
  if (!d.settings) d.settings = {};
  if (d.settings.signupOpen === undefined) d.settings.signupOpen = process.env.ALLOW_SIGNUP !== 'false';
  if (!d.settings.defaultMaxProjects) d.settings.defaultMaxProjects = +process.env.MAX_PROJECTS_PER_USER || 3;
  return d.settings;
};
const isAdmin = (u) => !!u && ADMIN_EMAILS.includes(u.email);
const maxProjectsFor = (u) => (isAdmin(u) ? 1000 : u.maxProjects || settings().defaultMaxProjects);
const projectsOf = (u) => core.projects().filter((p) => p.ownerId === u.id);
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, role: isAdmin(u) ? 'admin' : 'user', useCase: u.useCase || null, maxProjects: maxProjectsFor(u) });

function signup(b, ip, ua) {
  if (!settings().signupOpen) throw core.httpErr('Sign-ups are currently closed. Please check back soon.', 403);
  const recent = db().users.filter((u) => u.signupIp === ip && Date.now() - Date.parse(u.createdAt) < 3600e3).length;
  if (recent >= 5) throw core.httpErr('Too many accounts created from your network. Try again later.', 429);
  const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const email = String(b.email || '').trim().toLowerCase();
  if (name.length < 2) throw core.httpErr('Enter your full name');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw core.httpErr('Enter a valid email address');
  const problem = passwordProblem(b.password, email);
  if (problem) throw core.httpErr(problem);
  if (!b.acceptTerms) throw core.httpErr('Please accept the Terms and Privacy Policy to continue');
  if (db().users.some((u) => u.email === email)) throw core.httpErr('An account with this email already exists. Log in instead.', 409);
  const now = iso();
  const user = {
    id: id(4), name, email, password: hashPassword(b.password), createdAt: now, status: 'active',
    useCase: USE_CASES.includes(b.useCase) ? b.useCase : null, acceptedTermsAt: now,
    signupIp: ip, signupUa: String(ua || '').slice(0, 200), emailVerified: false,
    loginCount: 0, lastLoginAt: null, lastLoginIp: null, lastSeenAt: now, logins: [],
  };
  db().users.push(user);
  recordLogin(user, ip, ua);
  return user;
}

function recordLogin(u, ip, ua) {
  u.loginCount = (u.loginCount || 0) + 1;
  u.lastLoginAt = iso();
  u.lastLoginIp = ip;
  u.lastSeenAt = u.lastLoginAt;
  u.logins = [{ at: u.lastLoginAt, ip, ua: String(ua || '').slice(0, 200) }, ...(u.logins || [])].slice(0, 20);
  save();
}

async function deleteUser(u) {
  for (const p of projectsOf(u)) await core.deleteProject(p);
  revokeSessions(u.id);
  db().users = db().users.filter((x) => x.id !== u.id);
  save();
}

/* ---------------- admin ---------------- */
function audit(admin, action, target, detail) {
  const d = db();
  if (!d.audit) d.audit = [];
  d.audit.unshift({ at: iso(), admin: admin.email, action, target, detail: detail || null });
  if (d.audit.length > 2000) d.audit.length = 2000;
  save();
}
function adminUser(u) {
  const projects = projectsOf(u);
  const ids = new Set(projects.map((p) => p.id));
  return {
    ...publicUser(u), status: u.status || 'active', emailVerified: !!u.emailVerified, signupIp: u.signupIp || null,
    lastLoginAt: u.lastLoginAt || null, lastLoginIp: u.lastLoginIp || null, lastSeenAt: u.lastSeenAt || null, loginCount: u.loginCount || 0,
    acceptedTermsAt: u.acceptedTermsAt || null, customLimit: u.maxProjects || null,
    projects: projects.length, live: projects.filter((p) => p.status === 'live').length,
    deployments: db().deployments.filter((d) => ids.has(d.projectId)).length,
    sessions: db().sessions.filter((s) => s.userId === u.id && s.expires > Date.now()).length,
  };
}
const temporaryPassword = () => `Ship-${crypto.randomBytes(4).toString('hex')}-${Math.floor(10 + Math.random() * 89)}`;

function daySeries(items, field, days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    out.push({ day: d, count: items.filter((x) => String(x[field] || '').startsWith(d)).length });
  }
  return out;
}

async function systemInfo() {
  const info = {
    hostname: os.hostname(), platform: `${os.type()} ${os.release()}`, uptimeSec: Math.round(os.uptime()), cores: os.cpus().length,
    load: os.loadavg().map((x) => Math.round(x * 100) / 100), memTotal: os.totalmem(), memFree: os.freemem(),
    node: process.version, runtime: runtime.mode(), docker: runtime.info.dockerVersion, disk: null, containers: null,
  };
  if (process.platform !== 'win32') {
    const df = await run('df', ['-kP', DATA], { timeout: 5000 });
    const cols = (df.out.trim().split('\n')[1] || '').split(/\s+/);
    if (cols.length >= 5) info.disk = { total: +cols[1] * 1024, used: +cols[2] * 1024 };
  }
  if (runtime.info.docker) {
    const ps = await run('docker', ['ps', '-q', '--filter', 'label=shipstack.project'], { timeout: 8000 });
    info.containers = ps.out.trim() ? ps.out.trim().split('\n').length : 0;
  }
  return info;
}

async function overview() {
  const d = db();
  const week = Date.now() - 7 * 864e5;
  const deps7 = d.deployments.filter((x) => Date.parse(x.createdAt) > week);
  return {
    users: d.users.length,
    newUsers7d: d.users.filter((u) => Date.parse(u.createdAt) > week).length,
    activeUsers7d: d.users.filter((u) => u.lastSeenAt && Date.parse(u.lastSeenAt) > week).length,
    suspended: d.users.filter((u) => u.status === 'suspended').length,
    projects: d.projects.length,
    live: d.projects.filter((p) => p.status === 'live').length,
    failedProjects: d.projects.filter((p) => p.status === 'failed').length,
    deploys7d: deps7.length,
    success7d: deps7.filter((x) => x.status === 'success').length,
    failed7d: deps7.filter((x) => x.status === 'failed').length,
    signups: daySeries(d.users, 'createdAt'),
    deploys: daySeries(d.deployments, 'createdAt'),
    stacks: Object.entries(d.deployments.reduce((m, x) => { const k = x.stack && x.stack.framework; if (k && x.status === 'success') m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8),
    system: await systemInfo(),
    settings: settings(),
  };
}

function adminProject(p) {
  const owner = db().users.find((u) => u.id === p.ownerId);
  const v = core.view(p, false, process.env.SHIPSTACK_PUBLIC_URL || `http://localhost:${core.PORT}`, null);
  const last = v.metrics.last || {};
  return {
    id: p.id, name: p.name, slug: p.slug, status: p.status, deploying: v.deploying, plan: p.plan, stack: v.stack ? v.stack.framework : null,
    url: v.links.local, source: p.source.type === 'github' ? p.source.repoUrl : p.source.type === 'zip' ? `ZIP · ${p.source.fileName}` : `Template · ${p.source.sample}`,
    owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null, createdAt: p.createdAt, lastDeployedAt: p.lastDeployedAt || null,
    deployCount: v.deployCount, uptime: v.metrics.uptime, latency: v.metrics.avgLatency, cpu: last.cpu ?? null, mem: last.mem ?? null,
  };
}

module.exports = {
  ADMIN_EMAILS, USE_CASES, hashPassword, checkPassword, passwordProblem, newSession, sessionUser, endSession, revokeSessions,
  settings, isAdmin, maxProjectsFor, projectsOf, publicUser, signup, recordLogin, deleteUser,
  audit, adminUser, adminProject, temporaryPassword, overview,
};

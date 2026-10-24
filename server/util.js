// Small shared helpers: process spawning, ids, ports, files.
const { spawn } = require('child_process');
const crypto = require('crypto');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WIN = process.platform === 'win32';
const ROOT = path.resolve(__dirname, '..');
// Short default path on Windows: Python venvs break inside very long folder paths.
const DATA = path.resolve(process.env.SHIPSTACK_DATA || (IS_WIN ? path.join(os.homedir(), '.shipstack') : path.join(ROOT, 'data')));

const id = (bytes = 5) => crypto.randomBytes(bytes).toString('hex');
const token = () => crypto.randomBytes(24).toString('base64url');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const iso = (t = now()) => new Date(t).toISOString();

// Quote one argument for cmd.exe / sh when a shell has to be used.
function q(a) {
  a = String(a);
  if (/^[\w@%+=:,./\\-]+$/.test(a)) return a;
  return IS_WIN ? `"${a.replace(/"/g, '""')}"` : `'${a.replace(/'/g, `'\\''`)}'`;
}

/**
 * Run a command and collect output. onLine receives complete lines as they arrive.
 * shell:true is needed on Windows for npm/npx (.cmd files).
 */
function run(cmd, args = [], { cwd, env, onLine, timeout, shell = false, mask } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let buf = '';
    const opts = { cwd, env: { ...process.env, ...env }, windowsHide: true };
    const child = shell ? spawn([cmd, ...args.map(q)].join(' '), { ...opts, shell: true }) : spawn(cmd, args, opts);
    const handle = (d) => {
      let s = d.toString();
      if (mask) s = mask(s);
      out += s;
      if (out.length > 2e6) out = out.slice(-1e6);
      if (!onLine) return;
      buf += s;
      const lines = buf.split(/\r?\n|\r/);
      buf = lines.pop();
      lines.forEach((l) => l.trim() && onLine(l));
    };
    child.stdout.on('data', handle);
    child.stderr.on('data', handle);
    let timedOut = false;
    const to = timeout && setTimeout(() => { timedOut = true; killTree(child.pid); }, timeout);
    child.on('error', (e) => { clearTimeout(to); resolve({ code: -1, out: out + e.message, error: e }); });
    child.on('close', (code) => {
      clearTimeout(to);
      if (onLine && buf.trim()) onLine(buf);
      resolve({ code: timedOut ? -2 : code, out, timedOut });
    });
  });
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (IS_WIN) spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    else process.kill(-pid, 'SIGTERM');
  } catch {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

// On Windows a 0.0.0.0 bind can succeed while another process holds 127.0.0.1:port,
// so first try to connect: if something answers, the port is taken.
function portAnswers(port) {
  return new Promise((r) => {
    const c = net.connect({ port, host: '127.0.0.1' });
    c.setTimeout(400);
    c.once('connect', () => { c.destroy(); r(true); });
    c.once('timeout', () => { c.destroy(); r(false); });
    c.once('error', () => r(false));
  });
}
async function portFree(port) {
  if (await portAnswers(port)) return false;
  return new Promise((r) => {
    const s = net.createServer();
    s.once('error', () => r(false));
    s.listen(port, '0.0.0.0', () => s.close(() => r(true)));
  });
}
const reserved = new Set();
async function freePort(from, to, exclude = new Set()) {
  for (let p = from; p < to; p++) {
    if (reserved.has(p) || exclude.has(p)) continue;
    if (await portFree(p)) { reserved.add(p); setTimeout(() => reserved.delete(p), 30000); return p; }
  }
  throw new Error(`No free port between ${from} and ${to}`);
}

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254')) return a.address;
  }
  return '127.0.0.1';
}

const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const rm = (p) => fs.promises.rm(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });

function copyDir(src, dst, skip = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__'])) {
  mkdirp(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d, skip);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

// Resolve a user-supplied sub-directory safely inside base.
function inside(base, sub) {
  const target = path.resolve(base, (sub || '').replace(/^[/\\]+/, ''));
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('Root directory must stay inside the project');
  return target;
}

module.exports = { IS_WIN, ROOT, DATA, id, token, sleep, now, iso, q, run, killTree, portAnswers, portFree, freePort, lanIp, exists, readText, readJson, rm, mkdirp, copyDir, inside };

// Public internet URLs through a secure tunnel: cloudflared quick tunnels, or localhost.run over SSH.
const { spawn } = require('child_process');
const { run, killTree } = require('./util');

const avail = { cloudflared: false, ssh: false };
const open_ = new Map(); // projectId -> { url, provider, proc }

async function detectTunnels() {
  avail.cloudflared = (await run('cloudflared', ['--version'], { timeout: 8000 })).code === 0;
  avail.ssh = (await run('ssh', ['-V'], { timeout: 8000 })).code === 0;
  return avail;
}

function start(cmd, args, re, provider, projectId) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let done = false;
    const onData = (d) => {
      const m = d.toString().match(re);
      if (m && !done) { done = true; const t = { url: m[0], provider, proc }; open_.set(projectId, t); resolve(t); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', () => { if (open_.get(projectId) && open_.get(projectId).proc === proc) open_.delete(projectId); if (!done) { done = true; reject(new Error(`${provider} exited before giving a URL`)); } });
    proc.on('error', (e) => { if (!done) { done = true; reject(e); } });
    setTimeout(() => { if (!done) { done = true; killTree(proc.pid); reject(new Error(`${provider} did not return a URL within 40s`)); } }, 40000);
  });
}

async function open(projectId, port) {
  if (open_.has(projectId)) return open_.get(projectId);
  if (avail.cloudflared) return start('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], /https:\/\/[a-z0-9-]+\.trycloudflare\.com/, 'cloudflare', projectId);
  if (avail.ssh) return start('ssh', ['-o', 'StrictHostKeyChecking=no', '-o', 'ServerAliveInterval=30', '-o', 'ExitOnForwardFailure=yes', '-R', `80:localhost:${port}`, 'nokey@localhost.run'], /https:\/\/[a-z0-9-]+\.(lhr\.life|localhost\.run)/, 'localhost.run', projectId);
  throw new Error('No tunnel tool found – install cloudflared (recommended) or OpenSSH');
}
function close(projectId) {
  const t = open_.get(projectId);
  if (t) { killTree(t.proc.pid); open_.delete(projectId); }
}
const get = (projectId) => { const t = open_.get(projectId); return t ? { url: t.url, provider: t.provider } : null; };
process.on('exit', () => open_.forEach((t) => killTree(t.proc.pid)));

module.exports = { avail, detectTunnels, open, close, get };

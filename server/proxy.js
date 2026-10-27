// Edge router: each project gets a stable port (and <slug>.localhost) that proxies to whichever
// release is live. Swapping the upstream after a health check gives zero-downtime deploys.
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain', '.map': 'application/json', '.wasm': 'application/wasm' };

const routes = new Map(); // projectId -> { name, status, target: {type:'upstream',port}|{type:'static',dir,spa}, hits:[], errors:[] }
const listeners = new Map(); // projectId -> http.Server

function page(title, body, code = 503) {
  return { code, html: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;font-family:system-ui,sans-serif;background:#0b0d11;color:#e9ecf1;display:grid;place-items:center;min-height:100vh;text-align:center"><div><div style="width:40px;height:40px;border-radius:10px;background:#ff6b35;margin:0 auto 18px"></div><h2 style="margin:0 0 8px">${title}</h2><p style="color:#8b94a5;margin:0">${body}</p><p style="color:#5d6677;font-size:12px;margin-top:24px">Served by ShipStack</p></div></body>` };
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function record(r, code) {
  const t = Date.now();
  r.hits.push(t);
  if (code >= 500) r.errors.push(t);
  if (r.hits.length > 50000) r.hits.splice(0, 10000);
}
function rates(projectId) {
  const r = routes.get(projectId);
  if (!r) return { rpm: 0, err: 0 };
  const cut = Date.now() - 60000;
  r.hits = r.hits.filter((t) => t > cut);
  r.errors = r.errors.filter((t) => t > cut);
  return { rpm: r.hits.length, err: r.errors.length };
}

function serveStatic(r, req, res) {
  const { dir, spa } = r.target;
  const index = r.target.index || 'index.html';
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { rel = '/'; }
  let file = path.normalize(path.join(dir, rel));
  if (!file.startsWith(dir)) { res.writeHead(403); return res.end('Forbidden'); }
  const tryFiles = [file, path.join(file, index), path.join(file, 'index.html'), file + '.html'];
  const hit = tryFiles.find((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } });
  const target = hit || (spa ? path.join(dir, index) : null);
  if (!target || !fs.existsSync(target)) { record(r, 404); res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end(page('404', 'Page not found', 404).html); }
  record(r, 200);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Powered-By': 'ShipStack' });
  fs.createReadStream(target).pipe(res);
}

function handle(projectId, req, res) {
  const r = routes.get(projectId);
  if (!r || !r.target || r.status === 'stopped') {
    const p = !r ? page('App not found', 'This ShipStack project does not exist.', 404)
      : r.status === 'stopped' ? page(`${esc(r.name)} is not running`, 'This app has been stopped by its owner.')
      : page(`${esc(r.name)} is deploying`, 'The first release is being built. Refresh in a moment.');
    res.writeHead(p.code, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(p.html);
  }
  if (r.target.type === 'static') return serveStatic(r, req, res);
  const headers = { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress, 'x-forwarded-host': req.headers.host || '', 'x-forwarded-proto': 'http' };
  const up = http.request({ host: '127.0.0.1', port: r.target.port, method: req.method, path: req.url, headers }, (ur) => {
    record(r, ur.statusCode);
    res.writeHead(ur.statusCode, ur.headers);
    ur.pipe(res);
  });
  up.on('error', () => {
    record(r, 502);
    if (res.headersSent) return res.destroy();
    const p = page('Bad gateway', `${esc(r.name)} is not responding right now. ShipStack monitoring will restart it automatically.`, 502);
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(p.html);
  });
  req.pipe(up);
}

// WebSocket / upgrade passthrough (Streamlit, socket.io, Next dev, etc.)
function upgrade(projectId, req, socket, head) {
  const r = routes.get(projectId);
  if (!r || !r.target || r.target.type !== 'upstream') return socket.destroy();
  const up = net.connect(r.target.port, '127.0.0.1', () => {
    let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    up.write(raw + '\r\n');
    if (head && head.length) up.write(head);
    up.pipe(socket); socket.pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
}

function ensure(project) {
  if (!routes.has(project.id)) routes.set(project.id, { name: project.name, status: 'deploying', target: null, hits: [], errors: [] });
  const r = routes.get(project.id);
  r.name = project.name;
  if (!listeners.has(project.id)) {
    const srv = http.createServer((req, res) => handle(project.id, req, res));
    srv.on('upgrade', (req, s, h) => upgrade(project.id, req, s, h));
    srv.on('error', (e) => console.error(`[proxy] port ${project.port} for ${project.slug}: ${e.message}`));
    // In production apps are reached only through https://<slug>.<domain>, so keep their ports private.
    srv.listen(project.port, process.env.APP_HOST || (process.env.APP_DOMAIN ? '127.0.0.1' : '0.0.0.0'));
    listeners.set(project.id, srv);
  }
  return r;
}
function setTarget(project, target, status = 'live') { const r = ensure(project); r.target = target; r.status = status; }
function setStatus(project, status) { ensure(project).status = status; }
function remove(projectId) {
  const s = listeners.get(projectId);
  if (s) s.close();
  listeners.delete(projectId);
  routes.delete(projectId);
}

module.exports = { ensure, setTarget, setStatus, remove, handle, upgrade, rates, page };

# Rebuilds public/ (index.html, style.css, app.js) from the original ShipStack page,
# removing the in-browser simulator and adding login/sign-up and real links.
# Usage: python tools/build-frontend.py path/to/ShipStack.html
import sys, os

src_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join('..', 'shipstack', 'index.html')
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pub = os.path.join(root, 'public')
os.makedirs(pub, exist_ok=True)

lines = open(src_path, encoding='utf-8').read().split('\n')
assert lines[4].strip() == '<style>' and lines[285].strip() == '</style>', (lines[4], lines[285])
assert lines[828].strip() == '<script>' and lines[1606].strip() == '</script>', (lines[828], lines[1606])
css = '\n'.join(lines[5:285])
js = '\n'.join(lines[829:1606])

css += r"""

/* ---------- auth ---------- */
.auth { min-height: calc(100vh - 140px); display: grid; place-items: center; }
.auth-card { width: min(420px, 100%); padding: 30px; border-radius: 16px; border: 1px solid var(--line); background:
  radial-gradient(420px 180px at 0% 0%, rgba(255,107,53,.14), transparent 70%), var(--panel); }
.auth-card h1 { font-size: 26px; margin-bottom: 6px; }
.auth-card form { display: flex; flex-direction: column; gap: 14px; margin-top: 20px; }
.auth-card .btn { width: 100%; }
.auth-switch { margin-top: 16px; font-size: 13px; color: var(--muted); text-align: center; }
.auth-switch a { color: var(--brand2); }
.feat { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 22px; font-size: 12px; color: var(--muted); text-align: center; }
.feat b { display: block; color: var(--text); font: 600 13px var(--display); margin-bottom: 2px; }
.user { display: inline-flex; align-items: center; gap: 8px; }
.avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--panel2); border: 1px solid var(--line2); display: grid; place-items: center; font-size: 11px; font-weight: 600; color: var(--brand2); }
.topbar .logout { height: 28px; padding: 0 10px; font-size: 12px; }
@media (max-width: 640px) { .sys { display: flex; } .sys .pill { display: none; } }
"""

def rep(old, new):
    global js
    assert old in js, 'missing: ' + old[:90]
    js = js.replace(old, new, 1)

# 1. api(): CSRF header + 401 handling
rep("""    headers: opts.body && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json', ...(opts.headers || {}) } : opts.headers,""",
    """    headers: { 'X-Requested-With': 'ShipStack', ...(opts.body && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },""")
rep("""  if (!res.ok) throw new Error((data && data.error) || res.statusText);""",
    """  if (res.status === 401 && !path.startsWith('/api/auth/')) { ME = null; if (!/^#\\/(login|signup)/.test(location.hash)) location.hash = '#/login'; }
  if (!res.ok) throw new Error((data && data.error) || res.statusText);""")

# 2. system bar: user pill + logout
rep("""    const tun = SYS.tunnels.cloudflared""", """    if (SYS.user) ME = SYS.user;
    const tun = SYS.tunnels.cloudflared""")
rep("""      <span class="pill" title="Public URL provider"><span class="dot ${tun ? 'ok' : ''}"></span>${tun ? `Public URLs · ${tun}` : 'Public URLs off'}</span>`;""",
    """      <span class="pill" title="Public URL provider"><span class="dot ${tun ? 'ok' : ''}"></span>${tun ? `Public URLs · ${tun}` : 'Public URLs off'}</span>
      ${ME ? `<span class="user"><span class="avatar">${esc(ME.name.split(/\\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</span><span title="${esc(ME.email)}">${esc(ME.name.split(' ')[0])}</span></span><button class="btn sm ghost logout" id="logout">Log out</button>` : ''}`;
    const lo = $('#logout');
    if (lo) lo.onclick = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); ME = null; SYS = null; $('#sys').innerHTML = ''; location.hash = '#/login'; };""")

# 3. router: auth gate
rep("""  const parts = h.split('/').filter(Boolean);""", """  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'login' || parts[0] === 'signup') { $('.topbar nav').style.visibility = 'hidden'; return renderAuth(parts[0]); }
  if (!ME) { location.hash = '#/login'; return; }
  $('.topbar nav').style.visibility = '';""")

# 4. upload: CSRF header
rep("""    x.setRequestHeader('X-File-Name', file.name);""", """    x.setRequestHeader('X-File-Name', file.name);
    x.setRequestHeader('X-Requested-With', 'ShipStack');""")

# 5. live events only once logged in
rep("""(function connectEvents() {
  const es = new EventSource('/api/events');""", """function connectEvents() {
  if (!ME) return setTimeout(connectEvents, 2000);
  const es = new EventSource('/api/events');""")
rep("""  es.onerror = () => { es.close(); setTimeout(connectEvents, 3000); };
})();""", """  es.onerror = () => { es.close(); setTimeout(connectEvents, 3000); };
}""")

# 6. auth screens, real links, boot
rep("""loadSystem();
route();""", r"""/* ============================== AUTH ============================== */
let ME = null;
function renderAuth(mode) {
  const signup = mode === 'signup';
  view.innerHTML = `<div class="auth"><div class="auth-card">
    <h1>${signup ? 'Create your account' : 'Welcome back'}</h1>
    <p class="muted" style="margin:0">${signup ? 'Deploy your first project in under two minutes. No DevOps experience needed.' : 'Log in to manage your deployments.'}</p>
    <form id="authForm" autocomplete="on">
      ${signup ? '<div><label class="f" for="aName">Name</label><input class="input" id="aName" autocomplete="name" required></div>' : ''}
      <div><label class="f" for="aEmail">Email</label><input class="input" id="aEmail" type="email" autocomplete="email" required></div>
      <div><label class="f" for="aPw">Password</label><input class="input" id="aPw" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${signup ? 8 : 1}" required>${signup ? '<div class="hint">At least 8 characters.</div>' : ''}</div>
      <button class="btn primary lg" type="submit">${signup ? 'Create account' : 'Log in'}</button>
    </form>
    <div class="auth-switch">${signup ? 'Already have an account? <a href="#/login">Log in</a>' : 'New to ShipStack? <a href="#/signup">Create an account</a>'}</div>
    <div class="feat"><div><b>CI/CD</b>tests on every deploy</div><div><b>Containers</b>Docker builds</div><div><b>Monitoring</b>auto-healing</div></div>
  </div></div>`;
  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    try {
      const body = { email: $('#aEmail').value, password: $('#aPw').value };
      if (signup) body.name = $('#aName').value;
      const r = await api(`/api/auth/${signup ? 'signup' : 'login'}`, { method: 'POST', body });
      ME = r.user;
      await loadSystem();
      location.hash = '#/';
    } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
  };
}

/* links to deployed apps open in a new tab */
document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]');
  if (!o) return;
  e.preventDefault();
  window.open(o.dataset.open, '_blank', 'noopener');
});

(async function boot() {
  try { ME = (await api('/api/auth/me')).user; } catch { ME = null; }
  if (ME) await loadSystem();
  else if (!/^#\/(login|signup)/.test(location.hash)) location.hash = '#/login';
  connectEvents();
  route();
})();""")

open(os.path.join(pub, 'style.css'), 'w', encoding='utf-8').write(css)
open(os.path.join(pub, 'app.js'), 'w', encoding='utf-8').write(js)
open(os.path.join(pub, 'index.html'), 'w', encoding='utf-8').write("""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ShipStack</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23ff6b35'/%3E%3Cpath d='M8 20l8-12 8 12h-5v5h-6v-5z' fill='white'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="topbar">
  <a href="#/" class="brand"><span class="logo"><svg viewBox="0 0 32 32"><path d="M8 20l8-12 8 12h-5v5h-6v-5z" fill="currentColor"/></svg></span><span>ShipStack</span></a>
  <nav><a href="#/" data-nav="dash">Projects</a><a href="#/new" data-nav="new">New deployment</a></nav>
  <div class="sys" id="sys"></div>
</header>
<main id="view"></main>
<div id="toasts"></div>
<div id="modal" class="modal hidden"><div class="modal-card"><button class="modal-x" aria-label="Close">×</button><div id="modal-body"></div></div></div>
<script src="/app.js"></script>
</body>
</html>
""")
print('frontend built:', len(css), 'bytes css,', len(js), 'bytes js')

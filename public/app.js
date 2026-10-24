/* ShipStack dashboard – vanilla JS single-page app */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');

const ICON = {
  source: '<path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9"/>',
  scan: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  test: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/>',
  build: '<path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
  deploy: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  health: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  release: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  spin: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/>',
  skip: '<path d="M5 12h14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  ext: '<path d="M14 4h6v6M10 14 20 4M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
  gh: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.6 6.4-7A5.4 5.4 0 0 0 20 4.8 5 5 0 0 0 19.9 1S18.7.6 16 2.5a13.4 13.4 0 0 0-7 0C6.3.6 5.1 1 5.1 1A5 5 0 0 0 5 4.8a5.4 5.4 0 0 0-1.5 3.7c0 5.4 3.3 6.6 6.4 7A3.4 3.4 0 0 0 9 18.1V22"/>',
};
const svg = (name, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICON[name] || ''}</svg>`;

/* ------------------------------ api ------------------------------ */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'X-Requested-With': 'ShipStack', ...(opts.body && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
    body: opts.body && !(opts.body instanceof Blob) && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (res.status === 401 && !path.startsWith('/api/auth/')) { ME = null; location.href = '/login'; }
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}

function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 7000 : 3500);
}

function copy(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard', 'ok'), () => toast(text));
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy]');
  if (c) { e.preventDefault(); copy(c.dataset.copy); }
});

/* ------------------------------ formatting ------------------------------ */
function ago(iso) {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
const dur = (ms) => (ms == null ? '' : ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`);
const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function statusOf(p) {
  if (p.deploying) return { cls: 'run', label: 'deploying' };
  return { live: { cls: 'ok', label: 'live' }, failed: { cls: 'err', label: 'failed' }, stopped: { cls: '', label: 'stopped' }, deploying: { cls: 'run', label: 'deploying' } }[p.status] || { cls: '', label: p.status };
}
function depStatus(s) {
  return { success: ['ok', 'Ready'], failed: ['err', 'Failed'], running: ['run', 'Building'], queued: ['warn', 'Queued'] }[s] || ['', s];
}
const sourceLabel = (p) => (p.source.type === 'github' ? p.source.repoUrl.replace(/^https?:\/\/(www\.)?/, '') : p.source.type === 'zip' ? `ZIP · ${p.source.fileName || 'upload'}` : `Template · ${p.source.sample}`);

/* ------------------------------ charts ------------------------------ */
function spark(points, { color = 'var(--brand)', h = 40, max } = {}) {
  const vals = points.map((v) => (v == null ? null : Number(v)));
  const real = vals.filter((v) => v != null);
  if (real.length < 2) return `<svg viewBox="0 0 100 ${h}" preserveAspectRatio="none"><line x1="0" y1="${h - 1}" x2="100" y2="${h - 1}" stroke="var(--line2)" stroke-dasharray="2 3"/></svg>`;
  const top = max || Math.max(...real) * 1.15 || 1;
  const n = vals.length;
  const xy = vals.map((v, i) => [(i / (n - 1)) * 100, v == null ? null : h - 2 - (v / top) * (h - 4)]);
  let d = '';
  let started = false;
  xy.forEach(([x, y]) => { if (y == null) { started = false; return; } d += `${started ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`; started = true; });
  const pts = xy.filter((p) => p[1] != null);
  const area = `M${pts[0][0]},${h}` + pts.map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join('') + `L${pts[pts.length - 1][0]},${h}Z`;
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg viewBox="0 0 100 ${h}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
  <path d="${area}" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ------------------------------ system bar ------------------------------ */
let SYS = null;
async function loadSystem() {
  try {
    SYS = await api('/api/system');
    if (SYS.user) ME = SYS.user;
    const tun = SYS.tunnels.cloudflared ? 'cloudflared' : SYS.tunnels.ssh ? 'localhost.run' : null;
    $('#sys').innerHTML = `
      <span class="pill" title="Where apps run"><span class="dot ${SYS.mode === 'docker' ? 'ok' : 'warn'}"></span>${SYS.mode === 'docker' ? `Docker ${esc(SYS.dockerVersion)}` : 'Native runtime'}</span>
      <span class="pill" title="Public URL provider"><span class="dot ${tun ? 'ok' : ''}"></span>${tun ? `Public URLs · ${tun}` : 'Public URLs off'}</span>
      ${ME ? `<span class="user"><span class="avatar">${esc(ME.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</span><span title="${esc(ME.email)}">${esc(ME.name.split(' ')[0])}</span></span>${ME.role === 'admin' ? '<a class="btn sm ghost logout" href="/admin">Admin</a>' : ''}<a class="btn sm ghost logout" href="#/account">Account</a><button class="btn sm ghost logout" id="logout">Log out</button>` : ''}`;
    const lo = $('#logout');
    if (lo) lo.onclick = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); ME = null; SYS = null; location.href = '/'; };
  } catch { /* offline */ }
}

/* ------------------------------ router ------------------------------ */
let cleanup = [];
function onLeave(fn) { cleanup.push(fn); }
function route() {
  document.getElementById('modal').classList.add('hidden');
  cleanup.forEach((f) => { try { f(); } catch { /* ignore */ } });
  cleanup = [];
  const h = location.hash.replace(/^#/, '') || '/';
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'login' || parts[0] === 'signup') { location.href = '/' + parts[0]; return; }
  if (!ME) { location.href = '/login'; return; }
  $('.topbar nav').style.visibility = '';
  $$('.topbar nav a').forEach((a) => a.classList.toggle('active', (a.dataset.nav === 'new' && parts[0] === 'new') || (a.dataset.nav === 'dash' && !parts[0])));
  window.scrollTo(0, 0);
  if (parts[0] === 'account') return renderAccount();
  if (parts[0] === 'new') return renderNew(new URLSearchParams(h.split('?')[1] || ''));
  if (parts[0] === 'p' && parts[1]) return renderProject(parts[1], (parts[2] || 'overview').split('?')[0]);
  return renderDashboard();
}
window.addEventListener('hashchange', route);

/* global live-update channel */
const listeners = new Set();
function connectEvents() {
  if (!ME) return setTimeout(connectEvents, 2000);
  const es = new EventSource('/api/events');
  es.addEventListener('change', (e) => { const ids = JSON.parse(e.data); listeners.forEach((fn) => fn(ids)); });
  es.onerror = () => { es.close(); setTimeout(connectEvents, 3000); };
}
function subscribe(fn) { listeners.add(fn); onLeave(() => listeners.delete(fn)); }
function every(ms, fn) { const t = setInterval(fn, ms); onLeave(() => clearInterval(t)); }

/* ============================== DASHBOARD ============================== */
async function renderDashboard() {
  view.innerHTML = `
    <section class="hero">
      <div class="hero-main">
        <h1>Ship your web project<br>in one click.</h1>
        <p>Paste a GitHub repository. ShipStack detects the stack, runs your tests, builds a container, deploys it, health-checks it and hands you a live link – then keeps it monitored.</p>
        <form class="quick" id="quick">
          <input class="input" id="qrepo" placeholder="https://github.com/user/repo" autocomplete="off" spellcheck="false">
          <button class="btn primary lg" type="submit">Deploy ${svg('deploy')}</button>
        </form>
        <div class="chips"><span class="dim">Try:</span>
          <button class="chip" data-r="render-examples/flask-hello-world">flask-hello-world</button>
          <button class="chip" data-r="render-examples/fastapi">fastapi</button>
          <button class="chip" data-r="mdn/beginner-html-site-styled">static html site</button>
        </div>
      </div>
      <div class="stats" id="stats"></div>
    </section>
    <div class="row" style="margin-bottom:14px"><h2>Projects</h2><span class="spacer"></span><a class="btn sm" href="#/new">+ New deployment</a></div>
    <div id="plist"></div>`;
  $('#quick').onsubmit = async (e) => {
    e.preventDefault();
    const repo = $('#qrepo').value.trim();
    if (!repo) return $('#qrepo').focus();
    const btn = e.submitter; btn.disabled = true;
    try {
      const r = await api('/api/projects', { method: 'POST', body: { source: { type: 'github', repoUrl: repo }, services: { tests: true, monitoring: true, autoDeploy: true } } });
      location.hash = `#/p/${r.project.id}`;
    } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
  };
  $$('.chip[data-r]').forEach((c) => (c.onclick = () => { $('#qrepo').value = `https://github.com/${c.dataset.r}`; $('#qrepo').focus(); }));

  const load = async () => {
    const [projects] = await Promise.all([api('/api/projects'), loadSystem()]);
    if (!$('#stats')) return; // user navigated away while loading
    const s = SYS ? SYS.stats : {};
    const rate = s.deployments ? Math.round((s.successful / Math.max(1, s.successful + s.failed)) * 100) : 0;
    $('#stats').innerHTML = `
      <div class="stat"><span>Projects</span><b>${projects.length}</b></div>
      <div class="stat"><span>Live now</span><b style="color:var(--ok)">${projects.filter((p) => p.status === 'live').length}</b></div>
      <div class="stat"><span>Deployments</span><b>${s.deployments || 0}</b></div>
      <div class="stat"><span>Success rate</span><b>${s.deployments ? rate + '%' : '—'}</b></div>`;
    if (!projects.length) {
      $('#plist').innerHTML = `<div class="empty"><h3 style="color:var(--text);margin-bottom:6px">No projects yet</h3>Paste a GitHub URL above, upload a ZIP, or <a href="#/new?tab=sample">start from a template</a>.</div>`;
      return;
    }
    $('#plist').innerHTML = `<div class="projects">${projects.map((p) => {
      const st = statusOf(p);
      const m = p.metrics || {};
      return `<a class="pcard" href="#/p/${p.id}">
        <div class="top"><span class="dot ${st.cls}"></span><span class="name">${esc(p.name)}</span><span class="spacer"></span>${p.stack ? `<span class="tag">${esc(p.stack.framework)}</span>` : ''}</div>
        <div class="url">${p.status === 'live' ? esc(p.links.local.replace('http://', '')) : esc(sourceLabel(p))}</div>
        <div class="meta">
          <span class="status"><span class="dot ${st.cls}"></span>${st.label}</span>
          ${p.latest ? `<span>#${p.latest.number} · ${ago(p.latest.createdAt)}</span>` : ''}
          ${m.uptime != null ? `<span>${m.uptime}% up</span>` : ''}
          ${m.avgLatency != null ? `<span>${m.avgLatency} ms</span>` : ''}
        </div>
      </a>`;
    }).join('')}</div>`;
  };
  await load();
  subscribe(load);
  every(10000, load);
}

/* ============================== NEW DEPLOYMENT ============================== */
async function renderNew(qs) {
  if (!SYS) await loadSystem();
  const plans = SYS ? SYS.plans : {};
  let tab = qs.get('tab') || 'github';
  let file = null;
  let sample = null;
  let plan = 'starter';
  view.innerHTML = `
  <div class="form-wrap">
    <h1>New deployment</h1>
    <p class="muted" style="margin:6px 0 0">Tell us where the code lives and what services you need. We handle the rest.</p>

    <div class="step"><div class="step-h"><span class="step-n">1</span><h2>Source</h2></div>
      <div class="panel panel-b">
        <div class="tabs" id="srcTabs">
          <button data-t="github">${svg('gh', 'style="width:14px;height:14px;vertical-align:-2px"')} GitHub repo</button>
          <button data-t="zip">Upload ZIP</button>
          <button data-t="sample">Templates</button>
        </div>
        <div data-pane="github">
          <label class="f">Repository URL</label>
          <input class="input mono" id="repo" placeholder="https://github.com/user/repo" spellcheck="false">
          <div class="hint">Public repos work as-is. Also accepts <code>user/repo</code> or a <code>/tree/branch/folder</code> link.</div>
          <div class="grid2" style="margin-top:14px">
            <div><label class="f">Branch</label><input class="input mono" id="branch" placeholder="default branch"></div>
            <div><label class="f">Root directory</label><input class="input mono" id="rootDir" placeholder="/ (repo root)"></div>
          </div>
          <details class="adv" style="margin-top:14px"><summary>Private repository?</summary>
            <label class="f">GitHub personal access token</label>
            <input class="input mono" id="token" type="password" placeholder="ghp_… (repo read access)">
            <div class="hint">Stored locally on this ShipStack server and masked in every log.</div>
          </details>
        </div>
        <div data-pane="zip">
          <label class="drop" id="drop"><input type="file" id="zipf" accept=".zip,application/zip" hidden>
            <div style="font-weight:600;color:var(--text);margin-bottom:4px" id="dropTitle">Drop a .zip of your project here</div>
            <div id="dropSub">or click to browse – up to 250 MB</div>
          </label>
          <div style="margin-top:14px"><label class="f">Root directory (optional)</label><input class="input mono" id="zipRoot" placeholder="/"></div>
        </div>
        <div data-pane="sample"><div class="grid3" id="samples"><span class="muted">Loading…</span></div></div>
      </div>
    </div>

    <div class="step"><div class="step-h"><span class="step-n">2</span><h2>Project</h2></div>
      <div class="panel panel-b"><label class="f">Name</label><input class="input" id="name" placeholder="auto-detected from the source">
      <div class="hint" id="slugHint"></div></div>
    </div>

    <div class="step"><div class="step-h"><span class="step-n">3</span><h2>Hosting plan</h2></div>
      <div class="grid3" id="plans">${Object.values(plans).map((p) => `
        <div class="choice ${p.key === plan ? 'on' : ''}" data-plan="${p.key}">
          <span class="price">${esc(p.price)}</span><h3>${esc(p.name)}</h3>
          <div class="muted" style="font-size:12px">${esc(p.blurb)}</div>
          <ul><li>${p.memMb >= 1024 ? p.memMb / 1024 + ' GB' : p.memMb + ' MB'} memory</li><li>${p.cpus} vCPU</li><li>${p.key === 'starter' ? 'Shared runtime' : 'Dedicated container'} · health-checked</li></ul>
        </div>`).join('')}</div>
      ${SYS && SYS.mode !== 'docker' ? '<div class="hint">Resource limits are enforced when ShipStack runs with Docker.</div>' : ''}
    </div>

    <div class="step"><div class="step-h"><span class="step-n">4</span><h2>DevOps services</h2></div>
      <div class="grid2">
        ${toggle('svcTests', true, 'Automated testing', 'Runs your test suite (npm test, pytest, go test) and blocks broken releases.')}
        ${toggle('svcMon', true, 'Monitoring & auto-healing', 'Uptime checks every 10s, CPU/memory/latency metrics, automatic restart on failure.')}
        ${toggle('svcAuto', true, 'Continuous deployment', 'Redeploys automatically when you push to the branch (polling + webhooks).')}
        ${toggle('svcPublic', false, 'Public internet URL', 'Shareable HTTPS link via a secure tunnel (cloudflared / localhost.run).')}
      </div>
    </div>

    <div class="step"><div class="step-h"><span class="step-n">5</span><h2>Environment & build</h2></div>
      <div class="panel panel-b">
        <label class="f">Environment variables</label>
        <textarea class="input" id="env" placeholder="DATABASE_URL=postgres://…&#10;API_KEY=secret" spellcheck="false"></textarea>
        <div class="hint">One KEY=value per line. Injected at runtime, never written to the image.</div>
        <details class="adv" style="margin-top:14px"><summary>Advanced overrides</summary>
          <div class="grid2">
            <div><label class="f">Build command</label><input class="input mono" id="buildCmd" placeholder="auto"></div>
            <div><label class="f">Start command</label><input class="input mono" id="startCmd" placeholder="auto"></div>
            <div><label class="f">App port</label><input class="input mono" id="port" placeholder="auto ($PORT)"></div>
            <div><label class="f">Health-check path</label><input class="input mono" id="healthPath" placeholder="/"></div>
          </div>
        </details>
      </div>
    </div>

    <div class="deploy-bar">
      <button class="btn primary lg" id="go">${svg('deploy')} Deploy</button>
      <div class="progress hidden" id="prog"><i></i></div>
      <span class="muted" id="goMsg"></span>
    </div>
  </div>`;

  function setTab(t) {
    tab = t;
    $$('#srcTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    $$('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== t));
  }
  $$('#srcTabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.t)));
  setTab(tab);
  $$('#plans .choice').forEach((c) => (c.onclick = () => { plan = c.dataset.plan; $$('#plans .choice').forEach((x) => x.classList.toggle('on', x === c)); }));

  const nameHint = () => {
    const n = $('#name').value.trim();
    $('#slugHint').textContent = n ? `Will be reachable at http://${n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.localhost:${SYS ? SYS.port : 8080}` : '';
  };
  $('#name').oninput = nameHint;
  $('#repo').oninput = () => {
    const m = /([\w.-]+?)(?:\.git)?(?:\/tree\/.*)?\/?$/.exec($('#repo').value.trim());
    if (m && !$('#name').dataset.touched) { $('#name').value = m[1]; nameHint(); }
  };
  $('#name').addEventListener('keydown', () => { $('#name').dataset.touched = '1'; });

  // zip
  const pick = (f) => {
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) return toast('Please choose a .zip file', 'err');
    file = f;
    $('#dropTitle').textContent = f.name;
    $('#dropSub').textContent = `${(f.size / 1048576).toFixed(2)} MB – ready to deploy`;
    if (!$('#name').dataset.touched) { $('#name').value = f.name.replace(/\.zip$/i, ''); nameHint(); }
  };
  $('#zipf').onchange = (e) => pick(e.target.files[0]);
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => pick(e.dataTransfer.files[0]));

  // samples
  api('/api/samples').then((list) => {
    $('#samples').innerHTML = list.map((s) => `<div class="choice" data-s="${esc(s.id)}"><span class="tag" style="margin-bottom:8px">${esc(s.stack)}</span><h3>${esc(s.name)}</h3><div class="muted" style="font-size:12px">${esc(s.description)}</div></div>`).join('');
    $$('#samples .choice').forEach((c) => (c.onclick = () => {
      sample = c.dataset.s;
      $$('#samples .choice').forEach((x) => x.classList.toggle('on', x === c));
      if (!$('#name').dataset.touched) { $('#name').value = sample; nameHint(); }
    }));
  });

  $('#go').onclick = async () => {
    const source = { type: tab };
    if (tab === 'github') {
      source.repoUrl = $('#repo').value.trim();
      if (!source.repoUrl) { $('#repo').focus(); return toast('Enter a GitHub repository URL', 'err'); }
      Object.assign(source, { branch: $('#branch').value.trim(), rootDir: $('#rootDir').value.trim(), token: $('#token').value.trim() });
    } else if (tab === 'zip') {
      if (!file) return toast('Choose a .zip file first', 'err');
      Object.assign(source, { fileName: file.name, rootDir: $('#zipRoot').value.trim() });
    } else {
      if (!sample) return toast('Pick a template', 'err');
      source.sample = sample;
    }
    const body = {
      name: $('#name').value.trim() || undefined,
      source,
      plan,
      services: { tests: $('#svcTests').checked, monitoring: $('#svcMon').checked, autoDeploy: $('#svcAuto').checked && tab === 'github', publicUrl: $('#svcPublic').checked },
      env: $('#env').value,
      overrides: Object.fromEntries(['buildCmd', 'startCmd', 'port', 'healthPath'].map((k) => [k, $('#' + k).value.trim()]).filter(([, v]) => v)),
    };
    const btn = $('#go');
    btn.disabled = true;
    $('#goMsg').textContent = 'Creating project…';
    try {
      const r = await api('/api/projects', { method: 'POST', body });
      if (tab === 'zip') {
        $('#prog').classList.remove('hidden');
        await upload(`/api/projects/${r.project.id}/archive`, file, (pct) => { $('#prog i').style.width = pct + '%'; $('#goMsg').textContent = `Uploading ${pct}%`; });
      }
      location.hash = `#/p/${r.project.id}`;
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
      $('#goMsg').textContent = '';
    }
  };
}

function toggle(id, on, title, desc) {
  return `<label class="toggle"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="sw"></span><span><b>${title}</b><span class="d">${desc}</span></span></label>`;
}

function upload(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', 'application/zip');
    x.setRequestHeader('X-File-Name', file.name);
    x.setRequestHeader('X-Requested-With', 'ShipStack');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error((JSON.parse(x.responseText || '{}').error) || 'Upload failed')));
    x.onerror = () => reject(new Error('Upload failed'));
    x.send(file);
  });
}

/* ============================== PROJECT ============================== */
async function renderProject(id, tab) {
  let P;
  try { P = await api(`/api/projects/${id}`); } catch (e) {
    view.innerHTML = `<div class="empty">Project not found. <a href="#/">Back to projects</a></div>`;
    return;
  }
  const tabs = [['overview', 'Overview'], ['deployments', 'Deployments'], ['logs', 'Runtime logs'], ['devops', 'DevOps files'], ['settings', 'Settings']];
  view.innerHTML = `
    <div class="ph" id="ph"></div>
    <div class="links" id="links"></div>
    <nav class="ptabs">${tabs.map(([k, n]) => `<a href="#/p/${id}/${k}" class="${k === tab ? 'on' : ''}">${n}</a>`).join('')}</nav>
    <div id="tab"></div>`;

  const refresh = async () => {
    try { P = await api(`/api/projects/${id}`); } catch { return; }
    if (!$('#ph')) return;
    header(P);
    if (tabApi.update) tabApi.update(P);
  };
  header(P);
  const tabApi = ({ overview: tabOverview, deployments: tabDeployments, logs: tabLogs, devops: tabDevops, settings: tabSettings }[tab] || tabOverview)(P, refresh) || {};
  subscribe((ids) => ids.includes(id) && refresh());
  every(5000, refresh);
}

function header(P) {
  const st = statusOf(P);
  const a = P.active;
  $('#ph').innerHTML = `
    <div>
      <div class="row"><h1>${esc(P.name)}</h1><span class="status" style="margin-left:6px"><span class="dot ${st.cls}"></span>${st.label}</span></div>
      <div class="sub">
        ${P.source.type === 'github' ? `<a href="${esc(P.source.repoUrl)}" target="_blank" rel="noopener" class="row" style="gap:6px;text-decoration:none">${svg('gh', 'style="width:14px;height:14px"')}${esc(sourceLabel(P))}</a>` : `<span>${esc(sourceLabel(P))}</span>`}
        ${P.source.branch ? `<span class="tag">⎇ ${esc(P.source.branch)}</span>` : ''}
        ${P.stack ? `<span class="tag">${esc(P.stack.framework)}</span>` : ''}
        <span class="tag">${esc((P.plans && P.plans[P.plan] || {}).name || P.plan)} plan</span>
        ${a && a.commit ? `<span class="mono" style="font-size:12px">${esc(a.commit.short)}</span>` : ''}
      </div>
    </div>
    <div class="actions">
      ${P.status === 'stopped' ? `<button class="btn sm" data-act="start">Start</button>` : P.active ? `<button class="btn sm" data-act="restart">Restart</button><button class="btn sm" data-act="stop">Stop</button>` : ''}
      <button class="btn sm primary" data-act="deploy" ${P.deploying ? 'disabled' : ''}>${P.deploying ? 'Deploying…' : 'Redeploy'}</button>
    </div>`;
  $$('#ph [data-act]').forEach((b) => (b.onclick = () => action(P, b.dataset.act, b)));

  const L = P.links;
  const live = P.status === 'live';
  const lk = (label, url, icon, cls = '') => `<div class="link ${cls}"><label>${icon ? svg(icon, 'style="width:12px;height:12px"') : ''}${label}${url ? `<span class="spacer"></span><button class="copy" data-copy="${esc(url)}" title="Copy">${svg('copy')}</button>` : ''}</label>${url ? `<a href="#" data-open="${esc(url)}">${esc(url.replace(/^https?:\/\//, ''))}</a>` : ''}</div>`;
  const pub = L.public
    ? lk('Public URL', L.public, 'globe', 'primary')
    : `<div class="link"><label>${svg('globe', 'style="width:12px;height:12px"')}Public URL</label>${live ? `<button class="btn sm" id="mkpub" style="height:24px">Make public</button>` : '<span class="none">deploy first</span>'}</div>`;
  $('#links').innerHTML = (live ? lk('Live URL', L.local, 'ext', 'primary') : `<div class="link"><label>Live URL</label><span class="none">${P.deploying ? 'deploying…' : 'not running'}</span></div>`)
    + (live ? lk('Subdomain', L.subdomain, '') : `<div class="link"><label>Subdomain</label><span class="none mono">${esc(L.subdomain.replace('http://', ''))}</span></div>`)
    + (L.lan ? (live ? lk('LAN / phone', L.lan, '') : `<div class="link"><label>LAN / phone</label><span class="none mono">${esc(L.lan.replace('http://', ''))}</span></div>`) : '')
    + pub;
  const mk = $('#mkpub');
  if (mk) mk.onclick = async () => {
    mk.disabled = true; mk.textContent = 'Opening tunnel…';
    try { await api(`/api/projects/${P.id}/public`, { method: 'POST', body: { enabled: true } }); toast('Public URL is ready', 'ok'); } catch (e) { toast(e.message, 'err'); mk.disabled = false; mk.textContent = 'Make public'; }
  };
}

async function action(P, act, btn) {
  if (act === 'stop' && !confirm(`Stop ${P.name}? The URL will show a "stopped" page.`)) return;
  btn.disabled = true;
  try {
    const r = await api(`/api/projects/${P.id}/${act}`, { method: 'POST' });
    if (act === 'deploy') { toast(`Deployment #${r.deployment.number} started`, 'ok'); if (!location.hash.endsWith('/overview') && location.hash.split('/').length > 3) location.hash = `#/p/${P.id}/overview`; }
    else toast({ stop: 'Stopped', start: 'Starting…', restart: 'Restarted' }[act], 'ok');
  } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
}

/* ---------- live log terminal ---------- */
function Terminal(el) {
  let es = null;
  let current = null;
  let stick = true;
  el.addEventListener('scroll', () => { stick = el.scrollHeight - el.scrollTop - el.clientHeight < 40; });
  const line = (e) => {
    const d = document.createElement('div');
    const cls = e.level !== 'info' ? e.level : e.text.startsWith('$ ') ? 'cmd' : e.text.startsWith('──') || e.stage === 'system' ? 'hdr' : '';
    d.className = 'l';
    d.innerHTML = `<span class="ts">${hhmm(e.t)}</span><span class="sg">${esc(e.stage)}</span><span class="${cls}">${esc(e.text).replace(/https?:\/\/[\w.:-]+(?:localhost|trycloudflare\.com)[\w.:\/-]*|http:\/\/localhost:\d+/g, (u) => `<a href="#" data-open="${u}" class="loglink">${u}</a>`)}</span>`;
    el.appendChild(d);
  };
  return {
    attach(depId, onStages, onStatus) {
      if (current === depId) return;
      current = depId;
      if (es) es.close();
      el.innerHTML = '';
      stick = true;
      es = new EventSource(`/api/deployments/${depId}/stream`);
      let buf = [];
      let raf = null;
      es.addEventListener('log', (m) => {
        buf.push(JSON.parse(m.data));
        if (!raf) raf = requestAnimationFrame(() => { buf.forEach(line); buf = []; raf = null; if (stick) el.scrollTop = el.scrollHeight; });
      });
      es.addEventListener('stages', (m) => onStages && onStages(JSON.parse(m.data)));
      es.addEventListener('status', (m) => onStatus && onStatus(JSON.parse(m.data)));
      es.addEventListener('end', () => es.close());
    },
    close() { if (es) es.close(); },
  };
}

function pipelineHtml(stages) {
  return stages.map((s) => {
    const ic = s.status === 'success' ? 'check' : s.status === 'failed' ? 'x' : s.status === 'running' ? 'spin' : s.status === 'skipped' ? 'skip' : s.key;
    const t = s.startedAt && s.endedAt ? dur(s.endedAt - s.startedAt) : s.status === 'running' && s.startedAt ? dur(Date.now() - s.startedAt) : '';
    return `<div class="stage ${s.status}"><div class="ic">${svg(ic)}</div><div class="nm">${esc(s.name)}</div><div class="nt" title="${esc(s.note || '')}">${esc(s.note || (s.status === 'pending' ? 'waiting' : s.status))}</div><div class="tm">${t}</div></div>`;
  }).join('');
}

/* ---------- overview ---------- */
function tabOverview(P) {
  $('#tab').innerHTML = `
    <div class="two">
      <div>
        <div class="panel">
          <div class="panel-h" id="dephead"></div>
          <div id="depbanner" style="padding:0 18px"></div>
          <div class="pipeline" id="pipe"></div>
          <div class="term" id="term"></div>
        </div>
        <div class="panel section">
          <div class="panel-h"><h3>Monitoring</h3><span class="spacer"></span><span class="muted" style="font-size:12px" id="monNote"></span></div>
          <div class="panel-b"><div class="metrics" id="metrics"></div>
            <div style="margin-top:14px"><div class="row"><span class="muted" style="font-size:12px">Uptime · last 30 minutes</span><span class="spacer"></span><b id="upPct" style="font-family:var(--display)"></b></div><div class="uptime" id="upbar"></div></div>
          </div>
        </div>
      </div>
      <div>
        <div class="panel"><div class="panel-h"><h3>Live release</h3></div><div class="panel-b" id="release"></div></div>
        <div class="panel section"><div class="panel-h"><h3>Activity</h3></div><div class="panel-b" style="padding-top:6px;padding-bottom:6px"><ul class="events" id="events"></ul></div></div>
      </div>
    </div>`;
  const term = Terminal($('#term'));
  onLeave(() => term.close());
  let stageTimer = null;
  onLeave(() => clearInterval(stageTimer));
  let lastStages = null;

  const update = (P) => {
    const d = P.latest;
    if (!d) {
      $('#dephead').innerHTML = '<h3>Waiting for source</h3>';
      $('#pipe').innerHTML = '';
      $('#term').innerHTML = `<div class="l"><span class="muted">${P.source.type === 'zip' ? 'Upload a .zip from Settings or create the project again.' : 'No deployments yet.'}</span></div>`;
    } else {
      const [cls, label] = depStatus(d.status);
      $('#dephead').innerHTML = `<h3>Deployment #${d.number}</h3><span class="status"><span class="dot ${cls}"></span>${label}</span>
        <span class="tag">${esc(d.trigger)}</span>${d.rollbackOf ? `<span class="tag">rollback → #${d.rollbackOf}</span>` : ''}
        <span class="spacer"></span><span class="muted" style="font-size:12px">${d.mode === 'docker' ? '🐳 docker' : 'native'} · ${d.durationMs ? dur(d.durationMs) : ago(d.createdAt)}</span>`;
      $('#depbanner').innerHTML = d.status === 'failed'
        ? `<div class="banner err" style="margin:14px 0 0">✖ ${esc(d.error || 'Failed')}${P.active ? ` <span style="color:var(--muted)">– release #${P.active.number} is still serving traffic.</span>` : ''}</div>`
        : (d.warnings && d.warnings.length && d.status === 'success' ? `<div class="banner warn" style="margin:14px 0 0">⚠ ${d.warnings.map(esc).join('<br>⚠ ')}</div>` : '');
      lastStages = d.stages;
      $('#pipe').innerHTML = pipelineHtml(d.stages);
      term.attach(d.id, (stages) => { lastStages = stages; $('#pipe').innerHTML = pipelineHtml(stages); });
      clearInterval(stageTimer);
      if (d.status === 'running' || d.status === 'queued') stageTimer = setInterval(() => lastStages && ($('#pipe').innerHTML = pipelineHtml(lastStages)), 1000);
    }

    // release
    const a = P.active;
    $('#release').innerHTML = a ? `<dl class="kv">
      <dt>Release</dt><dd>#${a.number}${a.rollbackOf ? ` (rollback of #${a.rollbackOf})` : ''}</dd>
      <dt>Commit</dt><dd title="${esc(a.commit && a.commit.message)}">${esc(a.commit ? `${a.commit.short} ${a.commit.message || ''}` : '—')}</dd>
      <dt>Stack</dt><dd>${esc(a.stack ? `${a.stack.framework}` : '—')}</dd>
      <dt>Runtime</dt><dd>${a.mode === 'docker' ? 'Docker container' : 'Native process'}</dd>
      <dt>Port</dt><dd>${P.port} → ${a.stack ? a.stack.containerPort : ''}</dd>
      <dt>Deployed</dt><dd>${ago(a.finishedAt)}</dd>
      <dt>Services</dt><dd style="font-family:var(--sans)">${[P.services.tests && 'tests', P.services.monitoring && 'monitoring', P.services.autoDeploy && 'auto-deploy', P.services.publicUrl && 'public'].filter(Boolean).join(' · ')}</dd>
    </dl>` : '<span class="muted">Nothing live yet.</span>';

    // events
    $('#events').innerHTML = (P.events || []).slice(0, 14).map((e) => `<li><time>${ago(e.at).replace(' ago', '')}</time><span class="dot ${e.level === 'success' ? 'ok' : e.level === 'error' ? 'err' : e.level === 'warn' ? 'warn' : ''}" style="margin-top:6px"></span><span>${esc(e.message)}</span></li>`).join('') || '<li class="muted">No activity yet</li>';

    // metrics
    const S = P.series || [];
    const last = S[S.length - 1] || {};
    const mem = S.map((x) => x.mem);
    const plan = (P.plans || {})[P.plan] || {};
    $('#monNote').textContent = P.services.monitoring ? (S.length ? `checked ${ago(new Date(last.t).toISOString())} · every 10s` : 'collecting…') : 'auto-healing disabled';
    $('#metrics').innerHTML = `
      <div class="metric"><div class="k">Response time</div><div class="v">${last.ms != null && last.up ? last.ms : '—'}<small>ms</small></div>${spark(S.map((x) => (x.up ? x.ms : null)), { color: 'var(--info)' })}</div>
      <div class="metric"><div class="k">Requests / min</div><div class="v">${last.rpm != null ? last.rpm : '—'}<small>${last.err ? `${last.err} errors` : 'rpm'}</small></div>${spark(S.map((x) => x.rpm), { color: 'var(--brand)' })}</div>
      <div class="metric"><div class="k">CPU</div><div class="v">${last.cpu != null ? last.cpu : '—'}<small>%</small></div>${spark(S.map((x) => x.cpu), { color: 'var(--warn)' })}</div>
      <div class="metric"><div class="k">Memory</div><div class="v">${last.mem != null ? Math.round(last.mem) : '—'}<small>MB${plan.memMb ? ` / ${plan.memMb}` : ''}</small></div>${spark(mem, { color: 'var(--ok)', max: P.active && P.active.mode === 'docker' ? plan.memMb : undefined })}</div>`;
    const bars = S.slice(-60);
    $('#upbar').innerHTML = Array.from({ length: 60 - bars.length }, () => '<i class="none"></i>').join('') + bars.map((x) => `<i class="${x.up ? '' : 'down'}" title="${hhmm(x.t)} – ${x.up ? `HTTP ${x.code}, ${x.ms}ms` : 'DOWN'}"></i>`).join('');
    $('#upPct').textContent = P.metrics.uptime != null ? `${P.metrics.uptime}%` : '';
  };
  update(P);
  return { update };
}

/* ---------- deployments ---------- */
function tabDeployments(P) {
  $('#tab').innerHTML = '<div class="panel" id="deps"></div>';
  const update = (P) => {
    $('#deps').innerHTML = `<table class="t"><thead><tr><th>#</th><th>Status</th><th>Commit</th><th>Trigger</th><th>Duration</th><th>Created</th><th></th></tr></thead><tbody>
    ${(P.deployments || []).map((d) => {
      const [cls, label] = depStatus(d.status);
      const isActive = P.active && P.active.id === d.id;
      const canRb = d.status === 'success' && !isActive && !d.artifactPruned;
      return `<tr class="${isActive ? 'active' : ''}">
        <td><b>#${d.number}</b></td>
        <td><span class="status"><span class="dot ${cls}"></span>${label}</span>${isActive ? ' <span class="tag" style="color:var(--ok);border-color:rgba(61,220,151,.4)">live</span>' : ''}${d.status === 'failed' ? `<div class="dim" style="font-size:11px;max-width:240px">${esc(d.error || '')}</div>` : ''}</td>
        <td class="commit">${d.commit ? `${esc(d.commit.short)}<span class="msg">${esc(d.commit.message || '')}</span>` : '—'}</td>
        <td><span class="tag">${esc(d.trigger)}</span>${d.rollbackOf ? ` <span class="dim">→ #${d.rollbackOf}</span>` : ''}</td>
        <td class="mono" style="font-size:12px">${dur(d.durationMs)}</td>
        <td class="muted">${ago(d.createdAt)}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn sm ghost" data-logs="${d.id}" data-n="${d.number}">Logs</button>${canRb ? ` <button class="btn sm" data-rb="${d.id}" data-n="${d.number}">Rollback</button>` : ''}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="muted">No deployments yet</td></tr>'}</tbody></table>`;
    $$('[data-logs]').forEach((b) => (b.onclick = () => openLogs(b.dataset.logs, b.dataset.n)));
    $$('[data-rb]').forEach((b) => (b.onclick = async () => {
      if (!confirm(`Roll back to deployment #${b.dataset.n}? This reuses its already-built artifact (no rebuild).`)) return;
      b.disabled = true;
      try { const r = await api(`/api/projects/${P.id}/rollback/${b.dataset.rb}`, { method: 'POST' }); toast(`Rollback started (#${r.deployment.number})`, 'ok'); location.hash = `#/p/${P.id}/overview`; } catch (e) { toast(e.message, 'err'); b.disabled = false; }
    }));
  };
  update(P);
  return { update };
}

function openLogs(depId, n) {
  $('#modal-body').innerHTML = `<h2 style="margin-bottom:6px">Deployment #${esc(n)} – build log</h2><div class="pipeline" id="mpipe" style="padding-left:0;padding-right:0"></div><div class="term tall" id="mterm"></div>`;
  $('#modal').classList.remove('hidden');
  const t = Terminal($('#mterm'));
  t.attach(depId, (s) => ($('#mpipe').innerHTML = pipelineHtml(s)));
  const close = () => { t.close(); $('#modal').classList.add('hidden'); };
  $('#modal .modal-x').onclick = close;
  $('#modal').onclick = (e) => e.target.id === 'modal' && close();
}

/* ---------- runtime logs ---------- */
function tabLogs(P) {
  $('#tab').innerHTML = `<div class="row" style="margin-bottom:12px"><span class="muted">stdout / stderr of the live release${P.active ? ` (#${P.active.number})` : ''}</span><span class="spacer"></span>
    <label class="row" style="gap:8px;font-size:13px;color:var(--muted);cursor:pointer"><input type="checkbox" id="follow" checked> Auto-refresh</label>
    <button class="btn sm" id="rl">Refresh</button></div><pre class="term tall" id="rt" style="margin:0;padding:14px 16px"></pre>`;
  const load = async () => {
    const el = $('#rt');
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    try { el.textContent = await api(`/api/projects/${P.id}/logs?tail=500`); } catch (e) { el.textContent = e.message; }
    if (atBottom) el.scrollTop = el.scrollHeight;
  };
  $('#rl').onclick = load;
  load();
  every(3000, () => $('#follow') && $('#follow').checked && load());
  return {};
}

/* ---------- devops files ---------- */
function highlight(name, text) {
  let h = esc(text);
  if (/Dockerfile/.test(name)) h = h.replace(/^(#.*)$/gm, '<span class="c">$1</span>').replace(/^(FROM|WORKDIR|COPY|RUN|ENV|EXPOSE|CMD|ENTRYPOINT|ARG|USER|HEALTHCHECK)\b/gm, '<span class="k">$1</span>');
  else if (/\.ya?ml$/.test(name)) h = h.replace(/^(\s*#.*)$/gm, '<span class="c">$1</span>').replace(/^(\s*-?\s*)([\w.-]+):/gm, '$1<span class="k">$2</span>:');
  else if (/\.conf$/.test(name)) h = h.replace(/\b(server|listen|root|index|location|try_files|gzip|gzip_types|expires|add_header)\b/g, '<span class="k">$1</span>');
  return h;
}
async function tabDevops(P) {
  const src = (P.deployments || []).find((d) => d.status === 'success') || (P.deployments || [])[0];
  if (!src) { $('#tab').innerHTML = '<div class="empty">Files are generated during the first deployment.</div>'; return {}; }
  const d = await api(`/api/deployments/${src.id}`);
  const files = d.files || {};
  const names = Object.keys(files);
  if (!names.length) { $('#tab').innerHTML = '<div class="empty">This deployment did not reach the detection stage.</div>'; return {}; }
  $('#tab').innerHTML = `
    <div class="banner ok">These are the containerization and CI/CD files ShipStack generated for <b>${esc(d.stack ? d.stack.framework : 'your app')}</b> (from deployment #${d.number}). Commit them to your repo to run the same pipeline on GitHub Actions or any Docker host.</div>
    <div class="panel files"><div class="list">${names.map((n, i) => `<button data-f="${esc(n)}" class="${i === 0 ? 'on' : ''}">${svg('file', 'style="width:14px;height:14px;flex:none"')}${esc(n)}</button>`).join('')}</div>
    <div><div class="panel-h"><span class="mono" id="fname"></span><span class="spacer"></span><button class="btn sm" id="fcopy">Copy</button></div><pre class="code" id="fcode"></pre></div></div>
    ${d.stack && d.stack.ownDockerfile ? '<div class="hint">Your repository already contains a Dockerfile, so it was used as-is.</div>' : ''}`;
  let cur = names[0];
  const show = (n) => {
    cur = n;
    $$('.files .list button').forEach((b) => b.classList.toggle('on', b.dataset.f === n));
    $('#fname').textContent = n;
    $('#fcode').innerHTML = highlight(n, files[n]);
  };
  $$('.files .list button').forEach((b) => (b.onclick = () => show(b.dataset.f)));
  $('#fcopy').onclick = () => copy(files[cur]);
  show(cur);
  return {};
}

/* ---------- settings ---------- */
function tabSettings(P) {
  const plans = P.plans || {};
  const envText = Object.entries(P.env || {}).map(([k, v]) => `${k}=${v}`).join('\n');
  const o = P.overrides || {};
  $('#tab').innerHTML = `<div class="form-wrap">
    <div class="panel"><div class="panel-h"><h3>General</h3></div><div class="panel-b">
      <div class="grid2"><div><label class="f">Name</label><input class="input" id="sName" value="${esc(P.name)}"></div>
      <div><label class="f">Hosting plan</label><select class="input" id="sPlan">${Object.values(plans).map((p) => `<option value="${p.key}" ${p.key === P.plan ? 'selected' : ''}>${esc(p.name)} – ${esc(p.memory)} RAM · ${esc(p.cpus)} vCPU · ${esc(p.price)}</option>`).join('')}</select></div></div>
      ${P.source.type === 'github' ? `<div class="grid2" style="margin-top:14px">
        <div><label class="f">Repository</label><input class="input mono" id="sRepo" value="${esc(P.source.repoUrl)}"></div>
        <div><label class="f">Branch</label><input class="input mono" id="sBranch" value="${esc(P.source.branch || '')}" placeholder="default"></div>
        <div><label class="f">Root directory</label><input class="input mono" id="sRoot" value="${esc(P.source.rootDir || '')}" placeholder="/"></div>
        <div><label class="f">Access token</label><input class="input mono" id="sToken" type="password" placeholder="${P.source.hasToken ? '•••••• saved (type to replace)' : 'only for private repos'}"></div>
      </div>` : ''}
      ${P.source.type === 'zip' ? `<div style="margin-top:14px"><label class="f">Upload a new version</label><label class="drop" style="padding:20px"><input type="file" id="sZip" accept=".zip" hidden><span id="sZipT">Choose a .zip to redeploy</span></label></div>` : ''}
    </div></div>

    <div class="panel section"><div class="panel-h"><h3>DevOps services</h3></div><div class="panel-b grid2">
      ${toggle('sTests', P.services.tests, 'Automated testing', 'Block releases whose test suite fails.')}
      ${toggle('sMon', P.services.monitoring, 'Monitoring & auto-healing', 'Restart the app after 3 failed health checks.')}
      ${toggle('sAuto', P.services.autoDeploy, 'Continuous deployment', P.source.type === 'github' ? 'Poll the branch every 60s and deploy new commits.' : 'Only available for GitHub sources.')}
      ${toggle('sPub', P.services.publicUrl, 'Public internet URL', 'Keep a public HTTPS tunnel open to this app.')}
      ${toggle('sAllow', !!o.allowTestFailure, 'Continue on test failure', 'Deploy even when tests fail (not recommended).')}
    </div></div>

    <div class="panel section"><div class="panel-h"><h3>Environment variables</h3></div><div class="panel-b">
      <textarea class="input" id="sEnv" spellcheck="false" placeholder="KEY=value">${esc(envText)}</textarea>
      <div class="hint">Changes apply on the next deployment.</div>
    </div></div>

    <div class="panel section"><div class="panel-h"><h3>Build & runtime overrides</h3></div><div class="panel-b grid2">
      <div><label class="f">Build command</label><input class="input mono" id="sBuild" value="${esc(o.buildCmd || '')}" placeholder="auto"></div>
      <div><label class="f">Start command</label><input class="input mono" id="sStart" value="${esc(o.startCmd || '')}" placeholder="auto"></div>
      <div><label class="f">App port</label><input class="input mono" id="sPort" value="${esc(o.port || '')}" placeholder="auto"></div>
      <div><label class="f">Health-check path</label><input class="input mono" id="sHealth" value="${esc(o.healthPath || '')}" placeholder="/"></div>
      <label class="toggle" style="grid-column:1/-1"><input type="checkbox" id="sIgnoreDf" ${o.ignoreDockerfile ? 'checked' : ''}><span class="sw"></span><span><b>Ignore repository Dockerfile</b><span class="d">Use ShipStack's generated Dockerfile instead of the one in the repo.</span></span></label>
    </div></div>

    <div class="deploy-bar" style="position:static;background:none;padding-bottom:0"><button class="btn primary" id="save">Save</button><button class="btn" id="saveDeploy">Save & redeploy</button></div>

    <div class="panel section"><div class="panel-h"><h3>Deploy hook & GitHub webhook</h3></div><div class="panel-b">
      <label class="f">Hook URL</label>
      <div class="row"><input class="input mono" readonly value="${esc(P.webhookUrl)}"><button class="btn" data-copy="${esc(P.webhookUrl)}">Copy</button></div>
      <div class="hint" style="line-height:1.7">POST to this URL to trigger a deployment (used by the generated GitHub Actions workflow).<br>
      As a GitHub webhook: Settings → Webhooks → payload URL above, content type <code>application/json</code>, “Just the push event”. GitHub must be able to reach this server – set <code>SHIPSTACK_PUBLIC_URL</code> when hosting ShipStack on a VM. Locally, continuous deployment via polling needs no setup.</div>
    </div></div>

    <div class="panel section" style="border-color:rgba(255,93,108,.3)"><div class="panel-h"><h3 style="color:var(--err)">Danger zone</h3></div><div class="panel-b row">
      <span class="muted">Delete the project, its containers, images, releases and logs.</span><span class="spacer"></span><button class="btn danger" id="del">Delete project</button>
    </div></div>
  </div>`;

  const collect = () => {
    const body = {
      name: $('#sName').value.trim(),
      plan: $('#sPlan').value,
      services: { tests: $('#sTests').checked, monitoring: $('#sMon').checked, autoDeploy: $('#sAuto').checked, publicUrl: $('#sPub').checked },
      env: $('#sEnv').value,
      overrides: { buildCmd: $('#sBuild').value.trim(), startCmd: $('#sStart').value.trim(), port: $('#sPort').value.trim(), healthPath: $('#sHealth').value.trim(), allowTestFailure: $('#sAllow').checked, ignoreDockerfile: $('#sIgnoreDf').checked },
    };
    if (P.source.type === 'github') {
      body.source = { repoUrl: $('#sRepo').value.trim(), branch: $('#sBranch').value.trim(), rootDir: $('#sRoot').value.trim() };
      if ($('#sToken').value.trim()) body.source.token = $('#sToken').value.trim();
    }
    return body;
  };
  const save = async (deploy) => {
    try {
      await api(`/api/projects/${P.id}`, { method: 'PATCH', body: collect() });
      if (deploy) { await api(`/api/projects/${P.id}/deploy`, { method: 'POST' }); location.hash = `#/p/${P.id}/overview`; }
      toast(deploy ? 'Saved – redeploying' : 'Settings saved', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#save').onclick = () => save(false);
  $('#saveDeploy').onclick = () => save(true);
  const z = $('#sZip');
  if (z) z.onchange = async () => {
    const f = z.files[0];
    if (!f) return;
    $('#sZipT').textContent = `Uploading ${f.name}…`;
    try { await upload(`/api/projects/${P.id}/archive`, f, (p) => ($('#sZipT').textContent = `Uploading ${p}%`)); location.hash = `#/p/${P.id}/overview`; } catch (e) { toast(e.message, 'err'); }
  };
  $('#del').onclick = async () => {
    if (prompt(`Type "${P.name}" to delete this project permanently`) !== P.name) return;
    try { await api(`/api/projects/${P.id}`, { method: 'DELETE' }); toast('Project deleted', 'ok'); location.hash = '#/'; } catch (e) { toast(e.message, 'err'); }
  };
  return {};
}

/* ============================== ACCOUNT ============================== */
let ME = null;
let MUST_CHANGE = false;
const USE_CASES = { '': 'Not set', student: 'College or school project', developer: 'Personal / portfolio project', startup: 'Startup product', agency: 'Client work (agency / freelance)', other: 'Something else' };
async function renderAccount() {
  let A;
  try { A = await api('/api/account'); } catch (e) { view.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const u = A.user;
  view.innerHTML = `<div class="form-wrap">
    <h1>Account</h1>
    <p class="muted" style="margin:6px 0 0">Your profile, password and account settings.</p>
    ${A.mustChangePassword ? '<div class="banner warn" style="margin-top:18px">You signed in with a temporary password. Choose a new password below to secure your account.</div>' : ''}
    <div class="step"><div class="panel"><div class="panel-h"><h3>Profile</h3></div><div class="panel-b">
      <div class="grid2">
        <div><label class="f" for="acName">Full name</label><input class="input" id="acName" maxlength="60" value="${esc(u.name)}"></div>
        <div><label class="f" for="acEmail">Email</label><input class="input" id="acEmail" value="${esc(u.email)}" disabled><div class="hint">Contact support to change your email.</div></div>
        <div><label class="f" for="acUse">What do you deploy?</label><select class="input" id="acUse">${Object.entries(USE_CASES).map(([k, v]) => `<option value="${k}" ${(u.useCase || '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div><label class="f">Plan &amp; usage</label><div style="padding-top:9px">${A.usage.projects} of ${u.role === 'admin' ? 'unlimited' : A.usage.maxProjects} projects used · member since ${new Date(u.createdAt).toLocaleDateString()}</div></div>
      </div>
      <div style="margin-top:16px"><button class="btn primary" id="acSave">Save profile</button></div>
    </div></div></div>
    <div class="step"><div class="panel"><div class="panel-h"><h3>Change password</h3></div><div class="panel-b">
      <div class="grid2">
        <div><label class="f" for="acCur">Current password</label><input class="input" id="acCur" type="password" autocomplete="current-password"></div>
        <div><label class="f" for="acNew">New password</label><input class="input" id="acNew" type="password" autocomplete="new-password"><div class="hint">At least 8 characters, with a letter and a number. Other devices will be signed out.</div></div>
      </div>
      <div style="margin-top:16px"><button class="btn" id="acPw">Update password</button></div>
    </div></div></div>
    <div class="step"><div class="panel"><div class="panel-h"><h3>Recent sign-ins</h3></div><div class="panel-b" style="padding:0">
      <table class="t"><thead><tr><th>When</th><th>IP address</th><th>Device</th></tr></thead><tbody>${A.logins.map((l) => `<tr><td>${new Date(l.at).toLocaleString()}</td><td class="mono">${esc(l.ip)}</td><td class="muted" style="max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.ua)}">${esc(l.ua || '')}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No sign-ins recorded.</td></tr>'}</tbody></table>
    </div></div></div>
    ${u.role === 'admin' ? '' : `<div class="panel section" style="border-color:rgba(255,93,108,.3)"><div class="panel-h"><h3 style="color:var(--err)">Delete account</h3></div><div class="panel-b">
      <p class="muted" style="margin:0 0 12px">Permanently deletes your account and all your projects, apps and logs. This can't be undone.</p>
      <div class="row"><input class="input" id="acDelPw" type="password" placeholder="Enter your password to confirm" style="max-width:320px" autocomplete="current-password"><button class="btn danger" id="acDel">Delete my account</button></div>
    </div></div>`}
  </div>`;
  $('#acSave').onclick = async () => {
    try { const r = await api('/api/account', { method: 'PATCH', body: { name: $('#acName').value, useCase: $('#acUse').value } }); ME = r.user; await loadSystem(); toast('Profile saved', 'ok'); } catch (e) { toast(e.message, 'err'); }
  };
  $('#acPw').onclick = async () => {
    try { await api('/api/auth/password', { method: 'POST', body: { current: $('#acCur').value, password: $('#acNew').value } }); MUST_CHANGE = false; toast('Password updated. Other devices were signed out.', 'ok'); renderAccount(); } catch (e) { toast(e.message, 'err'); }
  };
  const del = $('#acDel');
  if (del) del.onclick = async () => {
    if (!confirm('Delete your Shipzo account and all your projects permanently?')) return;
    try { await api('/api/account', { method: 'DELETE', body: { password: $('#acDelPw').value } }); location.href = '/'; } catch (e) { toast(e.message, 'err'); }
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
  try { const me = await api('/api/auth/me'); ME = me.user; MUST_CHANGE = !!me.mustChangePassword; } catch { ME = null; }
  if (!ME) { location.href = '/login'; return; }
  await loadSystem();
  if (MUST_CHANGE) location.hash = '#/account';
  connectEvents();
  route();
})();

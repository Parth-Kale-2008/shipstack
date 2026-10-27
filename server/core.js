// Core domain: projects, deployments, the CI/CD pipeline, monitoring, auto-heal and continuous deployment.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { EventEmitter } = require('events');
const { DATA, ROOT, id, token, sleep, now, iso, run, freePort, portAnswers, killTree, exists, rm, mkdirp, copyDir, inside } = require('./util');
const { db, save } = require('./db');
const { detect, generatedFiles, secretScan } = require('./detect');
const runtime = require('./runtime');
const proxy = require('./proxy');
const tunnel = require('./tunnel');

const bus = new EventEmitter();
bus.setMaxListeners(0);

const PLANS = {
  starter: { key: 'starter', name: 'Starter', memory: '256m', cpus: '0.5', memMb: 256, price: 'Free', blurb: 'Portfolios, static sites, demos' },
  standard: { key: 'standard', name: 'Standard', memory: '512m', cpus: '1', memMb: 512, price: '₹199/mo', blurb: 'APIs and small full-stack apps' },
  pro: { key: 'pro', name: 'Pro', memory: '1g', cpus: '2', memMb: 1024, price: '₹499/mo', blurb: 'Busier apps, SSR frameworks' },
};
const SAMPLES = [
  { id: 'static-portfolio', name: 'Static portfolio', description: 'HTML/CSS/JS site served by nginx', stack: 'Static' },
  { id: 'node-express-api', name: 'Express REST API', description: 'Node.js API with a node:test suite', stack: 'Node.js' },
  { id: 'python-flask-app', name: 'Flask web app', description: 'Python Flask app with pytest + gunicorn', stack: 'Python' },
  { id: 'house-price-predictor', name: 'House price predictor', description: 'Streamlit ML app with a pytest suite', stack: 'Python' },
];
const STAGES = [['source', 'Fetch source'], ['scan', 'Detect & scan'], ['test', 'Automated tests'], ['build', 'Build & containerize'], ['deploy', 'Deploy'], ['health', 'Health check'], ['release', 'Go live']];
const KEEP_RELEASES = 5;
const PORT = +process.env.PORT || 8080;
// Production: apps live at https://<slug>.<APP_DOMAIN>, e.g. https://portfolio.shipzo.tech
const APP_DOMAIN = String(process.env.APP_DOMAIN || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

const handles = new Map(); // projectId -> live runtime handle
const busy = new Set();
const series = new Map(); // projectId -> metric points
const liveLogs = new Map(); // deploymentId -> log entries (while running / recently)
const health = new Map(); // projectId -> { fails }

/* ---------------- lookups ---------------- */
const projects = () => db().projects;
const getProject = (pid) => projects().find((p) => p.id === pid);
const getDep = (did) => db().deployments.find((d) => d.id === did);
const depsOf = (pid) => db().deployments.filter((d) => d.projectId === pid).sort((a, b) => b.number - a.number);
const changed = (p) => bus.emit('change', { id: p.id, ownerId: p.ownerId });

function addEvent(pid, level, message) {
  db().events.push({ projectId: pid, level, message, at: iso() });
  if (db().events.length > 5000) db().events.splice(0, 1000);
  save();
}

function slugify(name) {
  let base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'app';
  if (['www', 'api', 'admin', 'app', 'dashboard', 'mail', 'smtp', 'ftp', 'ns1', 'ns2', 'status', 'docs', 'blog', 'internal', 'shipstack'].includes(base)) base += '-app';
  let slug = base;
  for (let i = 2; projects().some((p) => p.slug === slug); i++) slug = `${base}-${i}`;
  return slug;
}

async function nextProjectPort() {
  const used = new Set(projects().map((p) => p.port));
  return freePort(+process.env.APP_PORT_START || 5001, 5999, used);
}

/* ---------------- source normalisation ---------------- */
function parseGithub(input) {
  const raw = String(input || '').trim().replace(/^git@github\.com:/, '').replace(/^https?:\/\/(www\.)?github\.com\//, '');
  const m = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+?))?)?\/?$/.exec(raw);
  if (!m) throw httpErr('Enter a GitHub URL like https://github.com/user/repo or user/repo');
  return { repoUrl: `https://github.com/${m[1]}/${m[2]}`, repo: m[2], branch: m[3] || '', rootDir: m[4] || '' };
}
const validBranch = (b) => !b || /^[\w./-]{1,120}$/.test(b) && !b.includes('..') && !b.startsWith('-');
const validRoot = (r) => !r || (/^[\w./ -]{1,200}$/.test(r) && !r.split(/[\\/]/).includes('..'));
function parseEnv(text) {
  const env = {};
  String(text || '').split(/\r?\n/).forEach((l) => { const x = /^\s*([A-Za-z_]\w*)\s*=\s*(.*)$/.exec(l); if (x && !['PORT'].includes(x[1])) env[x[1]] = x[2].replace(/^"(.*)"$/, '$1'); });
  return env;
}
function httpErr(msg, status = 400) { const e = new Error(msg); e.status = status; return e; }

/* ---------------- projects ---------------- */
const dockerRequired = () => APP_DOMAIN && runtime.mode() === 'native' && process.env.SHIPSTACK_RUNTIME !== 'native';
const PAUSED = 'Docker is not running on this server, so deployments are paused. Ask the administrator to start Docker.';

async function createProject(user, body, limit) {
  if (dockerRequired()) throw httpErr(PAUSED, 503);
  const max = limit || +process.env.MAX_PROJECTS_PER_USER || 10;
  if (projects().filter((p) => p.ownerId === user.id).length >= max) throw httpErr(`Your account can have up to ${max} projects. Delete one to add another.`, 403);
  const s = body.source || {};
  let source, name;
  if (s.type === 'github') {
    const g = parseGithub(s.repoUrl);
    source = { type: 'github', repoUrl: g.repoUrl, branch: (s.branch || g.branch || '').trim(), rootDir: (s.rootDir || g.rootDir || '').trim(), token: s.token ? String(s.token).trim() : undefined };
    name = body.name || g.repo;
  } else if (s.type === 'zip') {
    source = { type: 'zip', fileName: String(s.fileName || 'upload.zip').slice(0, 120), rootDir: (s.rootDir || '').trim() };
    name = body.name || source.fileName.replace(/\.zip$/i, '');
  } else if (s.type === 'sample') {
    if (!SAMPLES.some((x) => x.id === s.sample)) throw httpErr('Unknown template');
    source = { type: 'sample', sample: s.sample, rootDir: '' };
    name = body.name || s.sample;
  } else throw httpErr('source.type must be github, zip or sample');
  if (!validBranch(source.branch)) throw httpErr('That branch name is not valid');
  if (!validRoot(source.rootDir)) throw httpErr('Root directory must be a folder inside the repository');
  const plan = PLANS[body.plan] ? body.plan : 'starter';
  const p = {
    id: id(4), ownerId: user.id, name: String(name).slice(0, 60), slug: slugify(name), source, plan,
    services: { tests: true, monitoring: true, autoDeploy: source.type === 'github', publicUrl: false, ...(body.services || {}) },
    env: typeof body.env === 'string' ? parseEnv(body.env) : {}, overrides: sanitizeOverrides(body.overrides || {}),
    port: await nextProjectPort(), status: 'deploying', hookToken: token(), createdAt: iso(), updatedAt: iso(),
  };
  if (p.source.type !== 'github') p.services.autoDeploy = false;
  projects().push(p);
  save();
  proxy.ensure(p);
  addEvent(p.id, 'info', `Project created from ${source.type === 'github' ? source.repoUrl : source.type === 'zip' ? 'ZIP upload' : 'template ' + source.sample}`);
  const d = source.type === 'zip' ? null : createDeployment(p, { trigger: 'initial' });
  if (!d) p.status = 'failed';
  return { p, d };
}

function sanitizeOverrides(o) {
  const out = {};
  for (const k of ['buildCmd', 'startCmd']) if (typeof o[k] === 'string' && o[k].trim()) out[k] = o[k].trim().slice(0, 400);
  if (o.port && /^\d{2,5}$/.test(String(o.port))) out.port = String(o.port);
  if (typeof o.healthPath === 'string' && /^\/[\w\-./?=&]*$/.test(o.healthPath.trim())) out.healthPath = o.healthPath.trim();
  for (const k of ['allowTestFailure', 'ignoreDockerfile']) if (o[k]) out[k] = true;
  return out;
}

function updateProject(p, body) {
  if (body.name) p.name = String(body.name).slice(0, 60);
  if (body.plan && PLANS[body.plan]) p.plan = body.plan;
  if (body.services) {
    p.services = { ...p.services, ...body.services };
    if (p.source.type !== 'github') p.services.autoDeploy = false;
    if (!p.services.publicUrl) tunnel.close(p.id);
    else if (p.status === 'live') openPublic(p);
  }
  if (body.env !== undefined) p.env = parseEnv(body.env);
  if (body.overrides) p.overrides = sanitizeOverrides({ ...p.overrides, ...body.overrides });
  if (body.source && p.source.type === 'github') {
    if (body.source.repoUrl) { const g = parseGithub(body.source.repoUrl); p.source.repoUrl = g.repoUrl; }
    if (body.source.branch !== undefined) { if (!validBranch(body.source.branch)) throw httpErr('That branch name is not valid'); p.source.branch = body.source.branch; }
    if (body.source.rootDir !== undefined) { if (!validRoot(body.source.rootDir)) throw httpErr('Root directory must be a folder inside the repository'); p.source.rootDir = body.source.rootDir; }
    if (body.source.token) p.source.token = String(body.source.token).trim();
  }
  p.updatedAt = iso();
  proxy.ensure(p);
  addEvent(p.id, 'info', `Settings updated (${Object.keys(body).join(', ')})`);
  save(); changed(p);
}

async function deleteProject(p) {
  tunnel.close(p.id);
  await runtime.rt.stop(handles.get(p.id));
  handles.delete(p.id);
  proxy.remove(p.id);
  for (const d of depsOf(p.id)) await pruneArtifact(d);
  db().projects = projects().filter((x) => x.id !== p.id);
  db().deployments = db().deployments.filter((d) => d.projectId !== p.id);
  db().events = db().events.filter((e) => e.projectId !== p.id);
  rm(path.join(DATA, 'uploads', p.id + '.zip'));
  series.delete(p.id);
  save(); changed(p);
}

/* ---------------- deployments ---------------- */
function createDeployment(p, { trigger, rollbackOf } = {}) {
  // On a public server, user code must run inside Docker containers, never as host processes.
  if (dockerRequired()) throw httpErr(PAUSED, 503);
  if (busy.has(p.id)) throw httpErr('A deployment is already running for this project', 409);
  const target = rollbackOf ? getDep(rollbackOf) : null;
  if (rollbackOf && (!target || target.projectId !== p.id || target.status !== 'success' || target.artifactPruned)) throw httpErr('Can only roll back to a successful deployment whose release is still kept');
  if (target && p.activeDeploymentId === target.id) throw httpErr('That release is already live');
  const number = depsOf(p.id).reduce((m, d) => Math.max(m, d.number), 0) + 1;
  const d = {
    id: id(5), projectId: p.id, number, status: 'queued', trigger, mode: target ? target.mode : runtime.mode(), createdAt: iso(),
    rollbackOf: target ? target.id : null, stages: STAGES.map(([key, name]) => ({ key, name, status: 'pending' })),
    commit: target ? target.commit : null, stack: target ? target.stack : null, warnings: [], files: target ? target.files : {},
  };
  db().deployments.push(d);
  liveLogs.set(d.id, []);
  busy.add(p.id);
  addEvent(p.id, 'info', `Deployment #${number} queued (${trigger})`);
  save(); changed(p);
  enqueue(() => pipeline(p, d, target));
  return d;
}

// Limit concurrent builds so a small server is not overwhelmed.
const queue = [];
let active = 0;
const MAX_BUILDS = +process.env.MAX_CONCURRENT_BUILDS || 2;
function enqueue(job) { queue.push(job); pump(); }
function pump() {
  while (active < MAX_BUILDS && queue.length) {
    const job = queue.shift();
    active++;
    job().catch((e) => console.error('[pipeline]', e)).finally(() => { active--; pump(); });
  }
}

function log(d, stage, text, level = 'info') {
  // eslint-disable-next-line no-control-regex
  const clean = String(text).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').slice(0, 4000);
  const e = { t: now(), stage, text: clean, level };
  const arr = liveLogs.get(d.id) || [];
  arr.push(e);
  if (arr.length > 20000) arr.splice(0, 2000);
  liveLogs.set(d.id, arr);
  bus.emit('log:' + d.id, e);
}
function getLogs(depId) {
  if (liveLogs.has(depId)) return liveLogs.get(depId);
  try { return JSON.parse(fs.readFileSync(path.join(DATA, 'logs', depId + '.json'), 'utf8')); } catch { return []; }
}
function persistLogs(d) {
  mkdirp(path.join(DATA, 'logs'));
  fs.writeFile(path.join(DATA, 'logs', d.id + '.json'), JSON.stringify(liveLogs.get(d.id) || []), () => {});
  setTimeout(() => liveLogs.delete(d.id), 10 * 60000);
}

function maskFor(p) {
  const secrets = [p.source.token, ...Object.values(p.env || {})].filter((v) => v && String(v).length >= 4).map(String);
  return (s) => secrets.reduce((acc, v) => acc.split(v).join('••••••'), s);
}

async function fetchSource(p, d, work, L, mask) {
  const src = path.join(work, 'src');
  mkdirp(work);
  if (p.source.type === 'github') {
    if (!runtime.info.git) throw new Error('Git is not installed on this server');
    const url = p.source.token ? p.source.repoUrl.replace('https://', `https://x-access-token:${encodeURIComponent(p.source.token)}@`) : p.source.repoUrl;
    const args = ['clone', '--depth', '1', ...(p.source.branch ? ['--branch', p.source.branch] : []), url + '.git', src];
    L(`$ git clone --depth 1 ${p.source.branch ? `--branch ${p.source.branch} ` : ''}${p.source.repoUrl}.git`, 'cmd');
    const r = await run('git', args, { onLine: (l) => L(l), timeout: 5 * 60000, mask, env: { GIT_TERMINAL_PROMPT: '0' } });
    if (r.code !== 0) throw new Error('Clone failed – check the repository URL, the branch name, and (for private repos) the access token');
    const meta = (await run('git', ['-C', src, 'log', '-1', '--format=%H%x1f%h%x1f%s%x1f%an'])).out.trim().split('\x1f');
    const branch = (await run('git', ['-C', src, 'rev-parse', '--abbrev-ref', 'HEAD'])).out.trim();
    d.commit = { sha: meta[0], short: meta[1], message: meta[2], author: meta[3], branch: p.source.branch || branch };
    L(`Checked out ${d.commit.short} on ${d.commit.branch} – "${d.commit.message}" by ${d.commit.author}`, 'success');
  } else if (p.source.type === 'zip') {
    const zip = path.join(DATA, 'uploads', p.id + '.zip');
    if (!exists(zip)) throw new Error('No ZIP uploaded yet – upload one from Settings');
    mkdirp(src);
    L(`Extracting ${p.source.fileName}`);
    let r = await run('tar', ['-xf', zip, '-C', src]);
    if (r.code !== 0) r = await run('unzip', ['-q', '-o', zip, '-d', src]);
    if (r.code !== 0) throw new Error('Could not extract the ZIP file');
    const entries = fs.readdirSync(src).filter((n) => !n.startsWith('__MACOSX'));
    if (entries.length === 1 && fs.statSync(path.join(src, entries[0])).isDirectory()) {
      const only = path.join(src, entries[0]);
      const flat = path.join(work, 'flat');
      fs.renameSync(only, flat); await rm(src); fs.renameSync(flat, src);
    }
    d.commit = { short: 'upload', message: `Uploaded ${p.source.fileName}`, author: 'you' };
    L(`Extracted ${fs.readdirSync(src).length} top-level entries`, 'success');
  } else {
    copyDir(path.join(ROOT, 'samples', p.source.sample), src);
    d.commit = { short: 'template', message: `Template ${p.source.sample}`, author: 'ShipStack' };
    L(`Copied template "${p.source.sample}"`, 'success');
  }
  const dir = inside(src, p.source.rootDir);
  if (!exists(dir)) throw new Error(`Root directory "${p.source.rootDir}" does not exist in the source`);
  if (p.source.rootDir) L(`Using root directory ${p.source.rootDir}`);
  return dir;
}

function probe(port, pathName = '/', timeout = 5000) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const req = http.get({ host: '127.0.0.1', port, path: pathName, timeout, headers: { 'User-Agent': 'ShipStack-HealthCheck' } }, (res) => {
      res.resume();
      res.on('end', () => resolve({ up: res.statusCode < 500, code: res.statusCode, ms: Math.max(1, Math.round(Number(process.hrtime.bigint() - t0) / 1e6)) }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ up: false, code: 0, ms: 0, error: e.code || e.message }));
  });
}

async function startRelease(p, d, release, stack, L = () => {}) {
  const plan = PLANS[p.plan] || PLANS.starter;
  const env = { ...p.env };
  if (release.mode === 'docker') {
    const up = await freePort(15000, 16000);
    return runtime.docker.start(p, d, release, up, env, plan, L);
  }
  const up = release.staticDir ? null : stack && stack.fixedPort ? stack.containerPort : await freePort(15000, 16000);
  return runtime.native.start(p, d, release, up, env, plan, L, stack);
}
const targetFor = (h) => (h.type === 'static' ? { type: 'static', dir: h.dir, spa: h.spa, index: h.index } : { type: 'upstream', port: h.port });

async function waitHealthy(p, h, L) {
  if (h.type === 'static') { L('Static files in place – HTTP 200', 'success'); return { code: 200, ms: 1 }; }
  const hp = p.overrides.healthPath || '/';
  L(`Probing http://127.0.0.1:${h.port}${hp} (timeout 120s)`);
  const t0 = now();
  for (let i = 1; now() - t0 < 120000; i++) {
    const r = await probe(h.port, hp);
    if (r.up) { L(`Healthy – HTTP ${r.code} in ${r.ms} ms after ${((now() - t0) / 1000).toFixed(1)}s`, 'success'); return r; }
    if (!(await runtime.rt.isRunning(h))) throw new Error('The app exited during start-up – see its output above');
    if (i <= 3 || i % 5 === 0) L(`Attempt ${i}: ${r.code ? `HTTP ${r.code}` : `waiting for the app to accept connections (${r.error})`}`);
    await sleep(i < 5 ? 1000 : 2000);
  }
  throw new Error('Health check timed out after 120s – the app never answered on its port');
}

async function pipeline(p, d, target) {
  const mask = maskFor(p);
  const plan = PLANS[p.plan] || PLANS.starter;
  const work = path.join(DATA, 'work', d.id);
  let current = null;
  let newHandle = null;
  const setStage = (key, status, note) => {
    const st = d.stages.find((x) => x.key === key);
    st.status = status;
    if (status === 'running') { st.startedAt = now(); current = key; } else if (st.startedAt) st.endedAt = now();
    if (note !== undefined) st.note = note;
    bus.emit('stage:' + d.id, d.stages);
    changed(p);
  };
  const L = (stage) => (text, level) => log(d, stage, mask(String(text)), level);
  const fail = (stage, msg) => { const e = new Error(msg); e.stage = stage; return e; };

  d.status = 'running'; d.startedAt = iso();
  const t0 = now();
  log(d, 'system', `ShipStack pipeline for ${p.name} – deployment #${d.number} (${d.trigger}) – runtime: ${d.mode} – plan: ${plan.name} (${plan.memory} RAM, ${plan.cpus} vCPU)`);
  try {
    let release, stack;
    if (target) {
      ['source', 'scan', 'test', 'build'].forEach((k) => setStage(k, 'skipped', `reusing #${target.number}`));
      log(d, 'source', `Rolling back to deployment #${target.number} (${target.commit ? target.commit.short : ''})`);
      release = target.release; stack = target.stackFull;
    } else {
      /* 1. source */
      setStage('source', 'running');
      const src = await fetchSource(p, d, work, L('source'), mask);
      setStage('source', 'success', d.commit.short);

      /* 2. detect & scan */
      setStage('scan', 'running');
      stack = detect(src, p.overrides, p.source.repoUrl ? p.source.repoUrl.split('/').pop() : p.name);
      if (!stack) throw fail('scan', 'Could not detect the project type. Add a Dockerfile, package.json, requirements.txt, go.mod or index.html (or set the root directory in Settings).');
      d.stackFull = stack;
      if (stack.generatedPackage) {
        fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify(stack.generatedPackage, null, 2) + '\n');
        L('scan')(`No package.json found, so one was generated from the code's require() lines: ${Object.keys(stack.generatedPackage.dependencies).join(', ') || 'no packages'}`, 'warn');
      }
      if (stack.startFix) L('scan')(stack.startFix, 'warn');
      if (stack.indexFile && stack.indexFile !== 'index.html') L('scan')(`No index.html found, so ${stack.indexFile} is served as the home page`, 'warn');
      if (stack.kind === 'node' && stack.containerPort !== 3000) L('scan')(`App listens on fixed port ${stack.containerPort} (process.env.PORT not used)`);
      d.stack = { language: stack.language, framework: stack.framework, stack: stack.stack, containerPort: stack.containerPort, ownDockerfile: stack.ownDockerfile };
      L('scan')(`Detected ${stack.framework} (${stack.language}) – ${stack.fileCount} files scanned`, 'success');
      L('scan')(`Container port ${stack.containerPort}${stack.tests ? ` · test command: ${stack.tests === 'pytest' ? 'python -m pytest -q' : stack.tests}` : ' · no test suite found'}`);
      const secrets = secretScan(src);
      if (secrets.length) { secrets.forEach((s) => L('scan')(`Security scan: ${s}`, 'warn')); d.warnings.push(`Security scan found ${secrets.length} possible secret(s) committed to the source. Move them to environment variables.`); }
      else L('scan')('Security scan: no committed secrets or keys found', 'success');
      const ownDf = stack.ownDockerfile ? fs.readFileSync(path.join(src, 'Dockerfile'), 'utf8') : null;
      d.files = generatedFiles(p, stack, plan, ownDf);
      if (d.mode === 'native' && !stack.ownDockerfile) L('scan')('Docker is not available – the app will run as a native process (resource limits not enforced)', 'warn');
      // Front-end frameworks read public variables at build time, not at runtime: write them where Vite/CRA/Next look.
      if (['spa', 'next'].includes(stack.kind)) {
        const pub = Object.entries(p.env || {}).filter(([k]) => /^(VITE_|REACT_APP_|NEXT_PUBLIC_|PUBLIC_)/.test(k));
        if (pub.length) {
          fs.writeFileSync(path.join(src, '.env.production.local'), pub.map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
          L('scan')(`Build-time variables: ${pub.map(([k]) => k).join(', ')}`);
        }
      }
      setStage('scan', 'success', stack.framework);

      /* 3. tests */
      if (!p.services.tests) { L('test')('Automated testing is disabled for this project'); setStage('test', 'skipped', 'disabled'); }
      else if (!stack.tests) { L('test')('No test suite detected (package.json "test" script, pytest files or Go tests) – skipping'); setStage('test', 'skipped', 'no tests'); }
      else {
        setStage('test', 'running');
        let r;
        if (d.mode === 'docker') r = await runtime.docker.test(src, stack, p.env, L('test'), mask);
        else { const dir = await runtime.native.install(src, stack, d, p.env, L('test'), mask); r = await runtime.native.test(dir, stack, p.env, L('test'), mask); }
        if (r.noTests) { L('test')('pytest found no tests to run – skipping'); setStage('test', 'skipped', 'no tests'); }
        else if (!r.ok && p.overrides.allowTestFailure) { L('test')('Tests failed – continuing because "Continue on test failure" is on', 'warn'); d.warnings.push('Tests failed but the release continued (test gate disabled in Settings).'); setStage('test', 'success', 'failed (ignored)'); }
        else if (!r.ok) throw fail('test', 'Tests failed – deployment stopped. Fix the failing tests or disable the test gate in Settings.');
        else { L('test')('All tests passed', 'success'); setStage('test', 'success', 'passed'); }
      }

      /* 4. build */
      setStage('build', 'running');
      if (d.mode === 'docker') release = await runtime.docker.build(src, stack, p, d, L('build'), mask);
      else { const dir = await runtime.native.install(src, stack, d, p.env, L('build'), mask); release = await runtime.native.build(dir, stack, p, p.env, L('build'), mask); }
      d.release = release;
      d.image = release.image || null;
      setStage('build', 'success', d.mode === 'docker' ? 'image built' : 'release ready');
    }

    /* 5. deploy */
    setStage('deploy', 'running');
    if (d.mode === 'native' && stack && stack.fixedPort && handles.get(p.id)) { await runtime.rt.stop(handles.get(p.id)); handles.delete(p.id); }
    newHandle = await startRelease(p, d, release, stack, L('deploy'));
    setStage('deploy', 'success', newHandle.type === 'docker' ? 'container started' : newHandle.type === 'static' ? 'files published' : 'process started');

    /* 6. health */
    setStage('health', 'running');
    const hc = await waitHealthy(p, newHandle, L('health'));
    setStage('health', 'success', `HTTP ${hc.code} · ${hc.ms} ms`);

    /* 7. release – swap traffic, then retire the old release */
    setStage('release', 'running');
    const old = handles.get(p.id);
    const prev = p.activeDeploymentId ? getDep(p.activeDeploymentId) : null;
    proxy.setTarget(p, targetFor(newHandle));
    handles.set(p.id, newHandle);
    p.runtime = { ...newHandle };
    L('release')(`Traffic switched to deployment #${d.number} with zero downtime`, 'success');
    if (old) { setTimeout(() => runtime.rt.stop(old), 2000); if (prev) L('release')(`Stopped previous release #${prev.number}`); }
    if (prev) prev.superseded = true;
    if (target) d.release = target.release, d.stackFull = target.stackFull, d.image = target.image;
    newHandle = null;
    Object.assign(p, { activeDeploymentId: d.id, status: 'live', lastDeployedAt: iso(), updatedAt: iso() });
    health.set(p.id, { fails: 0 });
    L('release')(APP_DOMAIN ? `🚀 Live at https://${p.slug}.${APP_DOMAIN}` : `🚀 Live at http://localhost:${p.port}  ·  http://${p.slug}.localhost:${PORT}`, 'success');
    setStage('release', 'success', 'live');
    d.status = 'success';
    addEvent(p.id, 'success', `Deployment #${d.number} is live (${((now() - t0) / 1000).toFixed(1)}s)${target ? ' – rollback' : ''}`);
    if (p.services.publicUrl) openPublic(p);
  } catch (e) {
    const stage = e.stage || current || 'source';
    const idx = STAGES.findIndex((s) => s[0] === stage);
    d.stages.forEach((st, i) => { if (i === idx) { st.status = 'failed'; st.note = 'failed'; st.endedAt = now(); } else if (i > idx && st.status === 'pending') st.status = 'skipped'; });
    bus.emit('stage:' + d.id, d.stages);
    log(d, stage, `✖ ${mask(e.message)}`, 'error');
    if (newHandle) {
      const out = await runtime.rt.logs(newHandle, 25).catch(() => '');
      if (out) { log(d, stage, 'Last output from the app:', 'warn'); out.split(/\r?\n/).filter(Boolean).slice(-25).forEach((l) => log(d, stage, '  ' + mask(l))); }
      await runtime.rt.stop(newHandle);
    }
    Object.assign(d, { status: 'failed', error: mask(e.message), failedStage: stage });
    if (!target) await pruneArtifact(d, true);
    p.status = p.activeDeploymentId ? 'live' : 'failed';
    if (p.activeDeploymentId) log(d, 'system', `Release #${getDep(p.activeDeploymentId).number} keeps serving traffic`);
    addEvent(p.id, 'error', `Deployment #${d.number} failed at "${STAGES[idx] ? STAGES[idx][1] : stage}": ${mask(e.message)}`);
  } finally {
    d.finishedAt = iso();
    d.durationMs = now() - t0;
    delete d._installed;
    busy.delete(p.id);
    rm(work);
    persistLogs(d);
    save();
    bus.emit('status:' + d.id, { status: d.status, error: d.error });
    changed(p);
    pruneOld(p);
  }
}

async function pruneArtifact(d, failed = false) {
  if (d.artifactPruned) return;
  if (d.release && d.release.mode === 'docker' && d.release.image) await runtime.docker.removeImage(d.release.image);
  if (d.mode === 'native' || (d.release && d.release.mode === 'native')) await rm(path.join(DATA, 'releases', d.id));
  if (!failed) d.artifactPruned = true;
}
async function pruneOld(p) {
  const ok = depsOf(p.id).filter((d) => d.status === 'success' && !d.artifactPruned && d.id !== p.activeDeploymentId);
  for (const d of ok.slice(KEEP_RELEASES - 1)) await pruneArtifact(d);
  save();
}

/* ---------------- lifecycle actions ---------------- */
async function stopProject(p) {
  tunnel.close(p.id);
  await runtime.rt.stop(handles.get(p.id));
  handles.delete(p.id);
  p.status = 'stopped'; p.runtime = null;
  proxy.setStatus(p, 'stopped');
  addEvent(p.id, 'warn', 'App stopped by owner');
  save(); changed(p);
}
async function startProject(p, reason = 'start') {
  const d = getDep(p.activeDeploymentId);
  if (!d || !d.release || d.artifactPruned) throw httpErr('No release to start – deploy first');
  await runtime.rt.stop(handles.get(p.id));
  const h = await startRelease(p, d, d.release, d.stackFull);
  await waitHealthy(p, h, () => {}).catch(() => {});
  handles.set(p.id, h);
  p.runtime = { ...h }; p.status = 'live';
  proxy.setTarget(p, targetFor(h));
  health.set(p.id, { fails: 0 });
  addEvent(p.id, 'success', `Started release #${d.number} (${reason})`);
  if (p.services.publicUrl) openPublic(p);
  save(); changed(p);
}
async function restartProject(p, reason = 'restart') {
  const h = handles.get(p.id);
  if (h && h.type === 'docker') { await runtime.docker.restart(h); addEvent(p.id, 'info', 'Container restarted'); changed(p); return; }
  await startProject(p, reason);
}
async function appLogs(p, tail) {
  const h = handles.get(p.id);
  if (!h || p.status === 'stopped') return '(no output yet)';
  return maskFor(p)(await runtime.rt.logs(h, tail));
}

async function openPublic(p) {
  if (APP_DOMAIN || tunnel.get(p.id)) return; // on a real domain every app is already public
  const t = await tunnel.open(p.id, p.port).catch((e) => { addEvent(p.id, 'warn', `Public URL failed: ${e.message}`); return null; });
  if (t) { addEvent(p.id, 'success', `Public URL ready via ${t.provider}: ${t.url}`); changed(p); }
}

/* ---------------- monitoring & auto-heal ---------------- */
async function monitorTick() {
  const live = projects().filter((p) => p.status === 'live' && handles.has(p.id));
  const stats = runtime.info.docker ? await runtime.docker.stats(live.map((p) => handles.get(p.id))).catch(() => ({})) : {};
  for (const p of live) {
    const h = handles.get(p.id);
    if (!h) continue;
    const r = h.type === 'static' ? { up: true, code: 200, ms: 1 } : await probe(h.port, p.overrides.healthPath || '/');
    const st = h.type === 'docker' ? stats[h.container] || {} : {};
    const rate = proxy.rates(p.id);
    const arr = series.get(p.id) || [];
    arr.push({ t: now(), up: r.up, code: r.code, ms: r.up ? r.ms : 0, cpu: r.up ? st.cpu ?? null : null, mem: r.up ? st.mem ?? null : null, rpm: rate.rpm, err: rate.err });
    if (arr.length > 180) arr.shift();
    series.set(p.id, arr);
    const hs = health.get(p.id) || { fails: 0 };
    if (r.up) {
      if (hs.fails >= 3) addEvent(p.id, 'success', `Recovered – responding again (HTTP ${r.code})`);
      hs.fails = 0;
    } else {
      hs.fails++;
      if (hs.fails === 3) {
        addEvent(p.id, 'warn', `Down: 3 consecutive failed health checks (${r.error || 'HTTP ' + r.code})`);
        if (p.services.monitoring) {
          addEvent(p.id, 'error', 'Health checks failing – auto-healing (restarting the app)');
          restartProject(p, 'auto-heal').catch((e) => addEvent(p.id, 'error', `Auto-heal failed: ${e.message}`));
        }
      } else if (p.services.monitoring && hs.fails > 3 && hs.fails % 6 === 0) {
        restartProject(p, 'auto-heal').catch(() => {});
      }
    }
    health.set(p.id, hs);
    changed(p);
  }
}

/* ---------------- continuous deployment (polling) ---------------- */
async function pollTick() {
  for (const p of projects()) {
    if (p.source.type !== 'github' || !p.services.autoDeploy || busy.has(p.id) || p.status === 'stopped') continue;
    const active = getDep(p.activeDeploymentId);
    const last = active || depsOf(p.id)[0];
    if (!last || !last.commit || !last.commit.sha) continue;
    const url = p.source.token ? p.source.repoUrl.replace('https://', `https://x-access-token:${encodeURIComponent(p.source.token)}@`) : p.source.repoUrl;
    const r = await run('git', ['ls-remote', url + '.git', p.source.branch ? `refs/heads/${p.source.branch}` : 'HEAD'], { timeout: 20000, env: { GIT_TERMINAL_PROMPT: '0' } });
    const sha = r.code === 0 ? r.out.trim().split(/\s+/)[0] : null;
    if (!sha || sha === last.commit.sha || (p._lastFailedSha === sha)) continue;
    addEvent(p.id, 'info', `New commit ${sha.slice(0, 7)} detected on ${p.source.branch || last.commit.branch || 'the default branch'} – auto-deploying`);
    try {
      const d = createDeployment(p, { trigger: 'git push' });
      bus.once('status:' + d.id, (s) => { p._lastFailedSha = s.status === 'failed' ? sha : null; });
    } catch { /* busy */ }
  }
}

/* ---------------- boot: restore running apps ---------------- */
async function restore() {
  for (const d of db().deployments) if (d.status === 'running' || d.status === 'queued') Object.assign(d, { status: 'failed', error: 'The ShipStack server restarted during this deployment', finishedAt: iso() });
  for (const p of projects()) {
    proxy.ensure(p);
    const d = getDep(p.activeDeploymentId);
    if (p.status === 'stopped') { proxy.setStatus(p, 'stopped'); continue; }
    // A native process left over from a crash or hard kill is still holding its port: clean it up first.
    if (p.runtime && p.runtime.type === 'native' && p.runtime.pid && await portAnswers(p.runtime.port)) { killTree(p.runtime.pid); await sleep(500); }
    if (p.status === 'stopped') continue;
    if (!d || !d.release) { p.status = d ? p.status : 'failed'; continue; }
    try {
      if (d.release.mode === 'docker' && p.runtime && p.runtime.type === 'docker' && runtime.info.docker && await runtime.docker.isRunning(p.runtime)) {
        handles.set(p.id, p.runtime);
        proxy.setTarget(p, targetFor(p.runtime));
      } else if (d.release.mode === 'docker' && !runtime.info.docker) {
        p.status = 'failed';
        addEvent(p.id, 'warn', 'Docker is not running – start Docker Desktop and press Start');
        continue;
      } else {
        const h = await startRelease(p, d, d.release, d.stackFull);
        handles.set(p.id, h);
        p.runtime = { ...h };
        proxy.setTarget(p, targetFor(h));
      }
      p.status = 'live';
      health.set(p.id, { fails: 0 });
      if (p.services.publicUrl) openPublic(p);
    } catch (e) {
      p.status = 'failed';
      addEvent(p.id, 'error', `Could not restart after server reboot: ${e.message}`);
    }
  }
  save();
}

/* ---------------- views for the API ---------------- */
const clone = (o) => JSON.parse(JSON.stringify(o));
function brief(d) {
  if (!d) return null;
  const o = clone(d);
  delete o.files; delete o.release; delete o.stackFull;
  o.rollbackOf = d.rollbackOf ? (getDep(d.rollbackOf) || {}).number : null;
  return o;
}
function summary(pid) {
  const arr = series.get(pid) || [];
  const lat = arr.filter((x) => x.up).map((x) => x.ms);
  return { last: arr[arr.length - 1] || null, uptime: arr.length ? Math.round((arr.filter((x) => x.up).length / arr.length) * 1000) / 10 : null, avgLatency: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null, points: arr.length };
}
function view(p, full, baseUrl, lan) {
  const ds = depsOf(p.id);
  const active = getDep(p.activeDeploymentId);
  const v = {
    id: p.id, name: p.name, slug: p.slug, plan: p.plan, services: p.services, env: p.env, overrides: p.overrides, port: p.port,
    status: p.status, createdAt: p.createdAt, updatedAt: p.updatedAt, lastDeployedAt: p.lastDeployedAt, activeDeploymentId: p.activeDeploymentId,
    source: { ...p.source, token: undefined, hasToken: !!p.source.token },
    stack: active && active.stack ? active.stack : (ds[0] && ds[0].stack) || null,
    deploying: busy.has(p.id), latest: brief(ds[0]), active: brief(active),
    links: APP_DOMAIN
      ? { local: `https://${p.slug}.${APP_DOMAIN}`, subdomain: `https://${p.slug}.${APP_DOMAIN}`, lan: null, public: `https://${p.slug}.${APP_DOMAIN}` }
      : { local: `http://localhost:${p.port}`, subdomain: `http://${p.slug}.localhost:${PORT}`, lan: lan ? `http://${lan}:${p.port}` : null, public: (tunnel.get(p.id) || {}).url || null },
    metrics: summary(p.id), deployCount: ds.length,
  };
  if (full) {
    v.deployments = ds.map(brief);
    v.events = db().events.filter((e) => e.projectId === p.id).slice(-40).reverse();
    v.series = series.get(p.id) || [];
    v.webhookUrl = `${baseUrl}/api/hooks/${p.id}?token=${p.hookToken}`;
    v.plans = PLANS;
  }
  return v;
}

function startLoops() {
  setInterval(() => monitorTick().catch((e) => console.error('[monitor]', e)), 10000);
  setInterval(() => pollTick().catch((e) => console.error('[poll]', e)), 60000);
}

module.exports = {
  bus, PLANS, SAMPLES, PORT, APP_DOMAIN, projects, getProject, getDep, depsOf, getLogs, createProject, updateProject, deleteProject,
  createDeployment, stopProject, startProject, restartProject, appLogs, openPublic, restore, startLoops, view, brief, busy, httpErr, tunnel, changed, addEvent,
};

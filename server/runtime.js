// Runtimes: run apps as Docker containers (isolated, resource-limited) or as native processes (fallback).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { IS_WIN, DATA, run, killTree, exists, mkdirp, copyDir } = require('./util');
const { dockerfile, NGINX } = require('./detect');

const info = { docker: false, dockerVersion: null, git: null, python: null, go: false, node: process.version };

async function probeTools() {
  const d = await run('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 15000 });
  info.docker = d.code === 0 && /^\d/.test(d.out.trim());
  info.dockerVersion = info.docker ? d.out.trim() : null;
  const g = await run('git', ['--version'], { timeout: 10000 });
  info.git = g.code === 0 ? g.out.trim() : null;
  for (const py of IS_WIN ? ['python', 'py'] : ['python3', 'python']) {
    const r = await run(py, ['--version'], { timeout: 10000 });
    if (r.code === 0 && /Python 3/.test(r.out)) { info.python = py; break; }
  }
  info.go = (await run('go', ['version'], { timeout: 10000 })).code === 0;
  return info;
}
const mode = () => (process.env.SHIPSTACK_RUNTIME === 'native' ? 'native' : info.docker ? 'docker' : 'native');

/* =============================== DOCKER =============================== */
const docker = {
  async test(src, s, env, log, mask) {
    const script = {
      'npm test': 'cp -r /src /app && cd /app && (npm ci || npm install) && npm test',
      pytest: 'cp -r /src /app && cd /app && (if [ -f requirements.txt ]; then pip install -q -r requirements.txt; fi) && pip install -q pytest && python -m pytest -q',
      'go test': 'cp -r /src /app && cd /app && go test ./...',
    }[s.tests];
    const image = s.tests === 'pytest' ? 'python:3.12-slim' : s.tests === 'go test' ? 'golang:1.22-alpine' : 'node:20-alpine';
    log(`$ docker run --rm ${image} sh -c "${script.replace('cp -r /src /app && cd /app && ', '')}"`, 'cmd');
    const r = await run('docker', ['run', '--rm', '--memory', '1g', '--pids-limit', '512', '--security-opt', 'no-new-privileges', '-v', `${src}:/src:ro`, ...envFlags(env), image, 'sh', '-c', script], { onLine: (l) => log(l), timeout: 15 * 60000, mask });
    return { ok: r.code === 0, noTests: s.tests === 'pytest' && r.code === 5 };
  },

  async build(src, s, p, dep, log, mask) {
    const image = `shipstack/${p.slug}:${dep.id}`;
    let file = 'Dockerfile';
    if (!s.ownDockerfile) {
      file = 'Dockerfile.shipstack';
      fs.writeFileSync(path.join(src, file), dockerfile(s, p.overrides));
      if (s.spa) fs.writeFileSync(path.join(src, 'shipstack-nginx.conf'), NGINX);
    }
    if (!exists(path.join(src, '.dockerignore'))) fs.writeFileSync(path.join(src, '.dockerignore'), 'node_modules\n.git\n.venv\nvenv\n__pycache__\n.env\n');
    log(`$ docker build -t ${image} -f ${file} .`, 'cmd');
    const r = await run('docker', ['build', '--progress=plain', '-t', image, '-f', path.join(src, file), src], { onLine: (l) => log(l), timeout: 30 * 60000, mask });
    if (r.code !== 0) throw new Error('Image build failed – see the build log above');
    const size = await run('docker', ['image', 'inspect', image, '--format', '{{.Size}}']);
    log(`Image ${image} built – ${(Number(size.out.trim()) / 1048576 || 0).toFixed(1)} MB`, 'success');
    return { mode: 'docker', image, containerPort: s.containerPort };
  },

  async start(p, dep, release, upPort, env, plan, log = () => {}) {
    const name = `shipstack-${p.slug}-${dep.id}`;
    await run('docker', ['rm', '-f', name]);
    const args = ['run', '-d', '--name', name, '-p', `127.0.0.1:${upPort}:${release.containerPort}`, '--memory', plan.memory, '--cpus', plan.cpus,
      '--pids-limit', '256', '--security-opt', 'no-new-privileges', '--restart', 'no',
      '-e', `PORT=${release.containerPort}`, ...envFlags(env), '--label', `shipstack.project=${p.id}`, release.image];
    log(`$ docker run -d --name ${name} -p ${upPort}:${release.containerPort} --memory ${plan.memory} --cpus ${plan.cpus} ${release.image}`, 'cmd');
    const r = await run('docker', args);
    if (r.code !== 0) throw new Error(r.out.trim().split('\n').pop() || 'docker run failed');
    log(r.out.trim().slice(0, 24));
    return { type: 'docker', container: name, port: upPort };
  },
  async stop(h) { if (h && h.container) await run('docker', ['rm', '-f', h.container]); },
  async restart(h) { await run('docker', ['restart', '-t', '3', h.container]); },
  async isRunning(h) { const r = await run('docker', ['inspect', '-f', '{{.State.Running}}', h.container]); return r.code === 0 && r.out.trim() === 'true'; },
  async logs(h, tail = 300) { const r = await run('docker', ['logs', '--timestamps', '--tail', String(tail), h.container]); return r.out; },
  async stats(handles) {
    const names = handles.filter((h) => h && h.type === 'docker').map((h) => h.container);
    const out = {};
    if (!names.length) return out;
    const r = await run('docker', ['stats', '--no-stream', '--format', '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}', ...names], { timeout: 20000 });
    for (const line of r.out.split(/\r?\n/)) {
      const [n, cpu, mem] = line.split('|');
      if (!n || !mem) continue;
      const m = mem.split('/')[0].trim().match(/([\d.]+)\s*([KMG]i?B)/i);
      const mb = m ? +m[1] * ({ k: 1 / 1024, m: 1, g: 1024 }[m[2][0].toLowerCase()] || 1) : null;
      out[n] = { cpu: parseFloat(cpu) || 0, mem: mb != null ? Math.round(mb * 10) / 10 : null };
    }
    return out;
  },
  async removeImage(image) { await run('docker', ['rmi', '-f', image]); },
};
const envFlags = (env) => Object.entries(env || {}).flatMap(([k, v]) => ['-e', `${k}=${v}`]);

/* =============================== NATIVE =============================== */
const procs = new Map(); // deployment id -> { proc, logs[] }
const pyBin = (dir) => (IS_WIN ? path.join(dir, '.venv', 'Scripts', 'python.exe') : path.join(dir, '.venv', 'bin', 'python'));

const native = {
  releaseDir: (dep) => path.join(DATA, 'releases', dep.id),

  /** Copy the source into a release folder and install dependencies (idempotent). */
  async install(src, s, dep, env, log, mask) {
    const dir = native.releaseDir(dep);
    if (dep._installed) return dir;
    if (s.kind === 'docker') throw new Error('This repository ships its own Dockerfile. Start Docker Desktop, or turn on "Ignore repository Dockerfile" in Settings.');
    copyDir(src, dir);
    const sh = { cwd: dir, env, onLine: (l) => log(l), timeout: 20 * 60000, mask };
    if (s.language === 'Node.js') {
      const lock = exists(path.join(dir, 'package-lock.json'));
      log(`$ npm ${lock ? 'ci' : 'install'}`, 'cmd');
      let r = await run('npm', [lock ? 'ci' : 'install', '--no-audit', '--no-fund'], { ...sh, shell: true, env: { ...env, NODE_ENV: 'development' } });
      if (r.code !== 0 && lock) { log('npm ci failed, retrying with npm install', 'warn'); r = await run('npm', ['install', '--no-audit', '--no-fund'], { ...sh, shell: true, env: { ...env, NODE_ENV: 'development' } }); }
      if (r.code !== 0) throw new Error('Installing dependencies failed');
    } else if (s.language === 'Python') {
      if (!info.python) throw new Error('Python 3 is not installed on this server (or start Docker Desktop to build in a container)');
      log(`$ ${info.python} -m venv .venv`, 'cmd');
      if ((await run(info.python, ['-m', 'venv', '.venv'], sh)).code !== 0) throw new Error('Could not create a Python virtual environment');
      const extra = { fastapi: ['uvicorn'], flask: s.framework === 'Flask' ? [] : ['flask'] }[s.kind] || [];
      const reqArgs = exists(path.join(dir, 'requirements.txt')) ? ['-r', 'requirements.txt'] : exists(path.join(dir, 'pyproject.toml')) ? ['.'] : [];
      log(`$ pip install ${[...reqArgs, ...extra].join(' ')}`, 'cmd');
      const r = await run(pyBin(dir), ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', ...reqArgs, ...extra], sh);
      if (r.code !== 0) throw new Error('pip install failed');
    } else if (s.language === 'Go' && !info.go) throw new Error('Go is not installed on this server (or start Docker Desktop)');
    dep._installed = true;
    return dir;
  },

  async test(dir, s, env, log, mask) {
    const sh = { cwd: dir, env, onLine: (l) => log(l), timeout: 15 * 60000, mask };
    let r;
    if (s.tests === 'npm test') { log('$ npm test', 'cmd'); r = await run('npm', ['test'], { ...sh, shell: true }); }
    else if (s.tests === 'pytest') {
      await run(pyBin(dir), ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', 'pytest'], sh);
      log('$ python -m pytest -q', 'cmd'); r = await run(pyBin(dir), ['-m', 'pytest', '-q', '-p', 'no:cacheprovider'], sh);
    } else { log('$ go test ./...', 'cmd'); r = await run('go', ['test', './...'], sh); }
    return { ok: r.code === 0, noTests: s.tests === 'pytest' && r.code === 5 };
  },

  async build(dir, s, p, env, log, mask) {
    const sh = { cwd: dir, env, onLine: (l) => log(l), timeout: 20 * 60000, mask };
    const o = p.overrides || {};
    const buildCmd = o.buildCmd || ((s.kind === 'spa' || s.kind === 'next' || s.buildScript) ? 'npm run build' : s.kind === 'go' ? `go build -o server${IS_WIN ? '.exe' : ''} .` : null);
    if (buildCmd) {
      log(`$ ${buildCmd}`, 'cmd');
      const r = await run(buildCmd, [], { ...sh, shell: true, env: { ...env, NODE_ENV: 'production' } });
      if (r.code !== 0) throw new Error('Build command failed');
    } else log('No build step needed');
    const release = { mode: 'native', dir, kind: s.kind, containerPort: null };
    if (s.kind === 'static') release.staticDir = path.join(dir, s.staticRoot || '.');
    if (s.kind === 'spa') {
      const out = ['dist', 'build', 'out'].map((d) => findIndex(path.join(dir, d), 4)).find(Boolean);
      if (!out) throw new Error('Build finished but no index.html was found in dist/, build/ or out/');
      release.staticDir = out;
    }
    log(release.staticDir ? `Static files ready in ${path.relative(dir, release.staticDir) || '.'}` : 'Release prepared', 'success');
    return release;
  },

  command(release, s, port, o = {}) {
    const dir = release.dir;
    if (o.startCmd) return { cmd: o.startCmd.replace(/\$\{?PORT\}?/g, String(port)), args: [], shell: true };
    const py = pyBin(dir);
    switch (release.kind) {
      case 'node': return s.startScript ? { cmd: 'npm', args: ['start'], shell: true } : { cmd: process.execPath, args: [s.entry] };
      case 'next': return { cmd: 'npx', args: ['next', 'start', '-p', String(port), '-H', '0.0.0.0'], shell: true };
      case 'flask': return { cmd: py, args: ['-m', 'flask', '--app', `${s.module}:${s.variable}`, 'run', '--host', '0.0.0.0', '--port', String(port)] };
      case 'fastapi': return { cmd: py, args: ['-m', 'uvicorn', `${s.module}:${s.variable}`, '--host', '0.0.0.0', '--port', String(port)] };
      case 'django': return { cmd: py, args: ['manage.py', 'runserver', `0.0.0.0:${port}`, '--noreload'] };
      case 'streamlit': return { cmd: py, args: ['-m', 'streamlit', 'run', s.file, '--server.port', String(port), '--server.address', '0.0.0.0', '--server.headless', 'true', '--browser.gatherUsageStats', 'false'] };
      case 'go': return { cmd: path.join(dir, IS_WIN ? 'server.exe' : 'server'), args: [] };
      default: throw new Error(`Cannot start a ${release.kind} app natively`);
    }
  },

  async start(p, dep, release, upPort, env, plan, log = () => {}, stack) {
    if (release.staticDir) return { type: 'static', dir: release.staticDir, spa: release.kind !== 'static' || true };
    const c = native.command(release, stack, upPort, p.overrides);
    log(`$ ${[c.cmd === process.execPath ? 'node' : path.basename(c.cmd), ...c.args].join(' ')}   (PORT=${upPort})`, 'cmd');
    const opts = { cwd: release.dir, env: { ...process.env, ...env, PORT: String(upPort), HOST: '0.0.0.0', NODE_ENV: 'production', PYTHONUNBUFFERED: '1' }, windowsHide: true, detached: !IS_WIN };
    const proc = c.shell ? spawn([c.cmd, ...c.args].join(' '), { ...opts, shell: true }) : spawn(c.cmd, c.args, opts);
    const entry = { proc, logs: [], exited: null };
    const push = (d) => d.toString().split(/\r?\n/).forEach((l) => { if (l.trim()) { entry.logs.push(`${new Date().toISOString()} ${l}`); if (entry.logs.length > 1500) entry.logs.shift(); } });
    proc.stdout.on('data', push); proc.stderr.on('data', push);
    proc.on('exit', (code) => { entry.exited = code ?? 'signal'; push(`[process exited with code ${entry.exited}]`); });
    proc.on('error', (e) => { entry.exited = -1; push(`[failed to start: ${e.message}]`); });
    procs.set(dep.id, entry);
    return { type: 'native', depId: dep.id, pid: proc.pid, port: upPort };
  },
  async stop(h) {
    if (!h || h.type !== 'native') return;
    const e = procs.get(h.depId);
    killTree(e ? e.proc.pid : h.pid);
    procs.delete(h.depId);
  },
  async isRunning(h) {
    if (h.type === 'static') return true;
    const e = procs.get(h.depId);
    return !!e && e.exited === null;
  },
  async logs(h, tail = 300) {
    if (h.type === 'static') return `${new Date().toISOString()} Serving static files from ${h.dir}`;
    const e = procs.get(h.depId);
    return e ? e.logs.slice(-tail).join('\n') : '(process not running)';
  },
};

function findIndex(dir, depth) {
  if (!exists(dir)) return null;
  if (exists(path.join(dir, 'index.html'))) return dir;
  if (depth <= 0) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) { const f = findIndex(path.join(dir, e.name), depth - 1); if (f) return f; }
  return null;
}

/** Dispatch helpers that work for any handle type. */
const rt = {
  stop: (h) => (h && h.type === 'docker' ? docker.stop(h) : native.stop(h)),
  isRunning: (h) => (!h ? false : h.type === 'docker' ? docker.isRunning(h) : native.isRunning(h)),
  logs: (h, n) => (h.type === 'docker' ? docker.logs(h, n) : native.logs(h, n)),
};

// Native app processes must not outlive the server (Docker containers are left running and re-adopted).
process.on('exit', () => {
  for (const e of procs.values()) {
    try {
      if (IS_WIN) require('child_process').spawnSync('taskkill', ['/pid', String(e.proc.pid), '/T', '/F'], { windowsHide: true });
      else process.kill(-e.proc.pid, 'SIGTERM');
    } catch { /* already gone */ }
  }
});

mkdirp(path.join(DATA, 'releases'));
module.exports = { info, probeTools, mode, docker, native, rt };

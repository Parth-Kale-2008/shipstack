// Stack detection and generation of the DevOps files (Dockerfile, compose, CI workflow, nginx).
const fs = require('fs');
const path = require('path');
const { exists, readText, readJson } = require('./util');

const SERVER_DEPS = ['express', 'fastify', 'koa', '@hapi/hapi', '@nestjs/core', 'hono', 'ejs', 'socket.io', 'http-server'];

function listFiles(dir, depth = 2, base = dir, out = []) {
  if (depth < 0 || out.length > 4000) return out;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (['.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(full, depth - 1, base, out);
    else out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

function pythonTarget(dir, files, wanted) {
  const order = ['app.py', 'main.py', 'wsgi.py', 'application.py', 'server.py', 'api.py', 'streamlit_app.py'];
  const file = order.find((f) => files.includes(f)) || files.find((f) => f.endsWith('.py') && !f.includes('/') && !f.startsWith('test')) || 'app.py';
  const src = readText(path.join(dir, file));
  const m = src.match(new RegExp(`^(\\w+)\\s*=\\s*${wanted}\\(`, 'm'));
  return { file, module: file.replace(/\.py$/, ''), variable: m ? m[1] : 'app' };
}

/** Inspect a source folder and decide how to build, test and run it. */
function detect(dir, overrides = {}) {
  const files = listFiles(dir);
  const has = (f) => files.includes(f);
  const s = { ownDockerfile: false, tests: null, spa: false };

  if (has('Dockerfile') && !overrides.ignoreDockerfile) {
    const m = readText(path.join(dir, 'Dockerfile')).match(/^\s*EXPOSE\s+(\d+)/im);
    Object.assign(s, { kind: 'docker', language: 'Docker', framework: 'Dockerfile', stack: 'docker', containerPort: m ? +m[1] : 3000, image: 'from Dockerfile', ownDockerfile: true });
  } else if (has('package.json')) {
    const pkg = readJson(path.join(dir, 'package.json')) || {};
    const deps = { ...pkg.devDependencies, ...pkg.dependencies };
    const scripts = pkg.scripts || {};
    const hasTest = scripts.test && !/no test specified/i.test(scripts.test);
    s.language = 'Node.js'; s.image = 'node:20-alpine';
    if (hasTest) s.tests = 'npm test';
    if (deps.next) Object.assign(s, { kind: 'next', framework: 'Next.js', stack: 'node', containerPort: 3000 });
    else if (scripts.build && !SERVER_DEPS.some((d) => (pkg.dependencies || {})[d]) && (deps.vite || deps['react-scripts'] || deps['@vue/cli-service'] || deps['@angular/core'] || deps.parcel || deps.svelte)) {
      const fw = deps.react || deps['react-scripts'] ? 'React' : deps.vue ? 'Vue' : deps['@angular/core'] ? 'Angular' : deps.svelte ? 'Svelte' : 'SPA';
      Object.assign(s, { kind: 'spa', framework: deps.vite ? `${fw} + Vite` : fw, stack: 'node-spa', containerPort: 80, spa: true });
    } else {
      const entry = ['server.js', 'index.js', 'app.js', 'main.js', 'src/server.js', 'src/index.js', 'src/app.js'].find(has) || pkg.main || 'index.js';
      const fw = deps.express ? 'Express' : deps.fastify ? 'Fastify' : deps.koa ? 'Koa' : deps['@nestjs/core'] ? 'NestJS' : 'Node.js';
      Object.assign(s, { kind: 'node', framework: fw, stack: 'node', containerPort: 3000, entry, startScript: !!scripts.start, buildScript: !!scripts.build });
    }
  } else if (has('requirements.txt') || has('pyproject.toml') || has('Pipfile')) {
    const req = (readText(path.join(dir, 'requirements.txt')) + readText(path.join(dir, 'pyproject.toml'))).toLowerCase();
    s.language = 'Python'; s.image = 'python:3.12-slim';
    if (files.some((f) => /(^|\/)(test_[^/]*|[^/]*_test)\.py$/.test(f))) s.tests = 'pytest';
    if (/\bstreamlit\b/.test(req)) {
      const file = ['app.py', 'streamlit_app.py', 'main.py', 'Home.py'].find(has) || files.find((f) => f.endsWith('.py') && !f.includes('/')) || 'app.py';
      Object.assign(s, { kind: 'streamlit', framework: 'Streamlit', stack: 'python', containerPort: 8000, file });
    } else if (has('manage.py')) {
      const proj = files.find((f) => /^[^/]+\/wsgi\.py$/.test(f));
      Object.assign(s, { kind: 'django', framework: 'Django', stack: 'python', containerPort: 8000, wsgi: proj ? proj.split('/')[0] + '.wsgi:application' : 'config.wsgi:application' });
    } else if (/\bfastapi\b/.test(req)) {
      Object.assign(s, { kind: 'fastapi', framework: 'FastAPI', stack: 'python', containerPort: 8000, ...pythonTarget(dir, files, 'FastAPI') });
    } else {
      Object.assign(s, { kind: 'flask', framework: /\bflask\b/.test(req) ? 'Flask' : 'Python', stack: 'python', containerPort: 8000, ...pythonTarget(dir, files, 'Flask') });
    }
  } else if (has('go.mod')) {
    Object.assign(s, { kind: 'go', language: 'Go', framework: 'Go', stack: 'go', containerPort: 8080, image: 'golang:1.22-alpine' });
    if (files.some((f) => f.endsWith('_test.go'))) s.tests = 'go test';
  } else if (has('index.html') || files.some((f) => /^(public|site|docs)\/index\.html$/.test(f))) {
    const root = has('index.html') ? '.' : files.find((f) => /index\.html$/.test(f)).split('/')[0];
    Object.assign(s, { kind: 'static', language: 'HTML/CSS/JS', framework: 'Static site', stack: 'static', containerPort: 80, image: 'nginx:1.27-alpine', spa: true, staticRoot: root });
  } else {
    return null;
  }
  if (overrides.port && /^\d{2,5}$/.test(overrides.port)) s.containerPort = +overrides.port;
  s.fileCount = files.length;
  return s;
}

/* ---------------- generated files ---------------- */
const NGINX = 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  gzip on;\n  gzip_types text/css application/javascript application/json image/svg+xml;\n  location / { try_files $uri $uri/ $uri.html /index.html; }\n}\n';

function dockerfile(s, o = {}) {
  const P = s.containerPort;
  const build = o.buildCmd ? `RUN ${o.buildCmd}` : null;
  const start = (def) => `CMD ["sh","-c",${JSON.stringify(o.startCmd || def)}]`;
  const py = (extra) => `FROM python:3.12-slim\nWORKDIR /app\nENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=${P}\nCOPY . .\nRUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; elif [ -f pyproject.toml ]; then pip install --no-cache-dir .; fi${extra ? ` && pip install --no-cache-dir ${extra}` : ''}\n${build || '# (no build step)'}\nEXPOSE ${P}\n`;
  switch (s.kind) {
    case 'node': return `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json yarn.lock* pnpm-lock.yaml* ./\nRUN npm ci || npm install\nCOPY . .\n${build || (s.buildScript ? 'RUN npm run build' : '# (no build step)')}\nENV NODE_ENV=production PORT=${P} HOST=0.0.0.0\nEXPOSE ${P}\n${start(s.startScript ? 'npm start' : `node ${s.entry}`)}\n`;
    case 'next': return `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json yarn.lock* pnpm-lock.yaml* ./\nRUN npm ci || npm install\nCOPY . .\n${build || 'RUN npm run build'}\nENV NODE_ENV=production PORT=${P} HOSTNAME=0.0.0.0\nEXPOSE ${P}\n${start('npx next start -p $PORT -H 0.0.0.0')}\n`;
    case 'spa': return `FROM node:20-alpine AS build\nWORKDIR /app\nCOPY . .\nRUN npm ci || npm install\n${build || 'RUN npm run build'}\n# locate the build output (dist/, build/, out/, dist/<app>/browser …)\nRUN OUT=$(dirname "$(find dist build out -maxdepth 4 -name index.html 2>/dev/null | head -n 1)") && mkdir -p /out && cp -r "$OUT"/. /out/\n\nFROM nginx:1.27-alpine\nCOPY --from=build /out /usr/share/nginx/html\nCOPY shipstack-nginx.conf /etc/nginx/conf.d/default.conf\nEXPOSE 80\n`;
    case 'static': return `FROM nginx:1.27-alpine\nCOPY ${s.staticRoot === '.' ? '.' : s.staticRoot + '/'} /usr/share/nginx/html/\nCOPY shipstack-nginx.conf /etc/nginx/conf.d/default.conf\nEXPOSE 80\n`;
    case 'flask': return py('gunicorn') + start(`gunicorn '${s.module}:${s.variable}' --bind 0.0.0.0:$PORT --workers 2`) + '\n';
    case 'fastapi': return py('uvicorn') + start(`uvicorn ${s.module}:${s.variable} --host 0.0.0.0 --port $PORT`) + '\n';
    case 'django': return py('gunicorn').replace('EXPOSE', 'RUN python manage.py collectstatic --noinput || true\nEXPOSE') + start(`gunicorn ${s.wsgi} --bind 0.0.0.0:$PORT --workers 2`) + '\n';
    case 'streamlit': return py('streamlit') + start(`streamlit run "${s.file}" --server.port $PORT --server.address 0.0.0.0 --server.headless true`) + '\n';
    case 'go': return `FROM golang:1.22-alpine AS build\nWORKDIR /src\nCOPY . .\nRUN ${o.buildCmd || 'go build -o /out/server .'}\n\nFROM alpine:3.20\nCOPY --from=build /out/server /server\nENV PORT=${P}\nEXPOSE ${P}\n${start('/server')}\n`;
    default: return null;
  }
}

function generatedFiles(p, s, plan, ownDockerfileText) {
  const branch = p.source.branch || 'main';
  const testJob = s.tests === 'pytest'
    ? "      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n      - run: pip install -r requirements.txt pytest\n      - run: python -m pytest -q"
    : s.tests === 'npm test' ? '      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - run: npm ci || npm install\n      - run: npm test'
    : s.tests === 'go test' ? "      - uses: actions/setup-go@v5\n        with:\n          go-version: '1.22'\n      - run: go test ./..."
    : '      - run: echo "No test suite detected"';
  const f = {
    Dockerfile: ownDockerfileText || dockerfile(s, p.overrides),
    '.dockerignore': 'node_modules\n.git\n.venv\nvenv\n__pycache__\n*.pyc\nnpm-debug.log\n.env\n',
    'docker-compose.yml': `# Run "${p.name}" anywhere with: docker compose up -d --build\nservices:\n  ${p.slug}:\n    build: .\n    image: ${p.slug}:latest\n    restart: unless-stopped\n    ports:\n      - "${p.port}:${s.containerPort}"\n    environment:\n      PORT: "${s.containerPort}"\n    deploy:\n      resources:\n        limits:\n          cpus: "${plan.cpus}"\n          memory: ${plan.memory.toUpperCase()}\n    healthcheck:\n      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:${s.containerPort}${p.overrides.healthPath || '/'} || exit 1"]\n      interval: 30s\n`,
    '.github/workflows/shipstack.yml': `# Generated by ShipStack for "${p.name}"\nname: ShipStack CI/CD\n\non:\n  push:\n    branches: [${branch}]\n  pull_request:\n\njobs:\n  test:\n    name: Automated tests\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n${testJob}\n\n  build:\n    name: Build container image\n    needs: test\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: docker/setup-buildx-action@v3\n      - run: docker build -t ${p.slug}:\${{ github.sha }} .\n\n  deploy:\n    name: Deploy with ShipStack\n    needs: build\n    if: github.event_name == 'push'\n    runs-on: ubuntu-latest\n    steps:\n      - run: curl -fsS -X POST "\${{ secrets.SHIPSTACK_DEPLOY_HOOK }}"\n`,
  };
  if (s.spa && !s.ownDockerfile) f['shipstack-nginx.conf'] = NGINX;
  return f;
}

/* ---------------- secret scan ---------------- */
const SECRET_FILES = /(^|\/)(\.env(\.\w+)?|id_rsa|id_ed25519|.*\.pem|.*\.p12|credentials\.json|service-account.*\.json)$/i;
const SECRET_TEXT = [
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/ghp_[A-Za-z0-9]{36}/, 'GitHub token'],
  [/sk_live_[A-Za-z0-9]{20,}/, 'Stripe live key'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
];
function secretScan(dir) {
  const found = [];
  for (const f of listFiles(dir, 4)) {
    if (/\.env\.example$|\.env\.sample$/i.test(f)) continue;
    if (SECRET_FILES.test(f)) { found.push(`${f} looks like a secrets file`); continue; }
    if (!/\.(js|ts|py|json|ya?ml|env|txt|cfg|ini|toml|go|php|rb|sh)$/i.test(f)) continue;
    let text = '';
    try { const st = fs.statSync(path.join(dir, f)); if (st.size > 512 * 1024) continue; text = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    for (const [re, label] of SECRET_TEXT) if (re.test(text)) found.push(`${f} contains what looks like a ${label}`);
    if (found.length > 10) break;
  }
  return found;
}

module.exports = { detect, dockerfile, generatedFiles, secretScan, NGINX, listFiles };

# Generates the SEO guide pages in public/guides/ from the content below.
# Usage: python tools/build-guides.py      (then commit the generated .html files)
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'guides')
SITE = 'https://shipzo.tech'
UPDATED = '2026-10-25'          # first batch of guides
UPDATED_HUMAN = '25 October 2026'
SITE_UPDATED = '2026-11-21'     # last change to the site as a whole (home, hub, sitemap)

import datetime
def human(d):
    return datetime.date.fromisoformat(d).strftime('%-d %B %Y')

GUIDES = [
# ------------------------------------------------------------------ FLASK
dict(
slug='deploy-flask-app-free',
title='How to Deploy a Flask App for Free (Step-by-Step, 2026)',
h1='How to deploy a Flask app for free',
description='Deploy a Python Flask app online for free with a live HTTPS link. Prepare app.py and requirements.txt, push to GitHub, and deploy with automatic tests, Docker and gunicorn.',
tag='Python · Flask', read='8 min read',
lede='You built a Flask app that works on <code>localhost:5000</code>. This guide gets it onto the internet with a real HTTPS link you can share, in about ten minutes, without paying anything.',
tldr=['Bind to <code>0.0.0.0</code> and read the port from the <code>PORT</code> environment variable.', 'List every package in <code>requirements.txt</code> (add <code>gunicorn</code> for production).', 'Push the code to GitHub.', 'Paste the repo link into Shipzo and press Deploy. You get <code>https://your-app.shipzo.tech</code>.'],
body=r'''
<h2 id="what-you-need">What you need</h2>
<ul><li>A Flask app that runs on your computer</li><li>A free <a href="https://github.com" rel="noopener">GitHub</a> account</li><li>A free <a href="/signup">Shipzo account</a> (no credit card)</li></ul>

<h2 id="prepare">Step 1: Make your app ready for a server</h2>
<p>On your laptop, Flask's development server listens on <code>127.0.0.1:5000</code>. A hosting server tells your app which port to use through an environment variable called <code>PORT</code>, and it must listen on all network interfaces (<code>0.0.0.0</code>), not just localhost. Change the bottom of your main file like this:</p>
<p class="file">app.py</p>
<pre><code>import os
from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)</code></pre>
<p>Keep the Flask object named <code>app</code> and the file named <code>app.py</code> (or <code>main.py</code>). Most hosts, Shipzo included, look for exactly that.</p>

<h3>Write requirements.txt</h3>
<p>The server installs only what is listed here. If you installed something with <code>pip install</code> and forgot to list it, the deploy fails with <code>ModuleNotFoundError</code>.</p>
<p class="file">requirements.txt</p>
<pre><code>Flask&gt;=3.0,&lt;4
gunicorn&gt;=22</code></pre>
<p>To capture everything your project uses, run <code>pip freeze &gt; requirements.txt</code> inside your virtual environment, then delete lines you don't need.</p>
<div class="note"><b>Why gunicorn?</b> Flask's built-in server is for development only: it handles one request at a time and isn't hardened. In production you run a WSGI server such as gunicorn: <code>gunicorn app:app --bind 0.0.0.0:$PORT --workers 2</code>. Gunicorn doesn't run on Windows, so keep using <code>python app.py</code> locally.</div>

<h3>Add a .gitignore</h3>
<p class="file">.gitignore</p>
<pre><code>venv/
.venv/
__pycache__/
*.pyc
.env</code></pre>
<p>Never commit <code>.env</code> files, passwords or API keys. You'll add secrets as environment variables on the server instead.</p>

<h2 id="github">Step 2: Push your code to GitHub</h2>
<p>Create an empty repository on GitHub, then run these commands in your project folder:</p>
<pre><code>git init
git add .
git commit -m "First version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main</code></pre>

<h2 id="deploy">Step 3: Deploy it</h2>
<ol>
<li><a href="/signup">Create a free Shipzo account</a> and open <b>New deployment</b>.</li>
<li>Paste your repository link, for example <code>https://github.com/you/flask-app</code>.</li>
<li>Pick the <b>Starter</b> plan (enough for most Flask apps) and press <b>Deploy</b>.</li>
</ol>
<p>Here's what happens automatically, in order:</p>
<div class="tbl"><table><thead><tr><th>Stage</th><th>What it does</th></tr></thead><tbody>
<tr><td>Fetch source</td><td>Clones your repo</td></tr>
<tr><td>Detect &amp; scan</td><td>Sees <code>requirements.txt</code> and a Flask app, and checks for committed secrets</td></tr>
<tr><td>Automated tests</td><td>Runs <code>pytest</code> if you have <code>test_*.py</code> files. Failing tests stop the deploy</td></tr>
<tr><td>Build</td><td>Builds a Docker image with Python 3.12 and gunicorn</td></tr>
<tr><td>Deploy &amp; health check</td><td>Starts the container and waits for <code>GET /</code> to answer</td></tr>
<tr><td>Go live</td><td>Your app is at <code>https://your-app.shipzo.tech</code> with HTTPS</td></tr>
</tbody></table></div>

<h2 id="updates">Step 4: Updating your app</h2>
<p>Just push again. Shipzo checks your branch every minute and redeploys new commits with zero downtime. If the new version fails its tests or health check, the old one keeps running.</p>
<pre><code>git add .
git commit -m "Add contact page"
git push</code></pre>

<h2 id="database">Databases and secrets</h2>
<p>Don't rely on a SQLite file for real data: every deploy starts from a clean container, so the file resets. Use a free hosted database such as Neon or Supabase (PostgreSQL) or MongoDB Atlas, and pass the connection string as an environment variable:</p>
<pre><code>import os
DATABASE_URL = os.environ["DATABASE_URL"]</code></pre>
<p>In Shipzo, open your project → <b>Settings</b> → <b>Environment variables</b> and add <code>DATABASE_URL=...</code>. Values are injected at runtime and masked in every log.</p>

<h2 id="troubleshooting">Common errors and fixes</h2>
<div class="tbl"><table><thead><tr><th>Error</th><th>Fix</th></tr></thead><tbody>
<tr><td><code>ModuleNotFoundError: No module named 'x'</code></td><td>Add the package to <code>requirements.txt</code> and push again.</td></tr>
<tr><td>Health check timed out</td><td>Your app listens on <code>127.0.0.1</code> or a fixed port. Use <code>host="0.0.0.0"</code> and the <code>PORT</code> variable.</td></tr>
<tr><td>App exits during start-up</td><td>Read the last lines in the build log. Usually a missing environment variable or a crash at import time.</td></tr>
<tr><td><code>TemplateNotFound</code></td><td>Linux is case-sensitive: <code>Templates/</code> is not <code>templates/</code>, and <code>Index.html</code> is not <code>index.html</code>.</td></tr>
<tr><td>Can't find the app object</td><td>Name it <code>app = Flask(__name__)</code> in <code>app.py</code>, or set a custom start command in Settings.</td></tr>
</tbody></table></div>
''',
faq=[('Is it really free?', 'Yes. Shipzo is free during the beta, with up to 3 projects per account and no card required.'),
     ('Does my Flask app go to sleep when nobody visits?', 'No. Apps on Shipzo keep running, so the first visitor after a quiet hour doesn\'t wait for a cold start.'),
     ('Can I deploy Django or FastAPI the same way?', 'Yes. Shipzo detects Django from manage.py and FastAPI from requirements.txt, and starts them with gunicorn or uvicorn.'),
     ('Can I use my own domain?', 'During the beta every app gets a free HTTPS subdomain on shipzo.tech. Custom domains are on the roadmap.')],
related=['deploy-django-app-free', 'deploy-fastapi-app-free', 'host-streamlit-app-free'],
),
# ------------------------------------------------------------------ STREAMLIT
dict(
slug='host-streamlit-app-free',
title='How to Host a Streamlit App Online for Free (ML Projects, 2026)',
h1='How to host a Streamlit app online for free',
description='Put your Streamlit machine-learning app online with a free HTTPS link. Structure the repo, pin requirements, load models correctly, and deploy from GitHub in minutes.',
tag='Python · Streamlit · ML', read='8 min read',
lede='Streamlit is the fastest way to turn a machine-learning model into a web app. Getting it online is where most students get stuck. Here\'s exactly how to do it, using a real house-price predictor as the example.',
tldr=['Put <code>app.py</code>, <code>requirements.txt</code> and your model or data files in the repo root.', 'Load files with paths relative to the script, and cache the model with <code>@st.cache_resource</code>.', 'Push to GitHub and deploy on Shipzo. Streamlit\'s port and websockets are handled for you.', 'Use the Standard plan for heavier libraries like scikit-learn or TensorFlow.'],
body=r'''
<p>Live example: <a href="https://houseprice-predictor.shipzo.tech" rel="noopener">houseprice-predictor.shipzo.tech</a>, a Streamlit + scikit-learn app deployed straight from GitHub with the steps below.</p>

<h2 id="structure">Step 1: Structure your repository</h2>
<pre><code>house-price-predictor/
├── app.py              # your Streamlit app
├── model.pkl           # trained model (or train it at start-up)
├── data.csv            # any data files the app reads
├── requirements.txt
└── tests/
    └── test_model.py   # optional: runs before every deploy</code></pre>
<p>Keep <code>app.py</code> in the root folder. If your app lives in a sub-folder, you can point the host to it later with a <b>root directory</b> setting.</p>

<h2 id="requirements">Step 2: Pin your requirements</h2>
<p class="file">requirements.txt</p>
<pre><code>streamlit&gt;=1.39
pandas&gt;=2.2
scikit-learn&gt;=1.5
joblib&gt;=1.4</code></pre>
<p>Pin the scikit-learn version you trained with. A model pickled with one version can fail to load, or give different results, on another.</p>

<h2 id="loading">Step 3: Load files and models the right way</h2>
<p>The most common Streamlit deploy error is <code>FileNotFoundError</code>. Paths that work on your laptop break on a server because the working directory is different. Build paths from the script's own location, and cache the model so it loads once instead of on every click:</p>
<p class="file">app.py</p>
<pre><code>from pathlib import Path
import joblib
import pandas as pd
import streamlit as st

BASE = Path(__file__).parent

@st.cache_resource
def load_model():
    return joblib.load(BASE / "model.pkl")

@st.cache_data
def load_data():
    return pd.read_csv(BASE / "data.csv")

st.title("🏠 House Price Predictor")
area = st.number_input("Area (sq ft)", 300, 10000, 1100, step=50)
bedrooms = st.slider("Bedrooms", 1, 6, 2)

if st.button("Predict"):
    price = load_model().predict([[area, bedrooms]])[0]
    st.metric("Estimated price", f"₹ {price:,.1f} lakh")</code></pre>
<div class="note"><b>Model file too big?</b> GitHub rejects files over 100 MB. Use a smaller model, compress it with <code>joblib.dump(model, "model.pkl", compress=3)</code>, or train it at start-up inside a cached function.</div>

<h2 id="github">Step 4: Push to GitHub</h2>
<pre><code>git init
git add .
git commit -m "Streamlit app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/house-price-predictor.git
git push -u origin main</code></pre>

<h2 id="deploy">Step 5: Deploy</h2>
<ol>
<li><a href="/signup">Sign up on Shipzo</a> (free) and open <b>New deployment</b>.</li>
<li>Paste the repo link.</li>
<li>Choose <b>Standard</b> if you use scikit-learn, TensorFlow or PyTorch, or <b>Starter</b> for light apps. Then press <b>Deploy</b>.</li>
</ol>
<p>Shipzo spots <code>streamlit</code> in your requirements and runs the equivalent of:</p>
<pre><code>streamlit run app.py --server.port $PORT --server.address 0.0.0.0 --server.headless true</code></pre>
<p>Streamlit talks to the browser over a websocket, which some proxies block (you'd see the app stuck on "Please wait…"). Shipzo passes websockets through, so this just works.</p>
<p>The first build of a data-science app takes 5–8 minutes because pandas and scikit-learn are large. Later deploys are faster.</p>

<h2 id="tests">Optional: test your model before every deploy</h2>
<p>Add a quick pytest file and every push is checked before it goes live:</p>
<p class="file">tests/test_model.py</p>
<pre><code>from pathlib import Path
import joblib

MODEL = joblib.load(Path(__file__).parent.parent / "model.pkl")

def test_price_is_positive():
    assert MODEL.predict([[1000, 2]])[0] &gt; 0

def test_more_area_costs_more():
    assert MODEL.predict([[2000, 2]])[0] &gt; MODEL.predict([[1000, 2]])[0]</code></pre>

<h2 id="troubleshooting">Common errors and fixes</h2>
<div class="tbl"><table><thead><tr><th>Problem</th><th>Fix</th></tr></thead><tbody>
<tr><td><code>FileNotFoundError</code> for a CSV or model</td><td>Use <code>Path(__file__).parent / "file"</code>, and make sure the file is committed (check <code>.gitignore</code>).</td></tr>
<tr><td>App stuck on "Please wait…"</td><td>Websockets are blocked by the host or a proxy. Shipzo supports them, so check your browser's network tab for errors.</td></tr>
<tr><td>Container restarts or is killed</td><td>Out of memory. Switch to the Standard or Pro plan, or load a lighter model.</td></tr>
<tr><td>Model gives errors after loading</td><td>The scikit-learn version differs from the one you trained with. Pin it in <code>requirements.txt</code>.</td></tr>
<tr><td>Every click is slow</td><td>Wrap model and data loading in <code>@st.cache_resource</code> / <code>@st.cache_data</code>.</td></tr>
</tbody></table></div>
''',
faq=[('Is Streamlit hosting free on Shipzo?', 'Yes, during the beta. Up to 3 projects per account, no card.'),
     ('Can I deploy a Jupyter notebook?', 'Not directly. Move the code into app.py as a Streamlit app. That takes a few minutes and gives you a real interactive page.'),
     ('Will my app sleep?', 'No. Apps keep running, so examiners and recruiters don\'t wait for a cold start.'),
     ('Can I deploy Gradio or FastAPI instead?', 'FastAPI is detected automatically. For Gradio, set a custom start command in the project settings.')],
related=['deploy-flask-app-free', 'host-college-project-online', 'deploy-react-vite-app'],
),
# ------------------------------------------------------------------ REACT VITE
dict(
slug='deploy-react-vite-app',
title='How to Deploy a React (Vite) App with a Free HTTPS Link',
h1='How to deploy a React (Vite) app with a free HTTPS link',
description='Deploy a React app built with Vite: build to static files, fix blank pages and 404s on refresh, use VITE_ environment variables, and get a free HTTPS link from GitHub.',
tag='JavaScript · React · Vite', read='7 min read',
lede='A React app built with Vite compiles to plain static files: HTML, JavaScript and CSS. Hosting it is easy once you know three gotchas: the build folder, client-side routes, and environment variables.',
tldr=['<code>npm run build</code> creates a <code>dist/</code> folder. That folder is your website.', 'Single-page apps need every unknown URL to serve <code>index.html</code>, or refreshes give 404s.', 'Environment variables must start with <code>VITE_</code> and are baked in at build time.', 'Push to GitHub, deploy on Shipzo, and you get <code>https://your-app.shipzo.tech</code>.'],
body=r'''
<h2 id="build">Step 1: Check that it builds</h2>
<p>Before deploying anything, make sure a production build works on your machine:</p>
<pre><code>npm install
npm run build
npm run preview   # serves dist/ at http://localhost:4173</code></pre>
<p>If <code>npm run build</code> fails locally, it will fail on any host. TypeScript and ESLint errors are the usual cause.</p>

<h2 id="base">Step 2: Get the base path right</h2>
<p>A blank white page after deploying almost always means the browser can't load your JavaScript files. If your app is served from the root of a domain (like <code>https://my-app.shipzo.tech/</code>), keep the default:</p>
<p class="file">vite.config.js</p>
<pre><code>import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',          // change only if the app lives in a sub-folder
})</code></pre>

<h2 id="routing">Step 3: Client-side routing (React Router)</h2>
<p>With React Router, a URL like <code>/dashboard</code> exists only in JavaScript. When someone refreshes that page, the server looks for a file called <code>dashboard</code>, finds nothing, and returns 404. The fix is a <b>fallback</b>: any path that isn't a real file serves <code>index.html</code>. With nginx, that's:</p>
<pre><code>location / {
  try_files $uri $uri/ /index.html;
}</code></pre>
<p>Shipzo adds exactly this configuration automatically when it detects a Vite or Create React App project, so deep links and refreshes just work.</p>

<h2 id="env">Step 4: Environment variables</h2>
<p>Vite only exposes variables that start with <code>VITE_</code>, and it replaces them <b>when the app is built</b>:</p>
<pre><code>const api = import.meta.env.VITE_API_URL</code></pre>
<ul>
<li>Add <code>VITE_API_URL=https://my-api.shipzo.tech</code> in your project's Settings → Environment variables, then <b>redeploy</b>. Shipzo writes <code>VITE_</code>, <code>REACT_APP_</code> and <code>NEXT_PUBLIC_</code> variables into the build automatically, but changing a variable doesn't update an app that's already built.</li>
<li>Anything in a <code>VITE_</code> variable ends up in the public JavaScript bundle. <b>Never put secret keys there.</b> Keep secrets in a backend.</li>
</ul>

<h2 id="deploy">Step 5: Push and deploy</h2>
<pre><code>git add .
git commit -m "Ready to deploy"
git push</code></pre>
<ol>
<li><a href="/signup">Create a free Shipzo account</a> → <b>New deployment</b>.</li>
<li>Paste the repo link and press <b>Deploy</b>.</li>
</ol>
<p>Shipzo installs your dependencies (including dev dependencies, which Vite needs to build), runs <code>npm run build</code>, finds the output folder (<code>dist/</code>, <code>build/</code> or <code>out/</code>), and serves it with nginx and HTTPS. Every later <code>git push</code> redeploys automatically.</p>

<h2 id="troubleshooting">Common errors and fixes</h2>
<div class="tbl"><table><thead><tr><th>Problem</th><th>Fix</th></tr></thead><tbody>
<tr><td>Blank page, console shows 404s for <code>.js</code> files</td><td>Wrong <code>base</code> in <code>vite.config.js</code>. Use <code>'/'</code> for a root domain.</td></tr>
<tr><td>404 when refreshing a page</td><td>Missing SPA fallback to <code>index.html</code> (automatic on Shipzo).</td></tr>
<tr><td><code>import.meta.env.X</code> is <code>undefined</code></td><td>The name must start with <code>VITE_</code>, and you must redeploy after adding it.</td></tr>
<tr><td><code>vite: not found</code> during build</td><td>The host skipped dev dependencies. Shipzo installs them for the build step.</td></tr>
<tr><td>Build fails on the server but not locally</td><td>Case-sensitive imports: <code>./Header</code> is not <code>./header</code> on Linux.</td></tr>
</tbody></table></div>
''',
faq=[('Does this work for Vue, Svelte or Angular?', 'Yes. Any project with a build script that outputs static files is detected and served the same way.'),
     ('What about Next.js?', 'Next.js is detected separately and runs as a Node server (next build, then next start), so server-side rendering works.'),
     ('Is it free?', 'Yes, during the beta, with up to 3 projects per account.'),
     ('Can my React app call my own backend?', 'Yes. Deploy the backend as its own Shipzo project and put its URL in a VITE_ variable.')],
related=['deploy-nextjs-app-free', 'deploy-mern-stack-app-free', 'deploy-node-express-app-free'],
),
# ------------------------------------------------------------------ COLLEGE PROJECT
dict(
slug='host-college-project-online',
title='How to Host Your College Project Online for Free (Live Link for Your Viva)',
h1='How to host your college project online for free',
description='Get a free live link for your college project, mini-project or PBL: HTML/CSS/JS sites, Flask, Node and Streamlit apps. Upload to GitHub without commands and deploy with HTTPS.',
tag='Students · PBL · Viva', read='7 min read',
lede='A working live link beats screenshots in every viva, project report and résumé. Here\'s how to put your college project online for free, even if you\'ve never used Git.',
tldr=['Use relative file paths, and ideally name your main page <code>index.html</code>.', 'Upload the project to GitHub through the website (no commands needed).', 'Deploy it on Shipzo from the GitHub link.', 'Put the link and a QR code in your report and slides.'],
body=r'''
<h2 id="which">Which type of project do you have?</h2>
<div class="tbl"><table><thead><tr><th>Your project</th><th>What the host looks for</th><th>Guide</th></tr></thead><tbody>
<tr><td>HTML, CSS, JavaScript website</td><td><code>index.html</code></td><td>This page</td></tr>
<tr><td>Python Flask / Django</td><td><code>requirements.txt</code></td><td><a href="/guides/deploy-flask-app-free">Flask guide</a></td></tr>
<tr><td>Machine learning with Streamlit</td><td><code>streamlit</code> in requirements</td><td><a href="/guides/host-streamlit-app-free">Streamlit guide</a></td></tr>
<tr><td>Node.js / Express</td><td><code>package.json</code></td><td><a href="/guides/deploy-node-express-app-free">Express guide</a></td></tr>
<tr><td>React / Vite</td><td><code>package.json</code> with a build script</td><td><a href="/guides/deploy-react-vite-app">React guide</a></td></tr>
<tr><td>PHP</td><td><code>index.php</code></td><td>Works the same way; use a hosted database for MySQL</td></tr>
</tbody></table></div>

<h2 id="prepare">Step 1: Get your files ready (HTML/CSS/JS projects)</h2>
<ul>
<li><b>Ideally name the main page <code>index.html</code></b> and keep it in the top folder. Web servers open <code>index.html</code> by default. If your main page has another name, such as <code>calculator.html</code>, Shipzo picks it as the home page automatically.</li>
<li><b>Use relative paths.</b> <code>&lt;img src="images/logo.png"&gt;</code> works everywhere. <code>&lt;img src="C:\Users\you\Desktop\logo.png"&gt;</code> only works on your laptop.</li>
<li><b>Match capital letters exactly.</b> Windows doesn't care, but servers do: <code>Logo.PNG</code> and <code>logo.png</code> are different files.</li>
<li>Open <code>index.html</code> in your browser one last time and click every link and button.</li>
</ul>
<pre><code>my-project/
├── index.html      ← main page
├── about.html
├── style.css
├── script.js
└── images/
    └── logo.png</code></pre>

<h2 id="github">Step 2: Upload to GitHub (no commands needed)</h2>
<ol>
<li>Sign in to <a href="https://github.com" rel="noopener">github.com</a> → click <b>+</b> → <b>New repository</b>.</li>
<li>Give it a name like <code>library-management-system</code>, keep it <b>Public</b>, and click <b>Create repository</b>.</li>
<li>Click <b>uploading an existing file</b>, drag all your project files and folders in, and click <b>Commit changes</b>.</li>
</ol>
<p>Comfortable with the terminal? Use <code>git init</code>, <code>git add .</code>, <code>git commit</code> and <code>git push</code> instead. Commit history also shows your teacher who contributed what.</p>

<h2 id="deploy">Step 3: Deploy it</h2>
<ol>
<li><a href="/signup">Create a free Shipzo account</a> (pick "College or school project" when asked).</li>
<li>Click <b>New deployment</b>, paste your GitHub link, and press <b>Deploy</b>.</li>
<li>About a minute later your project is live at <code>https://your-project.shipzo.tech</code>, with HTTPS.</li>
</ol>
<p>If your project is in a sub-folder of the repo (for example <code>frontend/</code>), set the <b>Root directory</b> in the deployment form.</p>

<h2 id="viva">Step 4: Use the link in your viva and report</h2>
<ul>
<li><b>Report:</b> add a "Deployment" section with the live link, the GitHub link, and one line on how it's hosted (container, HTTPS, CI/CD).</li>
<li><b>Slides:</b> add a QR code of the link so examiners can open it on their phones.</li>
<li><b>Résumé and LinkedIn:</b> list the live link next to each project. Recruiters click links; they don't download ZIP files.</li>
<li><b>Before the viva:</b> open the link on mobile data to check it works outside the college Wi-Fi.</li>
</ul>
<div class="note"><b>Talking about it in your viva:</b> "Our project is containerized with Docker, deployed through a CI/CD pipeline that runs automated tests, served over HTTPS on its own subdomain, and monitored with automatic restarts." Every part of that sentence is true for apps deployed on Shipzo.</div>

<h2 id="database">Projects with a database</h2>
<p>If your project uses MySQL, MongoDB or PostgreSQL on your laptop (<code>localhost</code>), the deployed version can't reach it. Use a free hosted database (MongoDB Atlas, Neon or Supabase), and put its connection string in your project's <b>Environment variables</b> instead of in the code.</p>
''',
faq=[('Is this free for students?', 'Yes. Shipzo is free during the beta, with up to 3 projects per account and no card.'),
     ('Will the link still work after my viva?', 'Yes. Apps keep running until you delete them, so the link stays valid in your report and résumé.'),
     ('Can my whole team manage the project?', 'Each project belongs to one account. Teammates can push to the GitHub repo, and every push redeploys automatically.'),
     ('My project is in Java (console app). Can I host it?', 'Shipzo hosts web apps that answer HTTP requests. A console program needs a web interface first, for example a small Spring Boot or Flask front end.')],
related=['host-html-css-website-free', 'deploy-website-from-github', 'deploy-flask-app-free'],
),
# ------------------------------------------------------------------ NODE EXPRESS
dict(
slug='deploy-node-express-app-free',
title='How to Deploy a Node.js Express App for Free (with MongoDB, 2026)',
h1='How to deploy a Node.js Express app for free',
description='Deploy a Node.js Express API or website for free: listen on process.env.PORT, set a start script, connect MongoDB Atlas with environment variables, and deploy from GitHub with HTTPS.',
tag='JavaScript · Node.js · Express', read='8 min read',
lede='Your Express server runs on <code>localhost:3000</code>. To put it online you need three small changes: the port, the start script, and where secrets live. This guide covers all three, plus MongoDB.',
tldr=['Listen on <code>process.env.PORT</code>.', 'Add <code>"start": "node server.js"</code> to <code>package.json</code>, and commit <code>package-lock.json</code>.', 'Move database URLs and keys into environment variables.', 'Push to GitHub and deploy on Shipzo. Tests run first if you have them.'],
body=r'''
<h2 id="port">Step 1: Listen on the right port</h2>
<p class="file">server.js</p>
<pre><code>const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) =&gt; res.send('API is running'));
app.get('/health', (req, res) =&gt; res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =&gt; console.log(`Listening on ${PORT}`));</code></pre>
<p>Hosting platforms assign the port through the <code>PORT</code> variable. Hard-coding <code>app.listen(5000)</code> is the number one reason Express deploys fail their health check.</p>

<h2 id="package">Step 2: Fix package.json</h2>
<p class="file">package.json</p>
<pre><code>{
  "name": "my-api",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "node --test"
  },
  "engines": { "node": "&gt;=20" },
  "dependencies": {
    "express": "^4.21.0",
    "mongoose": "^8.7.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}</code></pre>
<ul>
<li><b><code>start</code> uses <code>node</code>, not <code>nodemon</code>.</b> Nodemon is for development, where it restarts on file changes.</li>
<li><b>Commit <code>package-lock.json</code></b> so the server installs exactly the versions you tested.</li>
<li><b>Every <code>require()</code> must be listed in dependencies.</b> A package installed globally on your laptop doesn't exist on the server.</li>
<li>Add <code>node_modules/</code> and <code>.env</code> to <code>.gitignore</code>.</li>
</ul>

<h2 id="mongodb">Step 3: Connect MongoDB the right way</h2>
<p><code>mongodb://localhost:27017</code> only works on your laptop. Create a free cluster on MongoDB Atlas and read the URL from an environment variable:</p>
<pre><code>const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI)
  .then(() =&gt; console.log('MongoDB connected'))
  .catch((err) =&gt; { console.error(err); process.exit(1); });</code></pre>
<ul>
<li>In Atlas, under <b>Network Access</b>, allow your host's IP address (or <code>0.0.0.0/0</code> for testing). Otherwise the connection times out.</li>
<li>In Shipzo, add <code>MONGODB_URI=mongodb+srv://...</code> under your project's <b>Settings → Environment variables</b>. Values are masked in every log.</li>
</ul>

<h2 id="tests">Step 4 (optional): Add a test</h2>
<p>Node has a built-in test runner. With a <code>test</code> script in place, Shipzo runs it before every deploy and blocks the release if it fails:</p>
<p class="file">test/app.test.js</p>
<pre><code>const test = require('node:test');
const assert = require('node:assert');

test('adds numbers', () =&gt; {
  assert.strictEqual(1 + 1, 2);
});</code></pre>

<h2 id="deploy">Step 5: Push and deploy</h2>
<pre><code>git add .
git commit -m "Production ready"
git push</code></pre>
<ol>
<li><a href="/signup">Create a free Shipzo account</a> → <b>New deployment</b>.</li>
<li>Paste the repo link, add your environment variables in step 5 of the form, and press <b>Deploy</b>.</li>
</ol>
<p>Shipzo detects Express from <code>package.json</code>, installs with <code>npm ci</code>, runs <code>npm test</code>, builds a Node 20 container, starts it with <code>npm start</code>, waits for <code>GET /</code> to answer, then switches traffic. Your API is live at <code>https://your-api.shipzo.tech</code>.</p>

<h2 id="troubleshooting">Common errors and fixes</h2>
<div class="tbl"><table><thead><tr><th>Error</th><th>Fix</th></tr></thead><tbody>
<tr><td>Health check timed out</td><td>Use <code>process.env.PORT</code>, or set <b>App port</b> in Settings to the port your app uses.</td></tr>
<tr><td><code>Error: Cannot find module 'x'</code></td><td>Add it to <code>dependencies</code> (<code>npm install x</code>) and commit <code>package.json</code> and the lock file.</td></tr>
<tr><td><code>MongooseServerSelectionError</code></td><td>Atlas is blocking the server's IP. Update <b>Network Access</b>.</td></tr>
<tr><td><code>MONGODB_URI</code> is <code>undefined</code></td><td>Add the variable in Settings and redeploy.</td></tr>
<tr><td>Works locally, crashes on the server</td><td>Check the runtime logs tab. It's usually a missing environment variable or a file path with different capital letters.</td></tr>
</tbody></table></div>
''',
faq=[('Does my API sleep when idle?', 'No. It keeps running, so the first request after a quiet period is fast.'),
     ('Can I use Socket.io or WebSockets?', 'Yes. WebSocket connections are passed through to your app.'),
     ('Is there a free tier?', 'Yes. Shipzo is free during the beta, with up to 3 projects per account.'),
     ('Can I deploy NestJS or Fastify?', 'Yes. Any Node server with a start script or a server.js/index.js entry file works.')],
related=['deploy-mern-stack-app-free', 'deploy-react-vite-app', 'deploy-docker-app-free'],
),
# ------------------------------------------------------------------ DEPLOY FROM GITHUB
dict(
slug='deploy-website-from-github',
published='2026-11-21',
title='Deploy a Website from GitHub for Free (HTTPS Link, 2026)',
h1='How to deploy a website from GitHub for free',
description='Turn a GitHub repository into a live HTTPS website in minutes. Public or private repos, branches, sub-folders, auto-deploy on every push, webhooks and rollback.',
tag='GitHub · Any stack', read='7 min read',
lede='GitHub keeps your code safe, but it doesn\'t run it. GitHub Pages can serve plain HTML files, and that\'s where it stops: no Flask, no Express, no database calls. To get a real app online you need something that pulls the repository, builds it and keeps it running. Here\'s the whole path on Shipzo, from the repo link to automatic redeploys.',
tldr=['Push your project to GitHub (public, or private with a read-only token).', 'Paste the repository link into Shipzo. It works out the stack, runs your tests and builds a container.', 'The site goes live at <code>https://your-project.shipzo.tech</code>.', 'Every later <code>git push</code> redeploys it within about a minute, and a broken commit never replaces the working version.'],
body=r'''
<h2 id="what-works">What kind of repository works</h2>
<p>You don't write a config file. Shipzo looks at the files in your repository and decides how to build it:</p>
<div class="tbl"><table><thead><tr><th>If the repo has…</th><th>It is deployed as</th></tr></thead><tbody>
<tr><td><code>Dockerfile</code></td><td>Your own container, built exactly as written</td></tr>
<tr><td><code>package.json</code> with <code>next</code></td><td>A Next.js server (server-side rendering works)</td></tr>
<tr><td><code>package.json</code> with a build script (React, Vite, Vue, Angular, Svelte)</td><td>A static site served by nginx</td></tr>
<tr><td><code>package.json</code> with Express, Fastify, Koa or NestJS</td><td>A Node.js server</td></tr>
<tr><td><code>requirements.txt</code> plus <code>manage.py</code></td><td>Django, run with gunicorn</td></tr>
<tr><td><code>requirements.txt</code> naming <code>fastapi</code> or <code>streamlit</code></td><td>FastAPI with uvicorn, or Streamlit</td></tr>
<tr><td>Any other <code>requirements.txt</code></td><td>Flask or another WSGI app, run with gunicorn</td></tr>
<tr><td><code>go.mod</code></td><td>A compiled Go server</td></tr>
<tr><td><code>index.html</code> and no server code</td><td>A static website</td></tr>
</tbody></table></div>
<div class="note"><b>One rule for server apps:</b> listen on <code>0.0.0.0</code> and on the port given in the <code>PORT</code> environment variable. Most frameworks do this already. A hard-coded <code>localhost:5000</code> is the most common reason a deploy fails its health check.</div>

<h2 id="link">Step 1: Paste the repository link</h2>
<ol>
<li><a href="/signup">Create a free Shipzo account</a> and open <b>New deployment</b>.</li>
<li>Paste the link. Any of these work: <code>https://github.com/you/my-app</code>, <code>you/my-app</code>, or a link to a folder such as <code>https://github.com/you/my-app/tree/main/frontend</code>.</li>
<li>Leave <b>Branch</b> empty to use the default branch, or type another one (for example <code>dev</code>).</li>
<li>If the app lives in a sub-folder of a bigger repository, put that folder in <b>Root directory</b>, for example <code>backend/</code>.</li>
</ol>
<p>The project name becomes your address, so a project called <code>library-system</code> ends up at <code>https://library-system.shipzo.tech</code>.</p>

<h2 id="private">Private repositories</h2>
<p>For a private repo, Shipzo needs a token that can read it. Create a fine-grained token on GitHub:</p>
<ol>
<li>GitHub → <b>Settings</b> → <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li>
<li>Under <b>Repository access</b>, choose <b>Only select repositories</b> and pick the one you are deploying.</li>
<li>Under <b>Permissions</b>, set <b>Contents</b> to <b>Read-only</b>. Nothing else is needed.</li>
</ol>
<p>Paste the token into the <b>Private repository?</b> field of the form. It is masked in every log, and because it can only read one repository, it can't be used to change your code.</p>

<h2 id="pipeline">Step 2: What happens when you press Deploy</h2>
<div class="tbl"><table><thead><tr><th>Stage</th><th>What it does</th></tr></thead><tbody>
<tr><td>Fetch source</td><td>Makes a shallow clone of your branch and notes the commit</td></tr>
<tr><td>Detect &amp; scan</td><td>Picks the stack and warns about committed secrets such as <code>.env</code> files, private keys or API keys</td></tr>
<tr><td>Test</td><td>Runs <code>npm test</code>, <code>pytest</code> or <code>go test</code> in a clean container if you have tests; a failure stops the release</td></tr>
<tr><td>Build</td><td>Uses your Dockerfile, or writes one for your stack, and builds the image</td></tr>
<tr><td>Deploy</td><td>Starts the new version next to the old one, with your plan's memory and CPU limits</td></tr>
<tr><td>Health check</td><td>Sends requests for up to 120 seconds until the app answers</td></tr>
<tr><td>Go live</td><td>Moves traffic to the new version and stops the old one</td></tr>
</tbody></table></div>
<p>You can watch each stage and the full build log live on the project page.</p>

<h2 id="auto-deploy">Step 3: Redeploy automatically on every push</h2>
<p>Continuous deployment is on by default. Shipzo checks your branch every 60 seconds and deploys any new commit, so you don't have to set anything up. If a commit fails its tests, it isn't retried over and over; push a fix and the new commit is picked up.</p>
<p>If you'd rather not wait up to a minute, add a webhook:</p>
<ol>
<li>In Shipzo, open the project → <b>Settings</b> → <b>Deploy hook &amp; GitHub webhook</b>, and copy the hook URL.</li>
<li>In GitHub, open the repo → <b>Settings</b> → <b>Webhooks</b> → <b>Add webhook</b>.</li>
<li>Paste the URL as <b>Payload URL</b>, choose <code>application/json</code> as the content type and <b>Just the push event</b>.</li>
</ol>
<p>A third option: the <b>DevOps files</b> tab contains a GitHub Actions workflow written for your project. Commit it as <code>.github/workflows/shipstack.yml</code> and your tests also run on GitHub for every pull request.</p>

<h2 id="rollback">When a deploy goes wrong</h2>
<p>A new version only receives traffic after it passes its tests and health check. If either fails, the previous version keeps serving and the dashboard tells you why. If something slips through and the new version misbehaves, open <b>Deployments</b> and roll back to any of the last five successful releases. Rollbacks reuse the image that was already built, so they take seconds.</p>

<h2 id="troubleshooting">Common errors and fixes</h2>
<div class="tbl"><table><thead><tr><th>Problem</th><th>Fix</th></tr></thead><tbody>
<tr><td>Repository can't be cloned</td><td>Check the link. If the repo is private, add a read-only token.</td></tr>
<tr><td>The stack isn't recognised</td><td>Add the file Shipzo looks for (see the table above), or add a Dockerfile.</td></tr>
<tr><td>Health check timed out</td><td>The app listens on <code>localhost</code> or a fixed port. Use <code>0.0.0.0</code> and <code>PORT</code>, or set <b>App port</b> in Settings.</td></tr>
<tr><td>A push didn't redeploy</td><td>Check that <b>Continuous deployment</b> is on and that you pushed to the branch the project uses.</td></tr>
<tr><td>The wrong folder was deployed</td><td>Set <b>Root directory</b> to the folder that holds your app.</td></tr>
</tbody></table></div>
''',
faq=[('Isn\'t GitHub Pages enough?', 'For a site made only of HTML, CSS and JavaScript, GitHub Pages works. As soon as the project has server code, such as Flask, Express, Django or an API, it needs a host that runs it.'),
     ('Can I deploy just one folder of my repository?', 'Yes. Put the folder in Root directory when you create the project, or paste a GitHub link that points at that folder.'),
     ('Does it work with GitLab or Bitbucket?', 'Shipzo clones from GitHub. For code hosted elsewhere, download it as a ZIP and use Upload ZIP instead.'),
     ('Is it free?', 'Yes. Shipzo is free during the beta, with up to 3 projects per account and no card required.')],
related=['host-html-css-website-free', 'deploy-docker-app-free', 'deploy-node-express-app-free'],
),
# ------------------------------------------------------------------ DJANGO
dict(
slug='deploy-django-app-free',
published='2026-11-21',
title='How to Deploy a Django App for Free (Step-by-Step, 2026)',
h1='How to deploy a Django app for free',
description='Deploy a Django project online for free with HTTPS: ALLOWED_HOSTS and CSRF settings, static files with WhiteNoise, migrations and a free PostgreSQL database.',
tag='Python · Django', read='9 min read',
lede='Django runs happily with <code>python manage.py runserver</code> on your laptop. On a real server, four things change: the allowed hosts, the static files, the database and the migrations. Sort those out once and every deploy after that is a <code>git push</code>.',
tldr=['Read <code>SECRET_KEY</code>, <code>DEBUG</code> and <code>DATABASE_URL</code> from environment variables.', 'Add <code>.shipzo.tech</code> to <code>ALLOWED_HOSTS</code> and <code>https://*.shipzo.tech</code> to <code>CSRF_TRUSTED_ORIGINS</code>.', 'Serve static files with WhiteNoise. Shipzo runs <code>collectstatic</code> during the build.', 'Set the start command so migrations run before gunicorn starts.'],
body=r'''
<h2 id="how">How Shipzo runs a Django project</h2>
<p>Shipzo recognises Django when it finds <code>manage.py</code> next to <code>requirements.txt</code>. It locates the <code>wsgi.py</code> inside your project folder (for example <code>mysite/wsgi.py</code>), runs <code>python manage.py collectstatic --noinput</code> while building the container, and starts <code>gunicorn mysite.wsgi:application</code> with two workers on Python 3.12. You don't need a Procfile or a Dockerfile.</p>
<pre><code>my-django-project/
├── manage.py
├── requirements.txt
├── mysite/
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
└── blog/               # your apps</code></pre>

<h2 id="settings">Step 1: Production settings</h2>
<p>These are the lines that usually need changing in <code>settings.py</code>:</p>
<p class="file">mysite/settings.py</p>
<pre><code>import os
from pathlib import Path
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")
DEBUG = os.environ.get("DEBUG", "False") == "True"
ALLOWED_HOSTS = [".shipzo.tech", "localhost", "127.0.0.1"]
CSRF_TRUSTED_ORIGINS = ["https://*.shipzo.tech"]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    # ... the rest of your middleware stays as it was
]

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}", conn_max_age=600
    )
}</code></pre>
<p>WhiteNoise lets gunicorn serve your CSS, JavaScript and the admin's styles. Without it, the site loads but looks unstyled, because Django doesn't serve static files when <code>DEBUG</code> is off.</p>
<div class="note"><b>Don't turn on <code>SECURE_SSL_REDIRECT</code>.</b> Shipzo already serves your app over HTTPS and passes requests to it internally over plain HTTP. With that setting on, Django keeps redirecting to HTTPS and the browser ends up in a redirect loop.</div>
<p class="file">requirements.txt</p>
<pre><code>Django&gt;=5.0,&lt;6
gunicorn&gt;=22
whitenoise&gt;=6.6
dj-database-url&gt;=2.1
psycopg[binary]&gt;=3.1</code></pre>

<h2 id="database">Step 2: Use a hosted database</h2>
<p>Every deploy starts from a fresh container, so a <code>db.sqlite3</code> file inside the project is reset each time and anything users saved is lost. Use a free hosted PostgreSQL database instead, such as Neon or Supabase:</p>
<ol>
<li>Create a database and copy its connection string (it starts with <code>postgresql://</code>).</li>
<li>In Shipzo, open <b>Settings</b> → <b>Environment variables</b> and add <code>DATABASE_URL=postgresql://...</code>.</li>
<li>Add a real secret key as well. Generate one with <code>python -c "import secrets; print(secrets.token_urlsafe(50))"</code> and save it as <code>SECRET_KEY</code>.</li>
</ol>
<p>Variable values are injected when the app starts and masked in every log.</p>

<h2 id="migrations">Step 3: Run migrations on every deploy</h2>
<p>Shipzo doesn't run <code>migrate</code> on its own, so add it to the start command. Open <b>Settings</b> → <b>Build &amp; runtime overrides</b> and set <b>Start command</b> to:</p>
<pre><code>python manage.py migrate --noinput &amp;&amp; gunicorn mysite.wsgi:application --bind 0.0.0.0:$PORT --workers 2</code></pre>
<p>Replace <code>mysite</code> with the name of the folder that holds your <code>wsgi.py</code>. To create an admin user, point your local copy at the same database (set <code>DATABASE_URL</code> in your terminal) and run <code>python manage.py createsuperuser</code> on your own computer.</p>

<h2 id="deploy">Step 4: Push and deploy</h2>
<pre><code>git add .
git commit -m "Production settings"
git push</code></pre>
<p>In Shipzo, open <b>New deployment</b>, paste the repository link and press <b>Deploy</b>. The Starter plan is enough for a small site; for bigger projects with many apps, choose Standard. Your project is live at <code>https://your-project.shipzo.tech</code>, and later pushes redeploy it automatically.</p>

<h2 id="tests">Running your tests</h2>
<p>Shipzo runs <code>pytest</code> before each deploy when it finds files named <code>test_*.py</code> or <code>*_test.py</code>. Django's default <code>tests.py</code> doesn't match that pattern, so rename it (for example to <code>test_views.py</code>), add <code>pytest-django</code> to your requirements and create a <code>pytest.ini</code>:</p>
<p class="file">pytest.ini</p>
<pre><code>[pytest]
DJANGO_SETTINGS_MODULE = mysite.settings</code></pre>
<p>If a test fails, the release stops and the version that is already live keeps running.</p>

<h2 id="troubleshooting">Common errors and fixes</h2>
<div class="tbl"><table><thead><tr><th>Error</th><th>Fix</th></tr></thead><tbody>
<tr><td><code>DisallowedHost</code> / Bad Request (400)</td><td>Add <code>.shipzo.tech</code> to <code>ALLOWED_HOSTS</code>.</td></tr>
<tr><td>CSRF verification failed (403) when submitting a form</td><td>Add <code>https://*.shipzo.tech</code> to <code>CSRF_TRUSTED_ORIGINS</code>.</td></tr>
<tr><td>Pages load without CSS, admin looks broken</td><td>Add WhiteNoise to <code>MIDDLEWARE</code> and set <code>STATIC_ROOT</code>.</td></tr>
<tr><td><code>no such table</code> or <code>relation does not exist</code></td><td>Migrations haven't run. Set the start command from Step 3.</td></tr>
<tr><td>Too many redirects</td><td>Remove <code>SECURE_SSL_REDIRECT = True</code>.</td></tr>
<tr><td>Data disappears after a redeploy</td><td>You are still on SQLite. Set <code>DATABASE_URL</code> to a hosted database.</td></tr>
</tbody></table></div>
''',
faq=[('Do I need a Procfile or Dockerfile?', 'No. Shipzo detects Django from manage.py and writes the Dockerfile itself. You can see it in the DevOps files tab.'),
     ('Can I deploy Django REST Framework APIs?', 'Yes. The steps are the same; an API project usually doesn\'t even need WhiteNoise unless it uses the browsable API or the admin.'),
     ('Can I use MySQL instead of PostgreSQL?', 'Yes, any hosted database that dj-database-url understands works. Add the matching driver to requirements.txt. Free PostgreSQL from Neon or Supabase is the easiest option.'),
     ('Will my site go to sleep when nobody visits?', 'No. Apps on Shipzo keep running, so the first visitor doesn\'t wait for a cold start.')],
related=['deploy-flask-app-free', 'deploy-fastapi-app-free', 'deploy-website-from-github'],
),
# ------------------------------------------------------------------ FASTAPI
dict(
slug='deploy-fastapi-app-free',
published='2026-11-21',
title='How to Deploy a FastAPI App for Free (uvicorn + HTTPS, 2026)',
h1='How to deploy a FastAPI app for free',
description='Deploy a FastAPI backend for free with a live HTTPS URL: main.py and requirements.txt, uvicorn, CORS for your front end, and secrets in environment variables.',
tag='Python · FastAPI', read='6 min read',
lede='FastAPI is quick to write and quick to run. Deploying it mostly comes down to telling the server where your app object lives and which port to use. This is the shortest path from <code>uvicorn main:app --reload</code> to a public API with HTTPS and interactive docs.',
tldr=['Create the app in <code>main.py</code> (or <code>app.py</code>) as <code>app = FastAPI()</code>.', 'List <code>fastapi</code> in <code>requirements.txt</code>. Shipzo installs uvicorn and starts it on the right port.', 'Allow your front end\'s address with <code>CORSMiddleware</code>.', 'Push to GitHub and deploy. The docs appear at <code>https://your-api.shipzo.tech/docs</code>.'],
body=r'''
<h2 id="how">How Shipzo starts a FastAPI app</h2>
<p>When <code>requirements.txt</code> mentions <code>fastapi</code>, Shipzo looks for your code in this order: <code>app.py</code>, <code>main.py</code>, <code>wsgi.py</code>, <code>application.py</code>, <code>server.py</code>, <code>api.py</code>. It finds the variable you assigned <code>FastAPI()</code> to and starts <code>uvicorn main:app --host 0.0.0.0 --port $PORT</code> on Python 3.12. uvicorn is installed for you even if it isn't in your requirements.</p>
<div class="note">If your app lives inside a package, for example <code>app/main.py</code>, set a custom <b>Start command</b> in Settings: <code>uvicorn app.main:app --host 0.0.0.0 --port $PORT</code>.</div>

<h2 id="code">Step 1: The app</h2>
<p class="file">main.py</p>
<pre><code>import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="My API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:5173")],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/items/{item_id}")
def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "q": q}</code></pre>
<p class="file">requirements.txt</p>
<pre><code>fastapi&gt;=0.115
uvicorn[standard]&gt;=0.30
httpx&gt;=0.27        # only needed for the tests below</code></pre>
<p>The root route isn't strictly required. Shipzo's health check accepts any response below 500, so even a 404 at <code>/</code> counts as healthy. Still, a small <code>/</code> route makes the uptime and response-time charts on your dashboard meaningful.</p>

<h2 id="secrets">Step 2: Secrets and databases</h2>
<p>Read keys and connection strings with <code>os.environ</code>, then add the values in Shipzo under <b>Settings</b> → <b>Environment variables</b>. They are injected at start-up and masked in logs. For data that must survive a redeploy, use a hosted database such as Neon or Supabase (PostgreSQL) or MongoDB Atlas. A SQLite file inside the container is reset on every deploy.</p>

<h2 id="tests">Step 3 (optional): Add a test</h2>
<p>Any file named <code>test_*.py</code> makes Shipzo run <code>pytest</code> before each deploy, and a failing test stops the release:</p>
<p class="file">test_main.py</p>
<pre><code>from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_root():
    assert client.get("/").status_code == 200

def test_item():
    assert client.get("/items/5?q=hi").json() == {"item_id": 5, "q": "hi"}</code></pre>

<h2 id="deploy">Step 4: Push and deploy</h2>
<pre><code>git add .
git commit -m "FastAPI app"
git push</code></pre>
<p>Open <b>New deployment</b> in Shipzo, paste the repository link and press <b>Deploy</b>. When it is live, open <code>https://your-api.shipzo.tech/docs</code> for the Swagger UI or <code>/redoc</code> for ReDoc. If a React or Vue front end calls this API, set <code>FRONTEND_URL</code> to that front end's address so CORS lets it through.</p>

<h2 id="troubleshooting">Common errors and fixes</h2>
<div class="tbl"><table><thead><tr><th>Error</th><th>Fix</th></tr></thead><tbody>
<tr><td><code>Error loading ASGI app</code> / <code>Could not import module</code></td><td>The file or variable name doesn't match. Use <code>main.py</code> with <code>app = FastAPI()</code>, or set the start command.</td></tr>
<tr><td>Browser shows a CORS error</td><td>Add the exact front-end address, for example <code>https://my-site.shipzo.tech</code>, to <code>allow_origins</code>.</td></tr>
<tr><td><code>ModuleNotFoundError</code></td><td>Add the missing package to <code>requirements.txt</code> and push again.</td></tr>
<tr><td>App exits during start-up</td><td>Read the end of the build log. A missing environment variable is the usual cause.</td></tr>
</tbody></table></div>
''',
faq=[('Do the /docs and /redoc pages work after deployment?', 'Yes. FastAPI serves them from your app, so they are available at your project address.'),
     ('Can I use WebSockets?', 'Yes. WebSocket connections are passed through to your app.'),
     ('Can I run several uvicorn workers?', 'Yes. Set a custom start command such as uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2, and pick a plan with enough memory.'),
     ('Is it free?', 'Yes, during the beta, with up to 3 projects per account and no card.')],
related=['deploy-django-app-free', 'deploy-flask-app-free', 'deploy-react-vite-app'],
),
# ------------------------------------------------------------------ NEXT.JS
dict(
slug='deploy-nextjs-app-free',
published='2026-11-21',
title='How to Deploy a Next.js App for Free with SSR (2026)',
h1='How to deploy a Next.js app with server-side rendering',
description='Deploy a Next.js app as a real Node server so SSR, API routes and the App Router keep working. Environment variables, memory and build errors explained.',
tag='JavaScript · Next.js', read='6 min read',
lede='A Next.js app is more than a folder of static files. Server components, route handlers and server-side rendering need a running Node.js process. Shipzo builds your app with <code>next build</code> and runs it with <code>next start</code> inside a container, so whatever works with <code>npm run build &amp;&amp; npm start</code> on your machine works online too.',
tldr=['Check that <code>npm run build</code> succeeds locally.', 'Commit your lock file (<code>package-lock.json</code>, <code>yarn.lock</code> or <code>pnpm-lock.yaml</code>).', 'Add <code>NEXT_PUBLIC_</code> variables before deploying; keep secrets in variables without that prefix.', 'Use the Standard plan or higher, because a Next.js server needs more memory than a static site.'],
body=r'''
<h2 id="how">How Shipzo runs Next.js</h2>
<p>When <code>next</code> appears in <code>package.json</code>, Shipzo uses a Node 20 image, installs dependencies with <code>npm ci</code> (falling back to <code>npm install</code>), runs <code>npm run build</code> and starts the server with <code>next start -p $PORT -H 0.0.0.0</code>. There is nothing to configure.</p>

<h2 id="build">Step 1: Make sure it builds</h2>
<pre><code>npm install
npm run build
npm start        # open http://localhost:3000</code></pre>
<p>If the build fails on your computer, it will fail on the server too. Type errors and lint errors stop <code>next build</code> by default, so fix them first.</p>

<h2 id="env">Step 2: Environment variables</h2>
<p>Next.js has two kinds of variables, and mixing them up causes most deployment bugs:</p>
<ul>
<li><b>Public</b> variables start with <code>NEXT_PUBLIC_</code>. They are copied into the JavaScript sent to browsers when the app is built. Shipzo writes them into the build for you, but changing one only takes effect after a redeploy.</li>
<li><b>Server-only</b> variables, such as <code>DATABASE_URL</code> or an API key, have no prefix. Read them with <code>process.env</code> in server components and route handlers. They never reach the browser.</li>
</ul>
<p>Add both kinds under <b>Settings</b> → <b>Environment variables</b>. Never give a secret the <code>NEXT_PUBLIC_</code> prefix, because anyone can read it in the page source.</p>

<h2 id="plan">Step 3: Pick a plan</h2>
<p>A Next.js server keeps your pages, its caches and its image optimizer in memory. The free Starter plan (256&nbsp;MB) is tight for that, so choose <b>Standard</b> (512&nbsp;MB) or <b>Pro</b> (1&nbsp;GB). If the dashboard shows the container restarting, it is usually running out of memory. Setting <code>images: { unoptimized: true }</code> in <code>next.config.js</code> also lowers memory use on small plans.</p>

<h2 id="export">What about static export?</h2>
<p>If your config has <code>output: 'export'</code>, the app is fully static and <code>next start</code> refuses to run it. Either remove that line, so the app runs as a server, or add your own Dockerfile that serves the <code>out/</code> folder with a static web server.</p>

<h2 id="deploy">Step 4: Push and deploy</h2>
<pre><code>git add .
git commit -m "Ready to deploy"
git push</code></pre>
<p>Open <b>New deployment</b>, paste the repository link, pick a plan and press <b>Deploy</b>. Your app is live at <code>https://your-app.shipzo.tech</code>, and later pushes redeploy it with zero downtime.</p>

<h2 id="troubleshooting">Common errors and fixes</h2>
<div class="tbl"><table><thead><tr><th>Problem</th><th>Fix</th></tr></thead><tbody>
<tr><td><code>Type error: ...</code> during the build</td><td>Fix the error locally; the build log shows the file and line.</td></tr>
<tr><td>Container keeps restarting</td><td>Out of memory. Move to Standard or Pro.</td></tr>
<tr><td>A <code>NEXT_PUBLIC_</code> value is <code>undefined</code></td><td>Add the variable, then redeploy so it is built in.</td></tr>
<tr><td><code>"next start" does not work with "output: export"</code></td><td>Remove <code>output: 'export'</code>, or add a Dockerfile for the static files.</td></tr>
<tr><td>API route returns 404</td><td>Check the file path, for example <code>app/api/hello/route.ts</code>.</td></tr>
</tbody></table></div>
''',
faq=[('Does the App Router work?', 'Yes. The app runs with next start, so the App Router, server components and route handlers all work.'),
     ('Do ISR and revalidate work?', 'Yes, within one running server. The cache starts empty after each deploy, because every release begins with a fresh container.'),
     ('Can I use a separate backend with Next.js?', 'Yes. Deploy the backend as its own Shipzo project and put its address in a NEXT_PUBLIC_ variable.'),
     ('Is it free?', 'Every plan is free during the beta, with up to 3 projects per account.')],
related=['deploy-react-vite-app', 'deploy-mern-stack-app-free', 'deploy-node-express-app-free'],
),
# ------------------------------------------------------------------ STATIC HTML
dict(
slug='host-html-css-website-free',
published='2026-11-21',
title='How to Host an HTML, CSS and JavaScript Website for Free (2026)',
h1='How to host an HTML, CSS and JavaScript website for free',
description='Put an HTML, CSS and JavaScript website or portfolio online free with HTTPS: folder structure, relative paths, clean URLs, ZIP upload and common fixes.',
tag='HTML · CSS · JavaScript', read='5 min read',
lede='A static website, made of HTML, CSS, JavaScript and images with no server code, is the easiest kind of project to host. You don\'t need to install anything, and you don\'t even need Git: a ZIP file is enough.',
tldr=['Put <code>index.html</code> in the top folder (or in <code>public/</code>, <code>site/</code> or <code>docs/</code>).', 'Use relative paths like <code>images/logo.png</code>, and match capital letters exactly.', 'Deploy from GitHub or upload a ZIP of the folder.', 'The site is served at <code>https://your-site.shipzo.tech</code> by nginx, with compression and HTTPS.'],
body=r'''
<h2 id="structure">Step 1: Check the folder structure</h2>
<pre><code>portfolio/
├── index.html        ← the home page
├── about.html
├── projects.html
├── css/
│   └── style.css
├── js/
│   └── main.js
└── images/
    └── profile.jpg</code></pre>
<p>Shipzo looks for <code>index.html</code> at the top of the project, or inside <code>public/</code>, <code>site/</code> or <code>docs/</code>. If your main page has a different name, such as <code>calculator.html</code>, that's fine too: Shipzo picks the home page by itself, preferring names like <em>home</em>, <em>main</em> or <em>landing</em> and pages that link to the others, and avoiding pages like <em>login</em> or <em>404</em>. Renaming it to <code>index.html</code> is still the surest option.</p>

<h2 id="paths">Step 2: Fix your paths</h2>
<ul>
<li><b>Use relative paths.</b> <code>&lt;img src="images/profile.jpg"&gt;</code> works everywhere. <code>&lt;img src="C:\Users\you\Desktop\profile.jpg"&gt;</code> only works on your laptop.</li>
<li><b>Match capital letters.</b> Windows treats <code>Profile.JPG</code> and <code>profile.jpg</code> as the same file. Web servers don't.</li>
<li><b>Avoid spaces in file names.</b> <code>my-project.html</code> is safer than <code>my project.html</code>.</li>
</ul>
<p>Pages also get clean addresses: <code>/about</code> serves <code>about.html</code>, so links can use either form.</p>

<h2 id="deploy">Step 3: Deploy it</h2>
<p><b>Option A, from GitHub.</b> Push the folder to a repository, then paste the link into <b>New deployment</b>. Every later push updates the site. The <a href="/guides/deploy-website-from-github">GitHub deployment guide</a> covers this in detail.</p>
<p><b>Option B, without Git.</b> Zip the folder so that <code>index.html</code> sits at the top level of the ZIP, open <b>New deployment</b> → <b>Upload ZIP</b> (up to 250&nbsp;MB) and press <b>Deploy</b>. To update the site later, upload a new ZIP from the project's Settings.</p>
<p>Either way, the site goes live at <code>https://your-site.shipzo.tech</code> within a minute. The free Starter plan is plenty, because a static site uses very little memory.</p>

<h2 id="what-you-get">What you get</h2>
<ul>
<li>nginx serving your files, with gzip compression for CSS, JavaScript, JSON and SVG</li>
<li>An HTTPS certificate issued automatically for your subdomain</li>
<li>Uptime checks, and a history of your last five versions that you can roll back to</li>
</ul>

<h2 id="troubleshooting">Common problems and fixes</h2>
<div class="tbl"><table><thead><tr><th>Problem</th><th>Fix</th></tr></thead><tbody>
<tr><td>Page shows but has no styling</td><td>The path in <code>&lt;link href="..."&gt;</code> is wrong or has different capital letters.</td></tr>
<tr><td>Images are broken</td><td>Check the path and the file name's capital letters, and make sure the image was committed or zipped.</td></tr>
<tr><td>A contact form does nothing</td><td>A static site can't process form submissions. Use a form service, or add a small backend (see the <a href="/guides/deploy-flask-app-free">Flask</a> or <a href="/guides/deploy-node-express-app-free">Express</a> guides).</td></tr>
<tr><td>Changes don't show up</td><td>Check that the new deployment finished, then hard-refresh the browser (Ctrl+Shift+R).</td></tr>
</tbody></table></div>
''',
faq=[('Do I need GitHub?', 'No. You can upload a ZIP of the folder instead. GitHub is only needed if you want automatic redeploys on every push.'),
     ('Can I use Bootstrap or Tailwind from a CDN?', 'Yes. Links to CDNs work exactly as they do on your computer.'),
     ('Is this good for a portfolio or resume website?', 'Yes. It is one of the most common uses: you get a free HTTPS address you can put on your resume and LinkedIn.'),
     ('Is it free?', 'Yes, during the beta, with up to 3 projects per account and no card.')],
related=['host-college-project-online', 'deploy-website-from-github', 'deploy-react-vite-app'],
),
# ------------------------------------------------------------------ DOCKER
dict(
slug='deploy-docker-app-free',
published='2026-11-21',
title='Free Docker Hosting: Deploy a Dockerfile with HTTPS (2026)',
h1='How to deploy a Docker container for free',
description='Deploy any app with a Dockerfile and get a live HTTPS URL: how the port is chosen, resource limits, small multi-stage images and what isn\'t supported.',
tag='Docker · Any language', read='7 min read',
lede='If your project has a Dockerfile, the host doesn\'t need to understand your framework. Shipzo builds the image exactly as written and runs it with HTTPS, monitoring and rollback. Ruby, Rust, Java, PHP or .NET: if it runs in a container and answers HTTP requests, it can be deployed.',
tldr=['Keep the <code>Dockerfile</code> at the top of the repository, or of the root directory you choose.', '<code>EXPOSE</code> the port your app listens on. Shipzo also passes that number in the <code>PORT</code> variable.', 'Listen on <code>0.0.0.0</code>, not <code>localhost</code>.', 'Use a multi-stage build and a <code>.dockerignore</code> to keep the image small.'],
body=r'''
<h2 id="how">How Shipzo uses your Dockerfile</h2>
<ul>
<li>The image is built exactly as written. Shipzo doesn't change your Dockerfile.</li>
<li>The port comes from the first <code>EXPOSE</code> line (3000 if there is none). The same number is passed to the container as the <code>PORT</code> environment variable.</li>
<li>The container runs with your plan's memory and CPU limits, a cap of 256 processes and no extra privileges. It is reachable only through <code>https://your-app.shipzo.tech</code>.</li>
<li>There is no separate test stage for Dockerfile projects. Run your tests inside the Dockerfile instead; if a <code>RUN</code> step fails, the build stops and the live version keeps running.</li>
</ul>

<h2 id="example">An example Dockerfile</h2>
<p>A multi-stage build compiles and tests in one image, then copies only what is needed into a small final image:</p>
<p class="file">Dockerfile</p>
<pre><code># 1. build and test
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build &amp;&amp; npm test

# 2. small runtime image
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/server.js"]</code></pre>
<p>Inside the app, read the port with something like <code>process.env.PORT || 8080</code> and listen on <code>0.0.0.0</code>. Add a <code>.dockerignore</code> so local junk doesn't end up in the image:</p>
<p class="file">.dockerignore</p>
<pre><code>node_modules
.git
.env
*.log</code></pre>

<h2 id="limits">Resource limits by plan</h2>
<div class="tbl"><table><thead><tr><th>Plan</th><th>Memory</th><th>CPU</th></tr></thead><tbody>
<tr><td>Starter</td><td>256 MB</td><td>0.5 vCPU</td></tr>
<tr><td>Standard</td><td>512 MB</td><td>1 vCPU</td></tr>
<tr><td>Pro</td><td>1 GB</td><td>2 vCPU</td></tr>
</tbody></table></div>
<p>All plans are free during the beta. Images are built on the server, and the last five successful images are kept so you can roll back without rebuilding, which is one more reason to keep them small.</p>

<h2 id="not-supported">What isn't supported</h2>
<ul>
<li><b>docker-compose with several services.</b> Each Shipzo project runs one container. Deploy each service as its own project and use a hosted database.</li>
<li><b>Volumes.</b> The filesystem starts fresh on every deploy, so store data in a database or object storage.</li>
<li><b>Privileged containers, host networking or fixed host ports.</b></li>
</ul>

<h2 id="other-way">Going the other way</h2>
<p>For projects without a Dockerfile, Shipzo writes one for you. Open the <b>DevOps files</b> tab to see it, together with a <code>docker-compose.yml</code> and a GitHub Actions workflow. Commit them if you want to run the same container anywhere else. If your repository has a Dockerfile but you'd rather use Shipzo's, tick <b>Ignore repository Dockerfile</b> in Settings.</p>

<h2 id="troubleshooting">Common errors and fixes</h2>
<div class="tbl"><table><thead><tr><th>Problem</th><th>Fix</th></tr></thead><tbody>
<tr><td>Health check timed out</td><td>The <code>EXPOSE</code> port doesn't match the port the app listens on, or the app binds to <code>localhost</code>.</td></tr>
<tr><td>Container keeps restarting</td><td>It is running out of memory. Choose a bigger plan or reduce memory use.</td></tr>
<tr><td>Build fails at a <code>RUN</code> step</td><td>Open the build log; the failing command and its output are shown there.</td></tr>
<tr><td><code>permission denied</code> when binding to port 80</td><td>Non-root users can't use ports below 1024. Listen on 8080 and <code>EXPOSE 8080</code>.</td></tr>
</tbody></table></div>
''',
faq=[('Can I use docker-compose?', 'Not with several services in one project. Deploy each service as a separate project and connect them over HTTPS.'),
     ('Will Shipzo use my Dockerfile or its own?', 'Yours, if the repository has one. Tick Ignore repository Dockerfile in Settings to use the generated one instead.'),
     ('Can I deploy Java, PHP, Ruby or Rust apps?', 'Yes, through a Dockerfile, as long as the app answers HTTP requests on the exposed port.'),
     ('Is Docker hosting free?', 'Yes, during the beta, with up to 3 projects per account and no card.')],
related=['deploy-website-from-github', 'deploy-node-express-app-free', 'deploy-fastapi-app-free'],
),
# ------------------------------------------------------------------ MERN
dict(
slug='deploy-mern-stack-app-free',
published='2026-11-21',
title='How to Deploy a MERN Stack App for Free (2026 Guide)',
h1='How to deploy a MERN stack app for free',
description='Deploy a full MERN project for free: the Express API and React front end as two projects from one repo, MongoDB Atlas, environment variables, CORS and VITE_API_URL.',
tag='MERN · MongoDB · React · Node', read='9 min read',
lede='Most MERN projects are really two apps in one repository: an Express API and a React front end. The easiest way to deploy them is as two separate deployments that talk to each other over HTTPS, with the database on MongoDB Atlas.',
tldr=['Keep the API and the front end in separate folders, for example <code>backend/</code> and <code>frontend/</code>.', 'Create a free MongoDB Atlas cluster and put its connection string in <code>MONGODB_URI</code>.', 'Deploy <code>backend/</code> first, then <code>frontend/</code> with <code>VITE_API_URL</code> set to the backend address.', 'Allow the front-end address in the backend\'s CORS settings.'],
body=r'''
<h2 id="structure">The project layout</h2>
<pre><code>my-mern-app/
├── backend/
│   ├── package.json
│   ├── server.js
│   └── routes/
└── frontend/
    ├── package.json
    ├── vite.config.js
    └── src/</code></pre>
<p>Both folders live in one GitHub repository. You will create two Shipzo projects from it, each pointing at its own folder.</p>

<h2 id="atlas">Step 1: Set up the database on MongoDB Atlas</h2>
<ol>
<li>Create a free cluster on MongoDB Atlas.</li>
<li>Under <b>Database Access</b>, add a user with a password.</li>
<li>Under <b>Network Access</b>, allow access from anywhere (<code>0.0.0.0/0</code>) or from the server's IP address. If you skip this, the connection times out.</li>
<li>Click <b>Connect</b> → <b>Drivers</b> and copy the connection string. It starts with <code>mongodb+srv://</code>.</li>
</ol>
<p><code>mongodb://localhost:27017</code> only works on your own computer, so the deployed app must use the Atlas string.</p>

<h2 id="backend">Step 2: Prepare the backend</h2>
<p class="file">backend/server.js</p>
<pre><code>const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL }));

app.get('/', (req, res) =&gt; res.json({ status: 'ok' }));
app.use('/api/notes', require('./routes/notes'));

mongoose.connect(process.env.MONGODB_URI)
  .then(() =&gt; console.log('MongoDB connected'))
  .catch((err) =&gt; { console.error(err); process.exit(1); });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =&gt; console.log(`API on ${PORT}`));</code></pre>
<p>In <code>backend/package.json</code>, make sure <code>"start": "node server.js"</code> is set (not nodemon), and that <code>express</code>, <code>mongoose</code> and <code>cors</code> are in <code>dependencies</code>.</p>

<h2 id="frontend">Step 3: Prepare the front end</h2>
<p>Never hard-code <code>http://localhost:5000</code> in your React code. Read the API address from a build-time variable instead:</p>
<p class="file">frontend/src/api.js</p>
<pre><code>const API = import.meta.env.VITE_API_URL;

export async function getNotes() {
  const res = await fetch(`${API}/api/notes`);
  return res.json();
}</code></pre>
<p>For local development, put <code>VITE_API_URL=http://localhost:5000</code> in <code>frontend/.env</code> (and keep <code>.env</code> out of Git). If you used Create React App instead of Vite, the variable is <code>REACT_APP_API_URL</code> and you read it with <code>process.env.REACT_APP_API_URL</code>.</p>

<h2 id="deploy">Step 4: Deploy two projects</h2>
<p><b>Project 1, the API.</b> Open <b>New deployment</b>, paste the repository link, set <b>Root directory</b> to <code>backend/</code> and name the project, for example <code>notes-api</code>. Add two environment variables:</p>
<pre><code>MONGODB_URI=mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/notes
FRONTEND_URL=https://notes.shipzo.tech</code></pre>
<p>Deploy. The API is now at <code>https://notes-api.shipzo.tech</code>.</p>
<p><b>Project 2, the front end.</b> Create another deployment from the same repository with <b>Root directory</b> set to <code>frontend/</code>, name it <code>notes</code>, and add:</p>
<pre><code>VITE_API_URL=https://notes-api.shipzo.tech</code></pre>
<p>Deploy. The site is at <code>https://notes.shipzo.tech</code>. Refreshing deep links such as <code>/notes/42</code> works without extra configuration, because Shipzo serves <code>index.html</code> for client-side routes.</p>
<p>From now on, a <code>git push</code> redeploys both projects. The beta allows three projects per account, so a MERN app uses two of them.</p>

<h2 id="troubleshooting">Common errors and fixes</h2>
<div class="tbl"><table><thead><tr><th>Problem</th><th>Fix</th></tr></thead><tbody>
<tr><td>CORS error in the browser console</td><td><code>FRONTEND_URL</code> must exactly match the front-end address, with <code>https://</code> and no trailing slash.</td></tr>
<tr><td>Front end still calls <code>localhost</code></td><td><code>VITE_API_URL</code> is built in. Set it in the front-end project, then redeploy that project.</td></tr>
<tr><td><code>MongooseServerSelectionError</code></td><td>Atlas is blocking the connection. Check <b>Network Access</b>.</td></tr>
<tr><td>Mixed content blocked</td><td>The API address must start with <code>https://</code>.</td></tr>
<tr><td>Health check timed out on the API</td><td>Use <code>process.env.PORT</code> instead of a fixed port.</td></tr>
</tbody></table></div>
''',
faq=[('Can I deploy the whole MERN app as one project?', 'Yes, if Express serves the built React files with express.static. Then there is one project, one address and no CORS setup, but every change rebuilds both halves.'),
     ('Is MongoDB Atlas free?', 'Atlas has a free M0 tier with 512 MB of storage, which is plenty for student projects and demos.'),
     ('Does Socket.io work?', 'Yes. WebSocket connections are passed through to your app.'),
     ('Is hosting free?', 'Yes, during the beta, with up to 3 projects per account and no card.')],
related=['deploy-node-express-app-free', 'deploy-react-vite-app', 'deploy-nextjs-app-free'],
),
]

BY_SLUG = {g['slug']: g for g in GUIDES}
LOGO = '<span class="logo"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 20l8-12 8 12h-5v5h-6v-5z" fill="currentColor"/></svg></span>'
FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23ff6b35'/%3E%3Cpath d='M8 20l8-12 8 12h-5v5h-6v-5z' fill='white'/%3E%3C/svg%3E"

def head(title, desc, url, ld):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#0b0d11">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Shipzo">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/guides/guides.css">
{''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' for x in ld)}
</head>
<body>
<header class="nav"><div class="wrap">
  <a class="brand" href="/">{LOGO}Shipzo</a>
  <nav aria-label="Site"><a href="/#features">Features</a><a href="/guides" aria-current="page">Guides</a><a href="/#plans">Plans</a><a href="/#faq">FAQ</a></nav>
  <div class="cta"><a class="btn ghost" href="/login">Log in</a><a class="btn primary" href="/signup">Start free</a></div>
</div></header>
'''

FOOT = '''<footer><div class="wrap"><span>© 2026 Shipzo · ShipStack deployment platform</span><span><a href="/guides">Guides</a><a href="/legal">Terms &amp; Privacy</a><a href="/signup">Start free</a></span></div></footer>
</body>
</html>
'''

def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s)

def build_guide(g):
    url = f"{SITE}/guides/{g['slug']}"
    headings = re.findall(r'<h2 id="([^"]+)">(.*?)</h2>', g['body'])
    ld = [
        {'@context': 'https://schema.org', '@type': 'TechArticle', 'headline': g['title'], 'description': g['description'], 'url': url,
         'datePublished': g.get('published', UPDATED), 'dateModified': g.get('published', UPDATED), 'image': f'{SITE}/og.png', 'inLanguage': 'en',
         'author': {'@type': 'Organization', 'name': 'Shipzo', 'url': SITE}, 'publisher': {'@type': 'Organization', 'name': 'Shipzo', 'url': SITE}},
        {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Shipzo', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Guides', 'item': SITE + '/guides'},
            {'@type': 'ListItem', 'position': 3, 'name': g['h1'], 'item': url}]},
        {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in g['faq']]},
    ]
    toc = ''.join(f'<a href="#{i}">{strip_tags(t)}</a>' for i, t in headings) + '<a href="#faq">FAQ</a>'
    tldr = ''.join(f'<li>{x}</li>' for x in g['tldr'])
    faq = ''.join(f'<details><summary>{html.escape(q)}</summary><p>{html.escape(a)}</p></details>' for q, a in g['faq'])
    related = ''.join(card(BY_SLUG[s]) for s in g['related'] if s in BY_SLUG)
    page = head(g['title'], g['description'], url, ld) + f'''<main class="wrap">
  <div class="crumbs"><a href="/">Shipzo</a> / <a href="/guides">Guides</a> / {html.escape(g['tag'])}</div>
  <div class="layout">
    <article>
      <h1>{html.escape(g['h1'])}</h1>
      <div class="meta"><span>{html.escape(g['tag'])}</span><span>{g['read']}</span><span>Updated {human(g.get('published', UPDATED))}</span></div>
      <p class="lede">{g['lede']}</p>
      <div class="tldr"><b>Quick answer</b><ol>{tldr}</ol></div>
      {g['body']}
      <div class="cta-box"><h2>Deploy it in one click</h2><p>Paste your GitHub repo into Shipzo. Tests, Docker build, HTTPS and monitoring are handled for you. Free during the beta, no card needed.</p><a class="btn primary" href="/signup">Create a free account</a></div>
      <h2 id="faq">Frequently asked questions</h2>
      <div class="faq">{faq}</div>
      <div class="related"><h2>Related guides</h2><div class="cards">{related}</div></div>
    </article>
    <aside class="toc" aria-label="On this page"><b>On this page</b>{toc}</aside>
  </div>
</main>
''' + FOOT
    return page

def card(g):
    return f'<a class="card" href="/guides/{g["slug"]}"><span>{html.escape(g["tag"])}</span><b>{html.escape(g["h1"])}</b><p>{html.escape(g["description"][:130].rsplit(" ", 1)[0])}…</p></a>'

GROUPS = [
    ('Start here', 'The basics that apply to every project: getting code from GitHub (or a ZIP) to a live HTTPS address.',
     ['deploy-website-from-github', 'host-college-project-online', 'host-html-css-website-free', 'deploy-docker-app-free']),
    ('Python apps', 'Flask, Django, FastAPI and Streamlit, including gunicorn and uvicorn, static files, databases and machine-learning models.',
     ['deploy-flask-app-free', 'deploy-django-app-free', 'deploy-fastapi-app-free', 'host-streamlit-app-free']),
    ('JavaScript apps', 'React and Vite front ends, Node.js and Express APIs, Next.js with server-side rendering, and full MERN projects.',
     ['deploy-react-vite-app', 'deploy-node-express-app-free', 'deploy-nextjs-app-free', 'deploy-mern-stack-app-free']),
]

def build_hub():
    url = f'{SITE}/guides'
    ld = [{'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': 'Shipzo deployment guides', 'url': url,
           'hasPart': [{'@type': 'TechArticle', 'headline': g['title'], 'url': f"{SITE}/guides/{g['slug']}"} for g in GUIDES]},
          {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Shipzo', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Guides', 'item': url}]}]
    title = 'Free Deployment Guides: Flask, Django, React, Node | Shipzo'
    desc = 'Step-by-step guides to deploy web apps for free: Flask, Django, FastAPI, Streamlit, React, Node.js, Next.js, MERN, Docker and HTML sites.'
    listed = {s for _, _, slugs in GROUPS for s in slugs}
    groups = [(n, d, [BY_SLUG[s] for s in slugs if s in BY_SLUG]) for n, d, slugs in GROUPS]
    rest = [g for g in GUIDES if g['slug'] not in listed]
    if rest:
        groups.append(('More guides', '', rest))
    sections = ''.join(f'<h2 class="hub-h">{html.escape(n)}</h2>' + (f'<p class="hub-p">{html.escape(d)}</p>' if d else '') +
                       f'<div class="cards">{"".join(card(g) for g in gs)}</div>' for n, d, gs in groups)
    return head(title, desc, url, ld) + f'''<main class="wrap">
  <div class="hub-head"><div class="eyebrow">Guides</div><h1>How to deploy your web project, step by step</h1><p>Practical guides for getting web apps online for free, from preparing the code to fixing the errors everyone runs into. Each one is written for students and small teams, uses real code, and ends with a working HTTPS link. Pick your stack below, or start with deploying from GitHub if you are not sure.</p></div>
  <div style="padding-bottom:80px">{sections}</div>
</main>
''' + FOOT

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for g in GUIDES:
        with open(os.path.join(OUT, g['slug'] + '.html'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(build_guide(g))
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(build_hub())
    # sitemap
    urls = [('/', '1.0', 'weekly', SITE_UPDATED), ('/guides', '0.9', 'weekly', SITE_UPDATED)] + [(f"/guides/{g['slug']}", '0.8', 'monthly', g.get('published', UPDATED)) for g in GUIDES] + [('/legal', '0.2', 'yearly', UPDATED)]
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(
        f'  <url><loc>{SITE}{u}</loc><lastmod>{d}</lastmod><changefreq>{c}</changefreq><priority>{p}</priority></url>\n' for u, p, c, d in urls) + '</urlset>\n'
    with open(os.path.join(ROOT, 'public', 'sitemap.xml'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(sm)
    print(f'built {len(GUIDES)} guides + index + sitemap ({len(urls)} URLs)')

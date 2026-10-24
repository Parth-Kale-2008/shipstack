# Generates the SEO guide pages in public/guides/ from the content below.
# Usage: python tools/build-guides.py      (then commit the generated .html files)
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'guides')
SITE = 'https://shipzo.tech'
UPDATED = '2026-10-25'
UPDATED_HUMAN = '25 October 2026'

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
related=['host-streamlit-app-free', 'deploy-node-express-app-free', 'host-college-project-online'],
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
related=['deploy-node-express-app-free', 'host-college-project-online', 'deploy-flask-app-free'],
),
# ------------------------------------------------------------------ COLLEGE PROJECT
dict(
slug='host-college-project-online',
title='How to Host Your College Project Online for Free (Live Link for Your Viva)',
h1='How to host your college project online for free',
description='Get a free live link for your college project, mini-project or PBL: HTML/CSS/JS sites, Flask, Node and Streamlit apps. Upload to GitHub without commands and deploy with HTTPS.',
tag='Students · PBL · Viva', read='7 min read',
lede='A working live link beats screenshots in every viva, project report and résumé. Here\'s how to put your college project online for free, even if you\'ve never used Git.',
tldr=['Name your main page <code>index.html</code>, and use relative file paths.', 'Upload the project to GitHub through the website (no commands needed).', 'Deploy it on Shipzo from the GitHub link.', 'Put the link and a QR code in your report and slides.'],
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
<li><b>Name the main page <code>index.html</code></b> and keep it in the top folder. Web servers open <code>index.html</code> by default, so a site whose main page is <code>calculator.html</code> shows "not found" at the home address.</li>
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
related=['deploy-flask-app-free', 'host-streamlit-app-free', 'deploy-react-vite-app'],
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
related=['deploy-react-vite-app', 'deploy-flask-app-free', 'host-college-project-online'],
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
<link rel="icon" href="{FAVICON}">
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
         'datePublished': UPDATED, 'dateModified': UPDATED, 'image': f'{SITE}/og.png', 'inLanguage': 'en',
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
      <div class="meta"><span>{html.escape(g['tag'])}</span><span>{g['read']}</span><span>Updated {UPDATED_HUMAN}</span></div>
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

def build_hub():
    url = f'{SITE}/guides'
    ld = [{'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': 'Shipzo deployment guides', 'url': url,
           'hasPart': [{'@type': 'TechArticle', 'headline': g['title'], 'url': f"{SITE}/guides/{g['slug']}"} for g in GUIDES]}]
    title = 'Free Deployment Guides: Flask, Streamlit, React, Node & College Projects | Shipzo'
    desc = 'Step-by-step guides to deploy Flask, Streamlit, React (Vite) and Node.js apps and host college projects online for free, with fixes for the most common errors.'
    return head(title, desc, url, ld) + f'''<main class="wrap">
  <div class="hub-head"><div class="eyebrow">Guides</div><h1>Deploy your project, step by step</h1><p>Practical guides for getting web apps online, from preparing the code to fixing the errors everyone hits. Written for students and small teams.</p></div>
  <div class="cards" style="padding-bottom:80px">{''.join(card(g) for g in GUIDES)}</div>
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
    urls = [('/', '1.0', 'weekly'), ('/signup', '0.8', 'monthly'), ('/guides', '0.8', 'weekly')] + [(f"/guides/{g['slug']}", '0.7', 'monthly') for g in GUIDES] + [('/legal', '0.3', 'yearly')]
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(
        f'  <url><loc>{SITE}{u}</loc><lastmod>{UPDATED}</lastmod><changefreq>{c}</changefreq><priority>{p}</priority></url>\n' for u, p, c in urls) + '</urlset>\n'
    with open(os.path.join(ROOT, 'public', 'sitemap.xml'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(sm)
    print(f'built {len(GUIDES)} guides + index + sitemap ({len(urls)} URLs)')

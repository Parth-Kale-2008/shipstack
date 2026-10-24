import os
from datetime import datetime

from flask import Flask, jsonify, render_template_string

app = Flask(__name__)

PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Flask on ShipStack</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh;
           display: grid; place-items: center; padding: 1rem;
           background: linear-gradient(135deg, #fff7ed, #ecfdf5); color: #0f172a; }
    .card { background: #fff; max-width: 520px; width: 100%; padding: 2rem; border-radius: 16px;
            box-shadow: 0 8px 30px rgba(0,0,0,.08); }
    h1 { margin: 0 0 .5rem; } h1 span { color: #f97316; }
    p { color: #475569; }
    ul { padding-left: 1.2rem; }
    code { background: #f1f5f9; padding: .15rem .4rem; border-radius: 6px; }
    .badge { display: inline-block; background: #dcfce7; color: #166534; padding: .2rem .7rem;
             border-radius: 999px; font-size: .85rem; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">● Running</span>
    <h1>Namaste from <span>Flask</span></h1>
    <p>This Python app was deployed with one click on ShipStack.</p>
    <ul>
      <li><code>GET /</code> shows this page</li>
      <li><code>GET /health</code> returns JSON health status</li>
    </ul>
    <p><small>Server time: {{ now }}</small></p>
  </div>
</body>
</html>"""


@app.route("/")
def index():
    return render_template_string(PAGE, now=datetime.now().strftime("%d %b %Y, %H:%M:%S"))


@app.route("/health")
def health():
    return jsonify(status="ok")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))

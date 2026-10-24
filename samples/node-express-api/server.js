const express = require("express");

const app = express();
app.use(express.json());

// In-memory store (resets on every restart, no database)
let nextId = 3;
const tasks = [
  { id: 1, title: "Write the project report", done: false },
  { id: 2, title: "Prepare demo", done: false },
];

app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tasks API</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 2rem 1rem; }
    .wrap { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 14px; padding: 2rem; box-shadow: 0 4px 24px rgba(0,0,0,.06); }
    h1 { margin-top: 0; } h1 span { color: #f97316; }
    code { background: #f1f5f9; padding: .15rem .4rem; border-radius: 6px; }
    li { margin: .5rem 0; }
    .m { display: inline-block; min-width: 3.5rem; font-weight: 700; color: #16a34a; }
    .m.post { color: #2563eb; }
    p.small { color: #64748b; font-size: .9rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Tasks <span>API</span></h1>
    <p>A small Express REST API running on ShipStack. ${tasks.length} task(s) in memory right now.</p>
    <ul>
      <li><span class="m">GET</span> <code>/health</code> returns service status</li>
      <li><span class="m">GET</span> <code>/api/tasks</code> lists all tasks</li>
      <li><span class="m post">POST</span> <code>/api/tasks</code> creates a task, body <code>{"title": "..."}</code></li>
    </ul>
    <p class="small">Data is stored in memory and resets on restart.</p>
  </div>
</body>
</html>`);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/tasks", (req, res) => {
  res.json(tasks);
});

app.post("/api/tasks", (req, res) => {
  const title = req.body && typeof req.body.title === "string" ? req.body.title.trim() : "";
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
  const task = { id: nextId++, title, done: false };
  tasks.push(task);
  res.status(201).json(task);
});

module.exports = app;

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Tasks API listening on http://0.0.0.0:${port}`);
  });
}

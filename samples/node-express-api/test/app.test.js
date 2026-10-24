const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../server");

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test("GET /health returns ok", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("POST /api/tasks without title returns 400", async () => {
  const res = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test("POST /api/tasks creates a task", async () => {
  const res = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Submit viva slides" }),
  });
  assert.equal(res.status, 201);
  const task = await res.json();
  assert.equal(task.title, "Submit viva slides");
  assert.equal(typeof task.id, "number");

  const list = await (await fetch(`${baseUrl}/api/tasks`)).json();
  assert.ok(list.some((t) => t.id === task.id));
});

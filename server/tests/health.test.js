import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";

// Smoke test: starts an ephemeral HTTP server without needing a third-party test runner.
test("health endpoint reports API and database readiness", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.database, "ready");
});

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { app } from "../src/app.js";

const server = app.listen(0, "127.0.0.1");
await new Promise((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});
const baseUrl = `http://127.0.0.1:${server.address().port}`;
after(() => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
}));

async function preflight(origin) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
}

test("CORS permits only the deployed and local frontend origins with credentials", async () => {
  for (const origin of [
    "https://smart-grade-ai-p1.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]) {
    const response = await preflight(origin);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  }

  const rejected = await preflight("https://untrusted.example");
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("auth API paths are mounted and are not returning route-not-found errors", async () => {
  const origin = "https://smart-grade-ai-p1.vercel.app";
  const session = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Origin: origin },
  });
  assert.equal(session.status, 401);
  assert.equal(session.headers.get("access-control-allow-origin"), origin);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(login.status, 400);
  assert.equal(login.headers.get("access-control-allow-origin"), origin);
});

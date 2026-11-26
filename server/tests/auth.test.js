import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../src/app.js";
import { db } from "../src/database/db.js";

test("signup, login, session lookup, and logout work with role restrictions", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const email = `phase3-${randomUUID()}@example.test`;
  let userId;
  try {
    let response = await fetch(`${base}/auth/signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5173",
      },
      body: JSON.stringify({
        fullName: "Phase Three Tester",
        email,
        password: "SafePassword!123",
        role: "teacher",
        termsAccepted: true,
      }),
    });
    assert.equal(response.status, 201);
    const signup = await response.json();
    userId = signup.user.id;
    assert.equal(signup.user.role, "teacher");
    assert.equal("password_hash" in signup.user, false);
    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie?.includes("HttpOnly"));
    const sessionCookie = cookie.split(";")[0];

    response = await fetch(`${base}/auth/me`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.email, email);

    response = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5173",
      },
      body: JSON.stringify({ email, password: "incorrect-password" }),
    });
    assert.equal(response.status, 401);

    response = await fetch(`${base}/auth/signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5173",
      },
      body: JSON.stringify({
        fullName: "Public Admin Attempt",
        email: `admin-${randomUUID()}@example.test`,
        password: "SafePassword!123",
        role: "admin",
        termsAccepted: true,
      }),
    });
    assert.equal(response.status, 400);

    response = await fetch(`${base}/auth/logout`, {
      method: "POST",
      headers: { cookie: sessionCookie, origin: "http://127.0.0.1:5173" },
    });
    assert.equal(response.status, 200);
    response = await fetch(`${base}/auth/me`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(response.status, 401);
  } finally {
    if (userId) db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  }
});

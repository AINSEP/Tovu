import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app.js";

/**
 * @file Route-level proof of REQ-14/AC-18: the `LOGIN_STRICT` profile (10
 * requests/60s per client IP) wired onto `POST /api/admin/v1/auth/login`.
 * Unit coverage for the underlying counter/IP-resolution primitives lives in
 * `middleware/__tests__/rate-limit.test.ts`; this test proves the wiring
 * (route returns 429 in the documented `RATE_LIMIT_EXCEEDED` shape, and
 * under-limit requests are unaffected) against a real HTTP server.
 */

async function bootServer() {
  const server = createServer(createApp());
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function attemptLogin(baseUrl: string) {
  // Deliberately wrong credentials: the limiter must count every attempt
  // (401s included) since it guards against credential brute-forcing, not
  // just successful logins.
  return fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "wrong-password" }),
  });
}

test("AC-18: the first 10 login attempts in a window pass through to credential checking (401, not 429)", async (t) => {
  const { server, baseUrl } = await bootServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  for (let i = 0; i < 10; i++) {
    const res = await attemptLogin(baseUrl);
    assert.equal(res.status, 401, `attempt ${i + 1} should reach credential checking, not the limiter`);
  }
});

test("AC-18: the 11th login attempt within the 60s window is rejected 429 RATE_LIMIT_EXCEEDED with a positive integer details.retryAfterSeconds", async (t) => {
  const { server, baseUrl } = await bootServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  for (let i = 0; i < 10; i++) {
    await attemptLogin(baseUrl);
  }

  const eleventh = await attemptLogin(baseUrl);
  assert.equal(eleventh.status, 429);
  const body = (await eleventh.json()) as { error: string; code: string; details: { retryAfterSeconds: number } };
  assert.equal(body.code, "RATE_LIMIT_EXCEEDED");
  assert.ok(Number.isInteger(body.details.retryAfterSeconds));
  assert.ok(body.details.retryAfterSeconds > 0);
  assert.equal(eleventh.headers.get("retry-after"), String(body.details.retryAfterSeconds));
});

test("AC-18: a rate-limited response never reaches credential checking, even with correct credentials", async (t) => {
  const { server, baseUrl } = await bootServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  for (let i = 0; i < 10; i++) {
    await attemptLogin(baseUrl);
  }

  // Correct credentials on the 11th attempt still get 429 — the limiter runs
  // before `identity.login()`, so it never sets a session cookie either.
  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("set-cookie"), null);
});

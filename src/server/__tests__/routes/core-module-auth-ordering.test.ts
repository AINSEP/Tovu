import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../../app";

/**
 * @file SPEC-039 (ADR-046 Phase 3) — explicit real-HTTP proof of AC-01/AC-02/AC-03.
 *
 * SPEC-031 and SPEC-034 both declined to fold `requireAdminSession`'s `/api/admin` gate mount
 * into `createCoreModule()`, because `registerAuthRoutes` registers the `/api/admin`-prefixed
 * `POST /api/admin/v1/auth/login` route, and Express matches routes/middleware strictly in
 * registration order — if the gate mounted before login registered, login would 401 against its
 * own gate and no session could ever be obtained (total lockout). SPEC-039 folds both concerns
 * into `createCoreModule()` together, in the order that keeps login registered first.
 *
 * This file boots the REAL `createApp()` composition (the same one `server/index.ts` runs, and
 * the one `createCoreModule(routeDeps).registerRoutes?.(app)` is wired into in `app.ts`) — not a
 * hand-assembled mini `express()` app — so this is a direct proof against production wiring, not
 * an isolated unit.
 */

async function bootServer() {
  const server = createServer(createApp(createRouteDeps()));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("AC-01/AC-03: POST /api/admin/v1/auth/login succeeds with valid credentials and ZERO prior session (login is not caught by its own /api/admin gate)", async (t) => {
  const { server, baseUrl } = await bootServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  // No cookie header at all on this request — the exact "zero prior session" scenario AC-03
  // requires. If the gate mounted before login registered, this would 401 UNAUTHENTICATED
  // instead of succeeding, and no Set-Cookie would ever be issued.
  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });

  assert.equal(res.status, 200, "login must succeed, not be caught by its own /api/admin session gate");
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "a successful login must issue a session cookie");
  assert.match(setCookie!, /^tovu_session=/);

  const body = (await res.json()) as { user: { id: string; username: string } };
  assert.equal(body.user.username, "admin");
});

test("AC-02: a gated /api/admin route without a session cookie still returns 401 UNAUTHENTICATED (the gate still mounts and still applies)", async (t) => {
  const { server, baseUrl } = await bootServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/api/admin/v1/auth/me`);
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "UNAUTHENTICATED");
});

test("AC-02: an unrelated gated /api/admin/* admin route (posts list) also 401s without a session cookie", async (t) => {
  const { server, baseUrl } = await bootServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts`);
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "UNAUTHENTICATED");
});

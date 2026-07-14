import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type test from "node:test";

import type express from "express";

/**
 * ADR-042 item 5: the single boot-a-real-http-server-on-a-random-port routine that
 * every `src/server/__tests__/**` route test previously hand-rolled (byte-identical
 * in 10+ files). Registers `t.after` teardown so callers never leak listeners.
 */
export async function startTestServer(
  app: express.Express,
  t: import("node:test").TestContext
): Promise<string> {
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

/** Logs in as the seeded dev owner (`admin`/`tovu-dev`) and returns the session cookie. */
export async function loginAsOwner(baseUrl: string): Promise<string> {
  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/** `startTestServer` + `loginAsOwner`, combined — the common case for admin route tests. */
export async function bootAuthenticated(
  app: express.Express,
  t: import("node:test").TestContext
): Promise<{ baseUrl: string; cookie: string }> {
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsOwner(baseUrl);
  return { baseUrl, cookie };
}

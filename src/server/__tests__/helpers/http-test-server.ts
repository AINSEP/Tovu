import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type test from "node:test";

import type express from "express";

/** The narrow slice `loginAsBarePrincipal` below needs — satisfied structurally by `RouteDeps`
 *  (and by any `Pick<RouteDeps, ...>` narrowing, since every field listed here is also on
 *  `RouteDeps`), so callers pass their real route deps object straight through with no adapter. */
interface BarePrincipalDeps {
  identityReady: Promise<unknown>;
  workspaceId: string;
  clock: { nowIso(): string };
  passwordHasher: { hash(password: string): Promise<string> };
  principalRepo: {
    save(record: {
      id: string;
      workspaceId: string;
      kind: "user";
      displayName: string;
      status: "active";
      createdAt: string;
    }): Promise<unknown>;
  };
  userRepo: {
    save(record: { principalId: string; workspaceId: string; username: string; passwordHash: string }): Promise<unknown>;
  };
}

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

/**
 * Registers a principal with a login but no role/policy grants at all — `authorize()` returns
 * `no_grant` for any permission it is checked against. Proves the denied side of a permission gate
 * with a REAL identity-stack login (real password hash, real session), not a stubbed
 * `res.locals.principal` — the shape integration-tier tests need. At least 25 route test files in
 * this directory already hand-roll a byte-for-byte copy of this exact helper (grep
 * `loginAsBarePrincipal` in `src/server/__tests__/**`); consolidated here for new tests rather than
 * adding a 26th copy — existing copies are left untouched (out of scope for this change).
 */
export async function loginAsBarePrincipal(
  deps: BarePrincipalDeps,
  baseUrl: string,
  options: { username?: string; password?: string } = {}
): Promise<string> {
  await deps.identityReady;
  const username = options.username ?? `bare-principal-${Math.random().toString(36).slice(2, 10)}`;
  const password = options.password ?? "bare-pw";
  const bareId = `bare-${username}`;

  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash(password),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

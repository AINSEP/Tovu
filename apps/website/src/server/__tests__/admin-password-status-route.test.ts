import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, startTestServer } from "./helpers/http-test-server.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { identityReposFrom } from "../inbound/admin-http/routes/users/deps.js";
import { resetUserPassword } from "@jini-ai/cms/identity";
import type { RouteDeps } from "../routes/types.js";

/**
 * @file Route-level tests for `GET /api/admin/v1/auth/me/password-status` (password-banner plan,
 * Slice 2). Modeled on `admin-boot-session-route.test.ts`'s app/deps setup: a real composition-root
 * `RouteDeps` (real db, real argon2id hasher), booted as a real HTTP server, exercised only through
 * `fetch()` — no handler is invoked directly and no hash is asserted, only the boolean the route is
 * documented to return.
 */

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  return { app, deps };
}

test("password-status: unauthenticated gets the exact documented 401 body", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/auth/me/password-status`);

  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "unauthenticated", code: "UNAUTHENTICATED" });
});

test("password-status: the seeded owner still on tovu-dev reads true", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/auth/me/password-status`, { headers: { cookie } });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usesDefaultPassword: true });
});

test("password-status: the response body's keys are exactly [\"usesDefaultPassword\"]", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/auth/me/password-status`, { headers: { cookie } });
  const body = await res.json();

  assert.deepEqual(Object.keys(body as object), ["usesDefaultPassword"]);
});

test("password-status: after resetUserPassword to another value, a fresh sign-in reads false", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  await deps.identityReady;
  const ownerId = await deps.ownerPrincipalId;

  await resetUserPassword({
    deps: { repos: identityReposFrom(deps), hasher: deps.passwordHasher, clock: deps.clock, idGen: deps.idGen },
    input: {
      workspaceId: deps.workspaceId,
      callerPrincipalId: ownerId,
      principalId: ownerId,
      password: "a-strong-non-default-password",
      seededOwnerPrincipalId: ownerId,
    },
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "a-strong-non-default-password" }),
  });
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  const res = await fetch(`${baseUrl}/api/admin/v1/auth/me/password-status`, { headers: { cookie } });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usesDefaultPassword: false });
});

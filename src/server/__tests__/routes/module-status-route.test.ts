import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import { setReadinessSnapshot } from "../../readiness-state.js";
import type { RouteDeps } from "../../routes/types.js";
import type { BootResult } from "../../boot-lifecycle.js";

/**
 * @file SPEC-030 (ADR-046 Phase 2 REQ-10) — `GET /api/admin/v1/workspaces/:workspaceId/system/module-status`.
 * Mirrors `admin-media-routes.test.ts`'s bare-principal-vs-owner pattern for proving both sides
 * of a permission gate.
 */

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-module-status";
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
    username: "bare-module-status",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-module-status", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("module-status: an unauthorized principal (no grants) gets 403", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t); // boots the server; cookie unused here
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/module-status`, {
    headers: { cookie },
  });
  assert.equal(res.status, 403);
});

test("module-status: the seeded owner (wildcard grant) gets 200 with the full module list", async (t) => {
  const knownResult: BootResult = {
    ok: true,
    modules: [
      { name: "settings", owner: "features/settings", criticality: "critical", lifecycle: { status: "ready" } },
      { name: "newsletter", owner: "newsletter", criticality: "optional", lifecycle: { status: "failed", reasonCode: "boom", remediationHint: "check logs" } },
    ],
  };
  setReadinessSnapshot(knownResult);

  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/module-status`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), knownResult);
});

test("module-status: reports 503 (not 200) when the snapshot's ok is false, same body as always", async (t) => {
  // Mirrors `/readyz`'s own mapping — a CRITICAL module actually failing to boot is a real failure
  // state a monitoring probe must be able to see from the status code alone, not just from reading
  // the JSON body. Regression for the route unconditionally returning 200 regardless of `ok`.
  const knownResult: BootResult = {
    ok: false,
    modules: [
      { name: "settings", owner: "features/settings", criticality: "critical", lifecycle: { status: "failed", reasonCode: "boom", remediationHint: "check logs" } },
    ],
  };
  setReadinessSnapshot(knownResult);

  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/module-status`, {
    headers: { cookie },
  });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), knownResult);
});

test("module-status: a mismatched workspaceId in the URL 404s", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/system/module-status`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
});

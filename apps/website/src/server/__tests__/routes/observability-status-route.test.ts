import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Observability admin page, Overview tab —
 * `GET /api/admin/v1/workspaces/:workspaceId/system/observability-status`. Mirrors
 * `module-status-route.test.ts`'s bare-principal-vs-owner pattern for proving both sides of the
 * permission gate, plus the workspace-id-mismatch 404 every sibling route in this directory tests.
 *
 * The enabled/disabled DECISION itself (`resolveObservabilityConfig`) is already unit-tested with
 * an injectable env (`platform/observability/__tests__/unit/config.unit.test.ts`) — this file only
 * proves the route wires that existing, pure function through correctly for the hermetic
 * composition root's real environment, which never sets an OTLP endpoint (`app.ts`'s
 * `createRouteDeps` always uses the noop observability port, per project convention).
 */

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-observability-status";
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
    username: "bare-observability-status",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-observability-status", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("observability-status: an unauthorized principal (no grants) gets 403", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t); // boots the server; cookie unused here
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/observability-status`, {
    headers: { cookie },
  });
  assert.equal(res.status, 403);
});

test("observability-status: the seeded owner (wildcard grant) gets 200, disabled by default", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/observability-status`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { enabled: false, serviceName: null });
});

test("observability-status: a mismatched workspaceId in the URL 404s", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/system/observability-status`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
});

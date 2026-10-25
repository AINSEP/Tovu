import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";
import { createNoopObservabilityPort } from "#src/platform/observability/index";

/**
 * @file Observability admin page, Overview tab —
 * `GET /api/admin/v1/workspaces/:workspaceId/system/observability-status`. Mirrors
 * `module-status-route.test.ts`'s bare-principal-vs-owner pattern for proving both sides of the
 * permission gate, plus the workspace-id-mismatch 404 every sibling route in this directory tests.
 *
 * The enabled/disabled DECISION itself is provider-plugin selection
 * (`server/runtime/composition/provider-plugins.ts`, unit-tested with fakes) — this file proves the
 * route reports whether `RouteDeps.observability` is the noop (`app.ts`'s hermetic `createRouteDeps`
 * always uses it) or a configured provider's port, and never an endpoint or credential.
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
    passwordHash: await deps.passwordHasher.hash({ password: "bare-pw" }),
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
  const deps: ReturnType<typeof createRouteDeps> = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t); // boots the server; cookie unused here
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/observability-status`, {
    headers: { cookie },
  });
  assert.equal(res.status, 403);
});

test("observability-status: the seeded owner (wildcard grant) gets 200, disabled by default", async (t) => {
  const deps: ReturnType<typeof createRouteDeps> = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/observability-status`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { enabled: false, serviceName: null });
});

test("observability-status: a mismatched workspaceId in the URL 404s", async (t) => {
  const deps: ReturnType<typeof createRouteDeps> = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/system/observability-status`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
});

test("observability-status: a configured provider port reports enabled under the fixed service name, never its endpoint or credential", async (t) => {
  const noop = createNoopObservabilityPort({});
  // A non-noop port, as a configured provider plugin would supply; no vendor and no env involved.
  const deps = { ...createRouteDeps(), observability: { ...noop } };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/observability-status`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { enabled: true, serviceName: "tovu" });
});

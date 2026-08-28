import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import { clearAssistantDaemonFailure, recordAssistantDaemonFailure } from "../../readiness-state.js";
import { defaultContentDbPath, mediaUploadsDir } from "../../runtime/composition/deps.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Admin Deployment panel → Overview tab — `GET /api/admin/v1/workspaces/:workspaceId/
 * system/deployment-overview`. Mirrors `module-status-route.test.ts`'s bare-principal-vs-owner
 * shape for proving both sides of the `system.read` gate, plus the workspace-id 404 check every
 * route in this directory shares.
 */

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-deployment-overview";
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
    username: "bare-deployment-overview",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-deployment-overview", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("deployment-overview: an unauthorized principal (no grants) gets 403", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/deployment-overview`, {
    headers: { cookie },
  });
  assert.equal(res.status, 403);
});

test("deployment-overview: a mismatched workspaceId in the URL 404s", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/system/deployment-overview`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
});

test("deployment-overview: the seeded owner gets 200 with real process/env-derived fields, never a fabricated value", async (t) => {
  const previousPassword = process.env.TOVU_ADMIN_PASSWORD;
  const previousDaemonPort = process.env.JINI_AGENT_DAEMON_PORT;
  // Deliberately unset both: proves the response reports the REAL current process state rather
  // than always claiming "set".
  delete process.env.TOVU_ADMIN_PASSWORD;
  delete process.env.JINI_AGENT_DAEMON_PORT;
  clearAssistantDaemonFailure();

  t.after(() => {
    if (previousPassword === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
    else process.env.TOVU_ADMIN_PASSWORD = previousPassword;
    if (previousDaemonPort === undefined) delete process.env.JINI_AGENT_DAEMON_PORT;
    else process.env.JINI_AGENT_DAEMON_PORT = previousDaemonPort;
  });

  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/deployment-overview`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = await res.json();

  // `TOVU_RUNTIME_MODE` is never set in this test process, so `resolveRuntimeMode()` — the ONLY
  // source `core/runtime-mode.ts` ever consults — resolves "local", and the gate never ran.
  assert.equal(body.mode, "local");
  assert.deepEqual(body.productionReadinessGate, { applicable: false, passed: false });
  // No `TOVU_ADMIN_PASSWORD` set above means the seeded owner is still on the literal default —
  // the exact boolean `index.ts`'s own boot gate would compute.
  assert.equal(body.defaultOwnerPasswordUnsafe, true);
  assert.equal(body.daemonKnownFailed, false);
  // Real filesystem paths this SAME process would actually use — not placeholders.
  assert.equal(body.dbPath, defaultContentDbPath());
  assert.equal(body.uploadsDir, mediaUploadsDir());
  assert.deepEqual(body.envVars, [
    { name: "TOVU_ADMIN_PASSWORD", set: false },
    { name: "TOVU_ADMIN_USER", set: Boolean(process.env.TOVU_ADMIN_USER) },
    { name: "TOVU_INTEGRATIONS_ROOT_KEY", set: Boolean(process.env.TOVU_INTEGRATIONS_ROOT_KEY) },
    { name: "JINI_AGENT_DAEMON_PORT", set: false },
  ]);
  // Never echoes a secret VALUE — only ever "set"/"not set" markers, matching every field name
  // above being paired with a boolean, never a string that could carry the real value.
  assert.equal(typeof body.envVars[0].set, "boolean");
});

test("deployment-overview: reports a known agent-daemon failure, latched from outside runBootLifecycle", async (t) => {
  recordAssistantDaemonFailure("boom");
  t.after(() => clearAssistantDaemonFailure());

  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/deployment-overview`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.daemonKnownFailed, true);
});

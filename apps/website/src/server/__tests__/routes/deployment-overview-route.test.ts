import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import { clearAssistantDaemonFailure, recordAssistantDaemonFailure } from "../../runtime/lifecycle/readiness-state.js";
import { defaultContentDbPath, mediaUploadsDir } from "../../runtime/composition/deps.js";
import type { RouteDeps } from "../../routes/types.js";
import { inspectRootKeyMaterial } from "../../../features/webhooks/keyring.env.js";

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
  // No `TOVU_ADMIN_PASSWORD` set above means the owner was seeded with the literal default, and the
  // route reads that from the stored hash.
  assert.equal(body.defaultOwnerPasswordUnsafe, true);
  assert.equal(body.daemonKnownFailed, false);
  // Real filesystem paths this SAME process would actually use — not placeholders.
  assert.equal(body.dbPath, defaultContentDbPath());
  assert.equal(body.uploadsDir, mediaUploadsDir());
  const rootKey = inspectRootKeyMaterial();
  assert.deepEqual(body.envVars, [
    { name: "TOVU_ADMIN_PASSWORD", set: false },
    { name: "TOVU_ADMIN_USER", set: Boolean(process.env.TOVU_ADMIN_USER) },
    {
      name: "TOVU_INTEGRATIONS_ROOT_KEY",
      set: rootKey.active,
      source: rootKey.source,
      ...(rootKey.invalid ? { invalid: true } : {}),
    },
    { name: "JINI_AGENT_DAEMON_PORT", set: false },
  ]);
  // Never echoes a secret VALUE — only ever "set"/"not set" markers, matching every field name
  // above being paired with a boolean, never a string that could carry the real value.
  assert.equal(typeof body.envVars[0].set, "boolean");
});

/** Sets `TOVU_ADMIN_PASSWORD` for one test only, restoring the previous value (or its absence) after. */
function withAdminPasswordEnv(t: { after(fn: () => void): void }, value: string | undefined): void {
  const previous = process.env.TOVU_ADMIN_PASSWORD;
  if (value === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
  else process.env.TOVU_ADMIN_PASSWORD = value;
  t.after(() => {
    if (previous === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
    else process.env.TOVU_ADMIN_PASSWORD = previous;
  });
}

/** Logs in as the seeded owner (on the default password), runs `afterLogin`, then reads the overview. */
async function fetchOverview(
  deps: RouteDeps,
  t: Parameters<typeof bootAuthenticated>[1],
  afterLogin: () => Promise<void> = async () => {}
): Promise<{ defaultOwnerPasswordUnsafe: boolean }> {
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await afterLogin();
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/deployment-overview`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  return res.json();
}

// LAN-bind review (2026-09-23): the desktop now puts a random TOVU_ADMIN_PASSWORD into every spawn,
// but a site it created BEFORE that fix was seeded with the default and keeps it (seeding never
// rotates an existing owner). An env-only check reported that site as "Changed from the default."
test("deployment-overview: an owner still on the default password is unsafe even when TOVU_ADMIN_PASSWORD now holds something else", async (t) => {
  withAdminPasswordEnv(t, undefined);
  const deps: RouteDeps = { ...createRouteDeps() };
  await deps.identityReady;
  process.env.TOVU_ADMIN_PASSWORD = "a-random-password-set-after-the-owner-was-seeded";

  const body = await fetchOverview(deps, t);
  assert.equal(body.defaultOwnerPasswordUnsafe, true);
});

test("deployment-overview: an owner whose stored password is no longer the default is safe even with TOVU_ADMIN_PASSWORD unset", async (t) => {
  withAdminPasswordEnv(t, undefined);
  const deps: RouteDeps = { ...createRouteDeps() };
  const body = await fetchOverview(deps, t, async () => {
    const ownerPrincipalId = await deps.ownerPrincipalId;
    const owner = await deps.userRepo.findByPrincipalId({ workspaceId: deps.workspaceId, principalId: ownerPrincipalId });
    assert.ok(owner);
    await deps.userRepo.save({ ...owner, passwordHash: await deps.passwordHasher.hash("changed-in-the-admin-ui") });
  });
  assert.equal(body.defaultOwnerPasswordUnsafe, false);
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

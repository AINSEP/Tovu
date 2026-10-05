import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";
import type { AdminAssistantDaemonDeps } from "../../inbound/admin-http/routes/system/assistant-daemon.js";

/**
 * @file Admin "Restart assistant" action — `POST /api/admin/v1/workspaces/:workspaceId/system/
 * assistant-daemon/restart` (`routes/admin/system/assistant-daemon.ts`). Mirrors
 * `module-status-route.test.ts`'s bare-principal-vs-owner shape for proving the permission gate,
 * plus the workspace-id 404 check every route in this directory shares.
 *
 * The `{ok: true}` and refused-`{ok: false, reason}` response branches are proven by injecting
 * `restartAssistantDaemon` (this route's one DI seam — see its own doc) rather than driving the
 * REAL `daemon-supervisor.ts` singleton: that singleton only answers `{ok: true}` once a real OS
 * process has been spawned this boot (`startAssistantDaemon()`), which a route-level test has no
 * business doing. The one test that DOES call the real function proves the route still behaves
 * correctly against its actual default-boot answer (never started this process boot → refused).
 */

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string, permissions: readonly string[] = []): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-assistant-daemon-restart";
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
    username: "bare-assistant-daemon-restart",
    passwordHash: await deps.passwordHasher.hash({ password: "bare-pw" }),
  });

  const policyId = "restart-policy";
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: policyId, isBuiltin: false, isFrozen: false });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({ id: `restart-${permission}`, workspaceId: deps.workspaceId, policyId, permission, resourceType: null, constraintJson: null });
  }
  await deps.principalPolicyRepo.save({ id: "restart-policy-link", workspaceId: deps.workspaceId, principalId: bareId, policyId });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-assistant-daemon-restart", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("assistant-daemon restart: an unauthorized principal (no grants) gets 403", async (t) => {
  let restarts = 0;
  const deps: ReturnType<typeof createRouteDeps> & AdminAssistantDaemonDeps = { ...createRouteDeps(), restartAssistantDaemon: () => { restarts++; return { ok: true }; } };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t); // boots the server; cookie unused here
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/assistant-daemon/restart`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).details.permission, "system.write");
  assert.equal(restarts, 0);
});

for (const permission of ["system.read", "system.write"]) {
  test(`assistant-daemon restart: a ${permission}-only principal ${permission === "system.read" ? "is denied without restarting" : "can restart"}`, async (t) => {
    let restarts = 0;
    const deps: ReturnType<typeof createRouteDeps> & AdminAssistantDaemonDeps = { ...createRouteDeps(), restartAssistantDaemon: () => { restarts++; return { ok: true }; } };
    const { baseUrl } = await bootAuthenticated(createApp(deps), t);
    const cookie = await loginAsBarePrincipal(deps, baseUrl, [permission]);
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/assistant-daemon/restart`, {
      method: "POST", headers: { cookie },
    });
    if (permission === "system.read") {
      assert.equal(res.status, 403);
      assert.equal((await res.json()).details.permission, "system.write");
      assert.equal(restarts, 0);
    } else {
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(restarts, 1);
    }
  });
}

test("assistant-daemon restart: a mismatched workspaceId in the URL 404s", async (t) => {
  const deps: ReturnType<typeof createRouteDeps> = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/system/assistant-daemon/restart`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 404);
});

test("assistant-daemon restart: no cookie at all gets 401, not a restart attempt", async (t) => {
  const deps: ReturnType<typeof createRouteDeps> = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/assistant-daemon/restart`, {
    method: "POST",
  });
  assert.equal(res.status, 401);
});

test("assistant-daemon restart: the seeded owner (wildcard grant) against the REAL daemon-supervisor singleton, never started this test process, gets the actual refused answer relayed as 409", async (t) => {
  // No `startAssistantDaemon()` call anywhere in this test file (or in `createRouteDeps()`), so
  // `daemon-supervisor.ts`'s singleton is genuinely undefined here — this is the real answer a
  // fresh admin API process gives before `index.ts` has spawned a daemon, not a fabricated one.
  const deps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/assistant-daemon/restart`, {
    method: "POST",
    headers: { cookie },
  });

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), {
    ok: false,
    reason: "the assistant daemon was never started this process boot",
    code: "ASSISTANT_DAEMON_RESTART_REFUSED",
  });
});

test("assistant-daemon restart: an accepted restart answers 200 {ok:true}, never claiming health", async (t) => {
  const deps = { ...createRouteDeps(), restartAssistantDaemon: () => ({ ok: true }) };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/assistant-daemon/restart`, {
    method: "POST",
    headers: { cookie },
  });

  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(body, { ok: true });
  assert.equal("healthy" in body, false, "the route must never claim health — restartAssistantDaemon() has no health signal to report");
});

test("assistant-daemon restart: a refusal reason (e.g. 'shutting down') is relayed to the caller verbatim, not translated into a generic error", async (t) => {
  const deps = { ...createRouteDeps(), restartAssistantDaemon: () => ({ ok: false, reason: "shutting down" }) };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/assistant-daemon/restart`, {
    method: "POST",
    headers: { cookie },
  });

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), {
    ok: false,
    reason: "shutting down",
    code: "ASSISTANT_DAEMON_RESTART_REFUSED",
  });
});

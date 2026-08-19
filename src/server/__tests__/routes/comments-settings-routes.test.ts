import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file SPEC-035 (ADR-028 Settings Layered Ledger wiring for Comments) — the admin
 * GET/PUT `.../comments/settings` routes, mirroring `comments-e2e.test.ts`'s HTTP-harness
 * pattern. Proves: defaults round-trip through the ledger, a partial PUT patch persists and is
 * reflected by a subsequent GET, an invalid patch 400s without partially writing, and a principal
 * without `comments.configure` is refused.
 */

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-comments-settings";
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
    username: "bare-comments-settings",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-comments-settings", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("GET .../comments/settings returns the pre-ledger defaults once definitions are registered", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/settings`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Record<string, unknown> };
  assert.deepEqual(body.data, {
    enabled: true,
    requireModeration: true,
    maxDepth: 5,
    closeAfterDays: null,
    spamAutoRejectScore: 0.5,
    maxPerIpPerHour: 20,
  });
});

test("PUT .../comments/settings persists a partial patch; a subsequent GET reflects it", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const putRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ requireModeration: false, maxDepth: 2 }),
  });
  assert.equal(putRes.status, 200);
  const putBody = (await putRes.json()) as { data: Record<string, unknown> };
  assert.equal(putBody.data.requireModeration, false);
  assert.equal(putBody.data.maxDepth, 2);

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/settings`, {
    headers: { cookie },
  });
  const getBody = (await getRes.json()) as { data: Record<string, unknown> };
  assert.equal(getBody.data.requireModeration, false);
  assert.equal(getBody.data.maxDepth, 2);
});

test("PUT .../comments/settings 400s on an invalid patch and writes nothing", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const putRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ spamAutoRejectScore: 2.5 }),
  });
  assert.equal(putRes.status, 400);

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/settings`, {
    headers: { cookie },
  });
  const getBody = (await getRes.json()) as { data: Record<string, unknown> };
  assert.equal(getBody.data.spamAutoRejectScore, 0.5, "the invalid patch must not have been written");
});

let grantCounter = 0;

/** Registers a principal holding ONLY the given permission strings. Mirrors
 * `forms-auth.test.ts`'s `loginWithPermissions` pattern. */
async function loginWithPermissions(deps: RouteDeps, baseUrl: string, permissions: readonly string[]): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-comments-settings-${suffix}`;
  const policyId = `grant-policy-comments-settings-${suffix}`;
  const username = `grant-comments-settings-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Grants: ${permissions.join(", ")}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash("grant-pw"),
  });
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: `grant-policy-${suffix}`, isBuiltin: false, isFrozen: false });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({
      id: `grant-pp-${suffix}-${permission}`,
      workspaceId: deps.workspaceId,
      policyId,
      permission,
      resourceType: null,
      constraintJson: null,
    });
  }
  await deps.principalPolicyRepo.save({ id: `grant-link-${suffix}`, workspaceId: deps.workspaceId, principalId, policyId });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "grant-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("round-1 external audit (codex codex-r1-B-001, verified): a principal holding ONLY comments.configure -- not the broader settings.workspace.write -- can actually GET and PUT settings, not just pass the route's own gate", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const leastPrivCookie = await loginWithPermissions(deps, baseUrl, ["comments.configure"]);

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/settings`, {
    headers: { cookie: leastPrivCookie },
  });
  assert.equal(getRes.status, 200, "GET does not write, so it was never blocked by this defect -- included as a control");

  const putRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: leastPrivCookie },
    body: JSON.stringify({ requireModeration: false }),
  });
  assert.equal(
    putRes.status,
    200,
    "comments.configure is the permission the admin UI advertises as sufficient to change Comments settings -- before the fix, the chokepoint's own generic settings.workspace.write check independently rejected this principal, masked as a 500"
  );
  const putBody = (await putRes.json()) as { data: Record<string, unknown> };
  assert.equal(putBody.data.requireModeration, false);
});

test("a principal without comments.configure is refused on both GET and PUT", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/settings`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(getRes.status, 403);

  const putRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(putRes.status, 403);
});

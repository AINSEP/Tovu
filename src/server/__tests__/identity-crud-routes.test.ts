import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../app.js";

/**
 * @file Route-level proof of SPEC-006 0.6.0 (the users/roles/policies CRUD-completion amendment) —
 * AC-27..32. Mirrors `identity-routes.test.ts`'s harness (`bootServer`/`loginAs`) and dev-seed
 * credentials (`admin`/`tovu-dev`, `deps.workspaceId === "workspace-local"`).
 *
 * Domain-level behavior (INV-08 owner-count guard, INV-09 reference guard, INV-07 clamp, etc.) is
 * already exhaustively covered in `identity/__tests__/admin-crud-service.test.ts` — these tests
 * focus on proving each new route is correctly wired (path, auth, status code, response shape),
 * not re-deriving every domain edge case over HTTP.
 */

async function bootServer(deps: ReturnType<typeof createRouteDeps>) {
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function loginAs(baseUrl: string, username: string, password: string) {
  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return { res, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

/**
 * `-p4ssw0rd!` (not `-pw`) is load-bearing, not stylistic: `@jini-ai/cms/identity`'s
 * `password-policy.ts` enforces `MIN_PASSWORD_LENGTH = 12` (ported into Tovu 2026-08-03, commit
 * 7e86dc8b in the Jini repo — this test file predates that port, written 2026-07-21). A `-pw`
 * suffix only clears 12 chars for a username of 9+ letters, which silently passed for "disableme"
 * (9) by coincidence while "enableme"/"updateme" (8) and "resetme" (7) fell short and 400'd before
 * ever returning a `user` body. This suffix is long enough to clear the policy for any short test
 * username used in this file.
 */
async function createTestUser(baseUrl: string, cookie: string, username: string) {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/users`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ username, password: `${username}-p4ssw0rd!` }),
  });
  const body = (await res.json()) as { user: { principalId: string } };
  return body.user.principalId;
}

test("AC-32: DISABLE_PRINCIPAL route disables a non-owner user, and refuses OWNER_REQUIRED for the seeded owner", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const targetId = await createTestUser(baseUrl, cookie, "disableme");

  const disabled = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/users/${targetId}/disable`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(disabled.status, 200);
  const body = (await disabled.json()) as { user: { status: string } };
  assert.equal(body.user.status, "disabled");

  // The seeded owner (whoami) can never be disabled.
  const me = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } });
  const meBody = (await me.json()) as { user: { id: string } };
  const ownerDisable = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/users/${meBody.user.id}/disable`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(ownerDisable.status, 409);
  const ownerBody = (await ownerDisable.json()) as { code?: string };
  assert.equal(ownerBody.code, "OWNER_REQUIRED");
});

test("AC-27: ENABLE_PRINCIPAL route re-activates a disabled user", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const targetId = await createTestUser(baseUrl, cookie, "enableme");
  await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/users/${targetId}/disable`, {
    method: "POST",
    headers: { cookie },
  });

  const enabled = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/users/${targetId}/enable`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(enabled.status, 200);
  const body = (await enabled.json()) as { user: { status: string } };
  assert.equal(body.user.status, "active");
});

test("AC-28: UPDATE_USER route sets email, ignores username/password fields in the body", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const targetId = await createTestUser(baseUrl, cookie, "updateme");

  const updated = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/users/${targetId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ email: "new@example.com", username: "should-be-ignored" }),
  });
  assert.equal(updated.status, 200);
  const body = (await updated.json()) as { user: { email?: string; username: string } };
  assert.equal(body.user.email, "new@example.com");
  assert.equal(body.user.username, "updateme", "username unchanged");
});

test("AC-29: RESET_USER_PASSWORD route returns 204 and the new password authenticates a fresh login", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const targetId = await createTestUser(baseUrl, cookie, "resetme");

  const reset = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/users/${targetId}/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ password: "brand-new-password" }),
  });
  assert.equal(reset.status, 204);

  const { res: freshLogin } = await loginAs(baseUrl, "resetme", "brand-new-password");
  assert.equal(freshLogin.status, 200);

  const { res: staleLogin } = await loginAs(baseUrl, "resetme", "resetme-p4ssw0rd!");
  assert.equal(staleLogin.status, 401);
});

test("AC-30: UPDATE_ROLE and UPDATE_POLICY routes rename a custom role/policy, refuse a built-in target", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");

  const roleCreated = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/roles`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "old-role-name" }),
  });
  const roleBody = (await roleCreated.json()) as { role: { id: string } };

  const roleUpdated = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/roles/${roleBody.role.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "new-role-name" }),
  });
  assert.equal(roleUpdated.status, 200);
  const roleUpdatedBody = (await roleUpdated.json()) as { role: { name: string } };
  assert.equal(roleUpdatedBody.role.name, "new-role-name");

  const rolesList = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/roles`, { headers: { cookie } });
  const rolesListBody = (await rolesList.json()) as { roles: Array<{ id: string; name: string }> };
  const viewerRole = rolesListBody.roles.find((r) => r.name === "viewer");
  const builtinRename = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/roles/${viewerRole!.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "trusted-viewer" }),
  });
  assert.equal(builtinRename.status, 400);

  const policyCreated = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/policies`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "old-policy-name" }),
  });
  const policyBody = (await policyCreated.json()) as { policy: { id: string } };
  const policyUpdated = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${policyBody.policy.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "new-policy-name", description: "updated" }),
  });
  assert.equal(policyUpdated.status, 200);
  const policyUpdatedBody = (await policyUpdated.json()) as { policy: { name: string; description?: string } };
  assert.equal(policyUpdatedBody.policy.name, "new-policy-name");
});

test("AC-31: DELETE_ROLE and DELETE_POLICY routes delete unused rows and refuse still-referenced ones (409)", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");

  const roleCreated = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/roles`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "deletable-role" }),
  });
  const roleBody = (await roleCreated.json()) as { role: { id: string } };
  const roleDeleted = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/roles/${roleBody.role.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(roleDeleted.status, 204);

  const policyCreated = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/policies`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "referenced-policy" }),
  });
  const policyBody = (await policyCreated.json()) as { policy: { id: string } };
  const targetId = await createTestUser(baseUrl, cookie, "policyholder");
  await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/users/${targetId}/policies`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ policyId: policyBody.policy.id }),
  });

  const policyDeleted = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${policyBody.policy.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(policyDeleted.status, 409);
  const policyDeletedBody = (await policyDeleted.json()) as { code?: string };
  assert.equal(policyDeletedBody.code, "RESOURCE_CONFLICT");
});

/**
 * ASSIGN_ROLE (`POST /users/:principalId/roles`, state.spec §3 AC-24/AC-25) had no direct
 * route-level test in this file — every other CRUD route added by SPEC-006 0.6.0 does. Added
 * while cutting `assign-role.ts`'s cyclomatic complexity (98-violation routes sweep,
 * 2026-08-20) so that refactor had a real before/after regression check instead of relying on
 * code review alone.
 */
test("ASSIGN_ROLE route grants a role to a principal and returns the new assignment", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");

  const targetId = await createTestUser(baseUrl, cookie, "roleassignee");
  const rolesList = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/roles`, { headers: { cookie } });
  const rolesListBody = (await rolesList.json()) as { roles: Array<{ id: string; name: string }> };
  const viewerRole = rolesListBody.roles.find((r) => r.name === "viewer");
  assert.ok(viewerRole, "seed created a built-in viewer role");

  const assigned = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/users/${targetId}/roles`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ roleId: viewerRole!.id }),
  });
  assert.equal(assigned.status, 201);
  const assignedBody = (await assigned.json()) as { assignment: { principalId: string; roleId: string } };
  assert.equal(assignedBody.assignment.principalId, targetId);
  assert.equal(assignedBody.assignment.roleId, viewerRole!.id);
});

test("AC-32: WRITE_POLICY_PERMISSION route adds a permission, rejects an unknown one (400 PERMISSION_UNKNOWN)", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const policyCreated = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/policies`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "permission-target" }),
  });
  const policyBody = (await policyCreated.json()) as { policy: { id: string } };

  const written = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${policyBody.policy.id}/permissions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ permission: "content.write" }),
  });
  assert.equal(written.status, 201);

  const unknown = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${policyBody.policy.id}/permissions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ permission: "not.a.permission" }),
  });
  assert.equal(unknown.status, 400);
  const unknownBody = (await unknown.json()) as { code?: string };
  assert.equal(unknownBody.code, "PERMISSION_UNKNOWN");
});

test("AC-01 (route-parity): every new mutating route requires authentication (401)", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const routes: Array<[string, string]> = [
    ["POST", "/api/admin/v1/workspaces/workspace-local/users/some-id/disable"],
    ["POST", "/api/admin/v1/workspaces/workspace-local/users/some-id/enable"],
    ["PATCH", "/api/admin/v1/workspaces/workspace-local/users/some-id"],
    ["POST", "/api/admin/v1/workspaces/workspace-local/users/some-id/reset-password"],
    ["PATCH", "/api/admin/v1/workspaces/workspace-local/roles/some-id"],
    ["DELETE", "/api/admin/v1/workspaces/workspace-local/roles/some-id"],
    ["PATCH", "/api/admin/v1/workspaces/workspace-local/policies/some-id"],
    ["DELETE", "/api/admin/v1/workspaces/workspace-local/policies/some-id"],
    ["POST", "/api/admin/v1/workspaces/workspace-local/policies/some-id/permissions"],
  ];

  for (const [method, path] of routes) {
    const res = await fetch(`${baseUrl}${path}`, { method, headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(res.status, 401, `${method} ${path} should require authentication`);
  }
});

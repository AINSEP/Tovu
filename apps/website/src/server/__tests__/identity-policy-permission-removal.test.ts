import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";

/**
 * @file Route-level proof that a permission can be taken back OFF a policy — the gap
 * `features/roles/Roles.tsx`'s own header comment flagged ("removing a single permission from a
 * policy has no transition (OQ-10) — the only way to shrink a policy's permission set is delete
 * (only when unused) + recreate").
 *
 * Two routes are proven here, because removal is unusable without the first: a GET that lists a
 * policy's own permission rows (nothing exposed one before — `toAdminPolicyResponse` carries no
 * permissions field), and the DELETE that removes one by id.
 *
 * Harness mirrors `identity-crud-routes.test.ts` exactly (`bootServer`/`loginAs`, dev-seed
 * `admin`/`tovu-dev`, `deps.workspaceId === "workspace-local"`).
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

/** Create a custom policy and write one permission onto it; returns both ids. */
async function seedPolicyWithPermission(baseUrl: string, cookie: string, policyName: string, permission: string) {
  const policyCreated = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/policies`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: policyName }),
  });
  assert.equal(policyCreated.status, 201);
  const { policy } = (await policyCreated.json()) as { policy: { id: string } };

  const written = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${policy.id}/permissions`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ permission }),
    }
  );
  assert.equal(written.status, 201);
  const { policyPermission } = (await written.json()) as { policyPermission: { id: string } };

  return { policyId: policy.id, policyPermissionId: policyPermission.id };
}

test("a policy's permissions are listable, and a single one can be removed without touching the rest", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const { policyId, policyPermissionId } = await seedPolicyWithPermission(
    baseUrl,
    cookie,
    "removal-target",
    "content.write"
  );

  // A second permission on the SAME policy — removal must be surgical, not a cascade.
  const second = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${policyId}/permissions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ permission: "content.read" }),
  });
  assert.equal(second.status, 201);

  const listed = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${policyId}/permissions`, {
    headers: { cookie },
  });
  assert.equal(listed.status, 200);
  const listedBody = (await listed.json()) as { policyPermissions: Array<{ id: string; permission: string }> };
  assert.deepEqual(
    listedBody.policyPermissions.map((row) => row.permission).sort(),
    ["content.read", "content.write"]
  );

  const removed = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${policyId}/permissions/${policyPermissionId}`,
    { method: "DELETE", headers: { cookie } }
  );
  assert.equal(removed.status, 204);

  const after = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${policyId}/permissions`, {
    headers: { cookie },
  });
  const afterBody = (await after.json()) as { policyPermissions: Array<{ permission: string }> };
  assert.deepEqual(
    afterBody.policyPermissions.map((row) => row.permission),
    ["content.read"],
    "removing one permission must leave the policy's other permissions intact"
  );
});

test("removing an unknown permission id is a 404 with exact RESOURCE_NOT_FOUND text", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const { policyId } = await seedPolicyWithPermission(baseUrl, cookie, "unknown-perm-target", "content.write");

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${policyId}/permissions/no-such-permission-row`,
    { method: "DELETE", headers: { cookie } }
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error?: string; code?: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
  assert.equal(body.error, "policy permission 'no-such-permission-row' was not found on policy '" + policyId + "'");
});

test("a permission id belonging to a DIFFERENT policy is refused, not silently removed", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const victim = await seedPolicyWithPermission(baseUrl, cookie, "cross-policy-victim", "content.write");
  const attacker = await seedPolicyWithPermission(baseUrl, cookie, "cross-policy-attacker", "content.read");

  // Ask policy B to delete policy A's permission row.
  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${attacker.policyId}/permissions/${victim.policyPermissionId}`,
    { method: "DELETE", headers: { cookie } }
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error?: string; code?: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
  assert.equal(
    body.error,
    `policy permission '${victim.policyPermissionId}' was not found on policy '${attacker.policyId}'`
  );

  // The victim policy still holds its permission — the cross-policy delete was a no-op.
  const listed = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${victim.policyId}/permissions`,
    { headers: { cookie } }
  );
  const listedBody = (await listed.json()) as { policyPermissions: Array<{ permission: string }> };
  assert.deepEqual(listedBody.policyPermissions.map((row) => row.permission), ["content.write"]);
});

test("a built-in policy refuses permission removal with exact VALIDATION_ERROR text", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const policiesRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/policies`, {
    headers: { cookie },
  });
  const { policies } = (await policiesRes.json()) as {
    policies: Array<{ id: string; isBuiltin: boolean; isFrozen: boolean }>;
  };
  const builtin = policies.find((policy) => policy.isBuiltin || policy.isFrozen);
  assert.ok(builtin, "the dev seed must provide at least one built-in/frozen policy for this test");

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/policies/${builtin.id}/permissions/any-row-id`,
    { method: "DELETE", headers: { cookie } }
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error?: string; code?: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.equal(
    body.error,
    "cannot remove a permission from a built-in or frozen policy (INV-06/AC-26)"
  );
});

test("both new policy-permission routes require authentication (401)", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const routes: Array<[string, string]> = [
    ["GET", "/api/admin/v1/workspaces/workspace-local/policies/some-id/permissions"],
    ["DELETE", "/api/admin/v1/workspaces/workspace-local/policies/some-id/permissions/some-perm-id"],
  ];

  for (const [method, path] of routes) {
    const res = await fetch(`${baseUrl}${path}`, { method, headers: { "content-type": "application/json" } });
    assert.equal(res.status, 401, `${method} ${path} should require authentication`);
  }
});

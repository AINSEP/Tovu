import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import {
  InMemoryPolicyPermissionRepo,
  InMemoryPolicyRepo,
  InMemoryPrincipalPolicyRepo,
  InMemoryPrincipalRepo,
  InMemoryPrincipalRoleRepo,
  InMemoryRolePolicyRepo,
  InMemoryRoleRepo,
  InMemorySessionRepo,
  InMemoryUserRepo,
  authorize,
  migrateDeprecatedPermissionGrants,
  seedIdentity,
  type IdentityRepos,
} from "@jini-ai/cms/identity";

import { applyBuiltinRoleGrants } from "#src/features/identity/builtin-role-grants";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminFsFilesCustomRootRoutes, type AdminFsFilesCustomRootDeps } from "../custom-root.js";

/**
 * @file Who may CHANGE the `fs-files` custom root — certified end-to-end through the real route,
 * over a real seeded identity chain, in the seed vintage this repo actually ships.
 *
 * ## Why this test exists in this shape
 *
 * Owner ruling (2026-09-15): owner AND admin may change the folder; reading which folder is set
 * stays on `content.read`. An earlier attempt gated `PUT`/`DELETE` on `workspace.manage` and its own
 * tests were green — because they stubbed `authorize` and asserted the permission STRING the route
 * asks for, never whether any real principal holds it. In `sites/tovu-com/content.db` none does:
 * `admin-builtin-policy` carries 43 permissions and `workspace.manage` is not among them, so that
 * change locked every admin out while proving itself correct.
 *
 * So nothing here stubs `authorize`. The chain is `seedIdentity` -> the same two boot-time
 * reconcilers `features/identity/wiring.ts` runs -> the real `authorize()` -> the real route over a
 * real socket. A gate on a permission the seeded admin policy does not hold fails
 * {@link adminChangesTheRoot} with a 403, which is the only kind of test that catches this class.
 *
 * ## The vintage is the whole point
 *
 * {@link buildChain} seeds a workspace and then REMOVES the three permissions the current library
 * seeds but the shipping database lacks (`features/pages/permissions.ts` documents that database in
 * full: seeded before `theme.edit`, `workspace.manage`, and `admin.assistant.manage` joined the
 * admin seed list, and `seedIdentity` early-returns once an owner user exists, so it can never gain
 * them). A freshly-seeded workspace would hold `workspace.manage` and would therefore pass even
 * against the lockout — certifying a capability every deployed install does not have.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/fs-files/custom-root`;
const PRINCIPAL_HEADER = "x-test-principal";

/**
 * Permissions the CURRENT `@jini-ai/cms` seed grants admin that the shipping workspace never got.
 * Spelled as literals: they are `policy_permissions` row values owned by the library, and the point
 * of the fixture is to reproduce their ABSENCE.
 */
const ABSENT_IN_SHIPPING_WORKSPACE = ["theme.edit", "workspace.manage", "admin.assistant.manage"];

const clock = { nowIso: () => "2026-09-15T00:00:00.000Z" };

function counterIdGen(prefix: string) {
  let n = 0;
  return { newId: () => `${prefix}-${++n}` };
}

/** argon2id is ~100ms per hash and this file never verifies a password — the seed only needs SOME
 *  hasher to satisfy the port (same shortcut `pages/__tests__/edit-html-permission.test.ts` takes). */
const fakeHasher = {
  hash: async (password: string) => `hashed:${password}`,
  verify: async (hash: string, password: string) => hash === `hashed:${password}`,
};

type RoleName = "owner" | "admin" | "editor" | "viewer";

interface Chain {
  readonly repos: IdentityRepos;
  readonly principals: Record<RoleName, string>;
  can(principalId: string, permission: string): Promise<{ allowed: boolean; reason: string }>;
}

/**
 * Seed a workspace, rewind it to the shipping vintage, run both boot-time reconcilers exactly as
 * `features/identity/wiring.ts` does, and mint one principal per built-in role.
 *
 * @complexity O(r) in the built-in role count — four roles, one seed.
 */
async function buildChain(): Promise<Chain> {
  const repos: IdentityRepos = {
    principals: new InMemoryPrincipalRepo(),
    users: new InMemoryUserRepo(),
    sessions: new InMemorySessionRepo(),
    roles: new InMemoryRoleRepo(),
    policies: new InMemoryPolicyRepo(),
    policyPermissions: new InMemoryPolicyPermissionRepo(),
    rolePolicies: new InMemoryRolePolicyRepo(),
    principalRoles: new InMemoryPrincipalRoleRepo(),
    principalPolicies: new InMemoryPrincipalPolicyRepo(),
  };

  await seedIdentity({
    deps: { repos, hasher: fakeHasher, clock, idGen: counterIdGen("seed") },
    input: { workspaceId: WORKSPACE_ID, ownerUsername: "owner-under-test", ownerPassword: "irrelevant" },
  });

  await rewindAdminToShippingVintage(repos);

  await migrateDeprecatedPermissionGrants({
    policyPermissions: repos.policyPermissions,
    policies: repos.policies,
    idGen: counterIdGen("mig"),
    workspaceId: WORKSPACE_ID,
  });
  await applyBuiltinRoleGrants({
    roles: repos.roles,
    rolePolicies: repos.rolePolicies,
    policies: repos.policies,
    policyPermissions: repos.policyPermissions,
    idGen: counterIdGen("backfill"),
    workspaceId: WORKSPACE_ID,
  });

  const roles = await repos.roles.list({ workspaceId: WORKSPACE_ID });
  const principals = {} as Chain["principals"];
  for (const name of ["owner", "admin", "editor", "viewer"] as const) {
    const role = roles.find((row) => row.name === name);
    assert.ok(role, `the built-in '${name}' role must exist after seeding`);

    const principalId = `principal-${name}`;
    await repos.principals.save({
      id: principalId,
      workspaceId: WORKSPACE_ID,
      kind: "user",
      displayName: name,
      status: "active",
      createdAt: clock.nowIso(),
    });
    await repos.principalRoles.save({ id: `pr-${name}`, workspaceId: WORKSPACE_ID, principalId, roleId: role.id });
    principals[name] = principalId;
  }

  const can = (principalId: string, permission: string) =>
    authorize({
      deps: {
        principals: repos.principals,
        principalRoles: repos.principalRoles,
        rolePolicies: repos.rolePolicies,
        principalPolicies: repos.principalPolicies,
        policyPermissions: repos.policyPermissions,
      },
      principalId,
      permission,
      context: { workspaceId: WORKSPACE_ID },
    });

  return { repos, principals, can };
}

/**
 * Remove from `admin-builtin-policy` the permissions the shipping workspace never received.
 *
 * Asserts each row was there before removing it, deliberately: if the library's seed list changes,
 * this fixture would otherwise silently stop simulating anything and every case below would start
 * passing for the wrong reason.
 *
 * @complexity O(p) in the admin policy's permission count.
 */
async function rewindAdminToShippingVintage(repos: IdentityRepos): Promise<void> {
  const policy = await repos.policies.findByName({ workspaceId: WORKSPACE_ID, name: "admin-builtin-policy" });
  assert.ok(policy, "seedIdentity must have created the built-in admin policy");

  for (const permission of ABSENT_IN_SHIPPING_WORKSPACE) {
    const held = await repos.policyPermissions.listByPolicyId({ workspaceId: WORKSPACE_ID, policyId: policy.id });
    const row = held.find((entry) => entry.permission === permission);
    assert.ok(row, `the current admin seed list must still contain '${permission}' for this rewind to mean anything`);
    await repos.policyPermissions.delete({ workspaceId: WORKSPACE_ID, id: row.id });
  }
}

/** The real route, mounted over the real `authorize()`, with the acting principal chosen per request
 *  by a header — the same bare-express shape `custom-root.test.ts` uses for its stubbed cases. */
async function mountRoute(chain: Chain, t: Parameters<typeof startTestServer>[1]): Promise<string> {
  const deps: AdminFsFilesCustomRootDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: ((params: { principalId: string; permission: string }) =>
      chain.can(params.principalId, params.permission)) as AdminFsFilesCustomRootDeps["authorize"],
    storeOptional: { siteDir: fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-perm-site-")) },
  };

  const app = express();
  app.use(express.json());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: String(req.header(PRINCIPAL_HEADER) ?? "") };
    next();
  });
  registerAdminFsFilesCustomRootRoutes(app, deps);
  return startTestServer(app, t);
}

function asRole(chain: Chain, role: RoleName): Record<string, string> {
  return { [PRINCIPAL_HEADER]: chain.principals[role], "content-type": "application/json" };
}

// ---------------------------------------------------------------------------
// The grant — the case the `workspace.manage` lockout failed.
// ---------------------------------------------------------------------------

/** Referenced by this file's header. */
const adminChangesTheRoot =
  "an 'admin' in the seed vintage this repo SHIPS can change the custom root — the gate must not be a permission that workspace's policy never got";

test(adminChangesTheRoot, async (t) => {
  const chain = await buildChain();
  const baseUrl = await mountRoute(chain, t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-perm-"));

  // The trap, asserted rather than assumed: in this workspace admin does NOT hold workspace.manage,
  // so a gate on it would 403 here while every stubbed-authorize test stayed green.
  const workspaceManage = await chain.can(chain.principals.admin, "workspace.manage");
  assert.equal(workspaceManage.allowed, false, "sanity: the shipping vintage's admin policy has no workspace.manage row");

  const putRes = await fetch(`${baseUrl}${BASE}`, { method: "PUT", headers: asRole(chain, "admin"), body: JSON.stringify({ path: dir }) });
  assert.equal(putRes.status, 200, "the owner ruling is that admin may change the folder");
  assert.deepEqual(await putRes.json(), { path: fs.realpathSync(dir) });

  const deleteRes = await fetch(`${baseUrl}${BASE}`, { method: "DELETE", headers: asRole(chain, "admin") });
  assert.equal(deleteRes.status, 200, "DELETE is the same capability as PUT and must not diverge from it");
});

test("the 'owner' clears the gate too — on its '*' wildcard, without any row being written to its policy", async (t) => {
  const chain = await buildChain();
  const baseUrl = await mountRoute(chain, t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-perm-"));

  const res = await fetch(`${baseUrl}${BASE}`, { method: "PUT", headers: asRole(chain, "owner"), body: JSON.stringify({ path: dir }) });
  assert.equal(res.status, 200);

  const decision = await chain.can(chain.principals.owner, "fs_files.custom_root.manage");
  // Named explicitly: if this ever read `matched`, the backfill would have started writing rows onto
  // the wildcard policy instead of leaving it alone.
  assert.equal(decision.reason, "owner_wildcard");
});

// ---------------------------------------------------------------------------
// The refusal — the reason the permission was split off content.read at all.
// ---------------------------------------------------------------------------

test("an 'editor' can still SEE which folder is set but can no longer change it", async (t) => {
  const chain = await buildChain();
  const baseUrl = await mountRoute(chain, t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-perm-"));

  const getRes = await fetch(`${baseUrl}${BASE}`, { headers: asRole(chain, "editor") });
  // Without this, the refusal below would also pass for a principal that was never wired up at all.
  // It is what makes the change a NARROWED capability rather than a lockout.
  assert.equal(getRes.status, 200, "reading the configured folder stays on content.read, which an editor holds");

  const putRes = await fetch(`${baseUrl}${BASE}`, { method: "PUT", headers: asRole(chain, "editor"), body: JSON.stringify({ path: dir }) });
  assert.equal(putRes.status, 403, "one PUT can re-point the assistant's whole filesystem surface; content.read must not carry that");

  const deleteRes = await fetch(`${baseUrl}${BASE}`, { method: "DELETE", headers: asRole(chain, "editor") });
  assert.equal(deleteRes.status, 403);
});

test("a 'viewer' is refused both writing verbs", async (t) => {
  const chain = await buildChain();
  const baseUrl = await mountRoute(chain, t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-perm-"));

  const putRes = await fetch(`${baseUrl}${BASE}`, { method: "PUT", headers: asRole(chain, "viewer"), body: JSON.stringify({ path: dir }) });
  assert.equal(putRes.status, 403);

  const deleteRes = await fetch(`${baseUrl}${BASE}`, { method: "DELETE", headers: asRole(chain, "viewer") });
  assert.equal(deleteRes.status, 403);
});

test("the backfill reaches ONLY the admin policy — it never invents rows for editor, viewer, or the permissions this workspace deliberately lacks", async (t) => {
  const chain = await buildChain();
  await mountRoute(chain, t);

  for (const role of ["editor", "viewer"] as const) {
    const decision = await chain.can(chain.principals[role], "fs_files.custom_root.manage");
    assert.equal(decision.allowed, false, `whatever grants admin the capability must not reach the ${role} role`);
    assert.equal(decision.reason, "no_grant");
  }

  const policy = await chain.repos.policies.findByName({ workspaceId: WORKSPACE_ID, name: "admin-builtin-policy" });
  assert.ok(policy);
  const held = (await chain.repos.policyPermissions.listByPolicyId({ workspaceId: WORKSPACE_ID, policyId: policy.id })).map(
    (row) => row.permission,
  );
  assert.ok(held.includes("fs_files.custom_root.manage"), "the one capability under discussion is granted");
  // Restoring any of these to an already-deployed workspace is a separate operator decision — a fix
  // scoped to one folder control must not make it as a side effect.
  for (const permission of ABSENT_IN_SHIPPING_WORKSPACE) {
    assert.ok(!held.includes(permission), `the backfill must not silently restore '${permission}'`);
  }
});

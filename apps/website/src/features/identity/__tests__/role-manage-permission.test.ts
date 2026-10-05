import assert from "node:assert/strict";
import test from "node:test";

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
  createTransactionalInMemoryIdentityRepos,
  migrateDeprecatedPermissionGrants,
  seedIdentity,
} from "@jini-ai/user-management/server";
import { type IdentityRepos } from "@jini-ai/user-management";

import { applyBuiltinRoleGrants } from "../builtin-role-grants.js";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";

/**
 * @file The built-in `admin` role holds `role.manage` after boot reconciliation (owner decision
 * 2026-10-05), on a fresh workspace AND on one seeded before the admin seed list carried it; `editor`
 * and `viewer` never do. Real seed, real migration fan-out, real `applyBuiltinRoleGrants`, real
 * `authorize()`, over in-memory adapters — the same chain `site-key-permission.test.ts` certifies.
 */

const ROLE_MANAGE = "role.manage";
const WORKSPACE = "ws-role-manage";
const clock = { nowIso: () => "2026-10-05T00:00:00.000Z", nowMs: () => Date.parse("2026-10-05T00:00:00.000Z") };
const fakeHasher = {
  hash: async ({ password }: { password: string }) => `hashed:${password}`,
  verify: async ({ hash, password }: { hash: string; password: string }) => hash === `hashed:${password}`,
};

function counterIdGen(prefix: string) {
  let n = 0;
  return { newId: () => `${prefix}-${++n}` };
}

/** `"existing"` rewinds the seeded admin policy to before `role.manage` joined the seed list. */
type Vintage = "fresh" | "existing";

async function buildChain(vintage: Vintage) {
  const repos: IdentityRepos = createTransactionalInMemoryIdentityRepos({ repos: {
    principals: new InMemoryPrincipalRepo({}),
    users: new InMemoryUserRepo({}),
    sessions: new InMemorySessionRepo({}),
    roles: new InMemoryRoleRepo({}),
    policies: new InMemoryPolicyRepo({}),
    policyPermissions: new InMemoryPolicyPermissionRepo({}),
    rolePolicies: new InMemoryRolePolicyRepo({}),
    principalRoles: new InMemoryPrincipalRoleRepo({}),
    principalPolicies: new InMemoryPrincipalPolicyRepo({}),
  } });
  await seedIdentity({ deps: { repos, hasher: fakeHasher, clock, idGen: counterIdGen("seed") }, input: { workspaceId: WORKSPACE, ownerUsername: "owner-under-test", ownerPassword: "irrelevant" } });

  if (vintage === "existing") {
    const policy = await repos.policies.findByName({ workspaceId: WORKSPACE, name: "admin-builtin-policy" });
    assert.ok(policy, "seedIdentity must have created the built-in admin policy");
    const grants = await repos.policyPermissions.listByPolicyId({ workspaceId: WORKSPACE, policyId: policy.id });
    for (const row of grants.filter((grant) => grant.permission === ROLE_MANAGE)) {
      await repos.policyPermissions.delete({ workspaceId: WORKSPACE, id: row.id });
    }
  }

  const registry = createAppPermissionGrants({});
  await migrateDeprecatedPermissionGrants({ migrations: registry.migrations.list({}), transactions: repos.transactions,
    policyPermissions: repos.policyPermissions,
    policies: repos.policies,
    idGen: counterIdGen("mig"),
    workspaceId: WORKSPACE,
  });
  await applyBuiltinRoleGrants({
    grants: registry.roleGrants.list({}),
    roles: repos.roles,
    rolePolicies: repos.rolePolicies,
    policies: repos.policies,
    policyPermissions: repos.policyPermissions,
    idGen: counterIdGen("backfill"),
    workspaceId: WORKSPACE,
  });

  const roles = await repos.roles.list({ workspaceId: WORKSPACE });
  const principals: Record<string, string> = {};
  for (const name of ["admin", "editor", "viewer"]) {
    const role = roles.find((row) => row.name === name);
    assert.ok(role, `the built-in '${name}' role must exist after seeding`);
    principals[name] = `principal-${name}`;
    await repos.principals.save({ id: principals[name], workspaceId: WORKSPACE, kind: "user", displayName: name, status: "active", createdAt: clock.nowIso() });
    await repos.principalRoles.save({ id: `pr-${name}`, workspaceId: WORKSPACE, principalId: principals[name], roleId: role.id });
  }
  const can = async (name: string) => (await authorize({ deps: {
    principals: repos.principals,
    principalRoles: repos.principalRoles,
    rolePolicies: repos.rolePolicies,
    principalPolicies: repos.principalPolicies,
    policyPermissions: repos.policyPermissions,
  }, principalId: principals[name] ?? "", permission: ROLE_MANAGE, context: { workspaceId: WORKSPACE } }, { entityType: "role" })).allowed;
  return { can };
}

for (const vintage of ["fresh", "existing"] as const) {
  test(`a built-in admin holds role.manage after boot reconciliation (${vintage} workspace)`, async () => {
    const { can } = await buildChain(vintage);
    assert.equal(await can("admin"), true);
  });

  test(`editor and viewer never receive role.manage (${vintage} workspace)`, async () => {
    const { can } = await buildChain(vintage);
    assert.equal(await can("editor"), false);
    assert.equal(await can("viewer"), false);
  });
}

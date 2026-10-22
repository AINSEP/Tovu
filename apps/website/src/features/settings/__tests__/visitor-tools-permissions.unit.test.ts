import assert from "node:assert/strict";
import test from "node:test";
import { isKnownPermission, listPermissions } from "@jini-ai/user-management";
import {
  InMemoryPolicyPermissionRepo, InMemoryPolicyRepo, InMemoryPrincipalPolicyRepo, InMemoryPrincipalRepo,
  InMemoryPrincipalRoleRepo, InMemoryRolePolicyRepo, InMemoryRoleRepo, InMemorySessionRepo, InMemoryUserRepo,
  authorize, createTransactionalInMemoryIdentityRepos, seedIdentity,
} from "@jini-ai/user-management/server";
import { applyBuiltinRoleGrants } from "../../identity/builtin-role-grants.js";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";
import { registerVisitorToolsPermissionGrants } from "../visitor-tools-permissions.js";

test("boot reconciles visitor-tools.manage to existing owner/admin policies, idempotently, without granting editor/viewer", async () => {
  const workspaceId = "visitor-permissions";
  let id = 0;
  const idGen = { newId: () => `permission-${++id}` };
  const clock = { nowIso: () => "2026-10-22T00:00:00.000Z", nowMs: () => 0 };
  const repos = createTransactionalInMemoryIdentityRepos({ repos: {
    principals: new InMemoryPrincipalRepo({}), users: new InMemoryUserRepo({}), sessions: new InMemorySessionRepo({}),
    roles: new InMemoryRoleRepo({}), policies: new InMemoryPolicyRepo({}), policyPermissions: new InMemoryPolicyPermissionRepo({}),
    rolePolicies: new InMemoryRolePolicyRepo({}), principalRoles: new InMemoryPrincipalRoleRepo({}), principalPolicies: new InMemoryPrincipalPolicyRepo({}),
  } });
  await seedIdentity({ deps: { repos, clock, idGen, hasher: { hash: async ({ password }) => password, verify: async ({ hash, password }) => hash === password } },
    input: { workspaceId, ownerUsername: "fixture-owner", ownerPassword: "unused-fixture-password" } });
  const roles = await repos.roles.list({ workspaceId });
  // Simulate a workspace seeded before T2, independent of what a later Jini seed might add.
  for (const policy of await repos.policies.list({ workspaceId })) {
    for (const permission of await repos.policyPermissions.listByPolicyId({ workspaceId, policyId: policy.id })) {
      if (permission.permission === "visitor-tools.manage") await repos.policyPermissions.delete({ workspaceId, id: permission.id });
    }
  }
  const registry = createAppPermissionGrants({});
  registerVisitorToolsPermissionGrants({ registry });
  assert.equal(isKnownPermission({ id: "visitor-tools.manage" }), true);
  assert.equal(listPermissions({}).find(p => p.id === "visitor-tools.manage")?.owner, "visitor-tools");
  const grants = registry.roleGrants.list({}).filter(g => g.permission === "visitor-tools.manage");
  assert.deepEqual(grants.map(g => g.role), ["owner", "admin"]);
  const deps = { grants, workspaceId, roles: repos.roles, rolePolicies: repos.rolePolicies, policies: repos.policies, policyPermissions: repos.policyPermissions, idGen };
  assert.equal((await applyBuiltinRoleGrants(deps)).grantedCount, 2);
  assert.equal((await applyBuiltinRoleGrants(deps)).grantedCount, 0);
  for (const name of ["owner", "admin", "editor", "viewer"]) {
    const role = roles.find(r => r.name === name)!;
    const principalId = `user-${name}`;
    await repos.principals.save({ id: principalId, workspaceId, kind: "user", displayName: name, status: "active", createdAt: clock.nowIso() });
    await repos.principalRoles.save({ id: `membership-${name}`, workspaceId, principalId, roleId: role.id });
    const result = await authorize({ deps: { principals: repos.principals, principalRoles: repos.principalRoles,
      rolePolicies: repos.rolePolicies, principalPolicies: repos.principalPolicies, policyPermissions: repos.policyPermissions },
      principalId, permission: "visitor-tools.manage", context: { workspaceId } }, { entityType: "visitor-tools" });
    assert.equal(result.allowed, ["owner", "admin"].includes(name));
  }
});

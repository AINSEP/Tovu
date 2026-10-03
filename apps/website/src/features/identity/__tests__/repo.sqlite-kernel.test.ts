import assert from "node:assert/strict";
import test from "node:test";

import { authorize } from "@jini-ai/user-management/server";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createIdentityTransactions } from "../repo.js";
import { SqlitePrincipalRepo, SqliteUserRepo, SqliteSessionRepo, SqliteRoleRepo, SqlitePolicyRepo, SqlitePolicyPermissionRepo, SqlitePrincipalPolicyRepo, SqlitePrincipalRoleRepo, SqliteRolePolicyRepo } from "../repo.sqlite.js";

for (const mode of ["handle", "kernel"] as const) {
  // REGRESSION: fails if createIdentityTransactions executes outside the repositories' kernel transaction.
  test(`identity ${mode} transaction rolls back repository writes on rejection`, async (t) => {
    const db = openContentDb(":memory:");
    t.after(() => db.$client.close());
    const kernel = contentKernel(db);
    const repo = new SqliteRoleRepo(mode === "handle" ? db : kernel);
    const transactions = createIdentityTransactions({ kernel });
    await assert.rejects(transactions.run({ workspaceId: "ws-rollback", execute: async () => {
      await repo.save({ id: "rolled-back", workspaceId: "ws-rollback", name: "temporary", isBuiltin: false });
      throw new Error("rollback probe");
    } }), /rollback probe/);
    assert.equal(await repo.findById({ workspaceId: "ws-rollback", id: "rolled-back" }), null);
    assert.deepEqual(await kernel.run((query) => query.selectFrom("roles").selectAll().where("workspace_id", "=", "ws-rollback").execute()), []);
  });

  test(`identity adapters on a supplied ${mode} persist a session and both direct and role authority in that database`, async (t) => {
    // F2.6/F6.4: a wrapper using a different store must fail independent SQL and real authorization.
    const db = openContentDb(":memory:");
    t.after(() => db.$client.close());
    const kernel = contentKernel(db);
    const store = mode === "handle" ? db : kernel;
    const repos = {
      principals: new SqlitePrincipalRepo(store), users: new SqliteUserRepo(store), sessions: new SqliteSessionRepo(store),
      roles: new SqliteRoleRepo(store), policies: new SqlitePolicyRepo(store), policyPermissions: new SqlitePolicyPermissionRepo(store),
      principalPolicies: new SqlitePrincipalPolicyRepo(store), principalRoles: new SqlitePrincipalRoleRepo(store), rolePolicies: new SqliteRolePolicyRepo(store),
    };
    const principal = { id: "reader", workspaceId: "ws-b08", kind: "user" as const, displayName: "Reader", status: "active" as const, createdAt: "2026-10-01T12:00:00Z" };
    await repos.principals.save(principal);
    await repos.users.save({ workspaceId: "ws-b08", principalId: "reader", username: "ada", passwordHash: "stored-hash", email: "ada@example.com" });
    await repos.sessions.save({ id: "session", workspaceId: "ws-b08", principalId: "reader", tokenHash: "session-hash", createdAt: "2026-10-01T12:00:00Z", expiresAt: "2026-10-02T12:00:00Z" });
    await repos.roles.save({ id: "editor", workspaceId: "ws-b08", name: "editor", isBuiltin: false });
    for (const id of ["direct-policy", "role-policy"]) await repos.policies.save({ id, workspaceId: "ws-b08", name: id, isBuiltin: false, isFrozen: false });
    await repos.policyPermissions.save({ id: "read", workspaceId: "ws-b08", policyId: "direct-policy", permission: "content.read", resourceType: null, constraintJson: null });
    await repos.policyPermissions.save({ id: "edit", workspaceId: "ws-b08", policyId: "role-policy", permission: "content.edit", resourceType: "post", constraintJson: null });
    await repos.principalPolicies.save({ id: "direct", workspaceId: "ws-b08", principalId: "reader", policyId: "direct-policy" });
    await repos.principalRoles.save({ id: "role", workspaceId: "ws-b08", principalId: "reader", roleId: "editor" });
    await repos.rolePolicies.save({ id: "role-link", workspaceId: "ws-b08", roleId: "editor", policyId: "role-policy" });
    assert.deepEqual(await kernel.run((q) => q.selectFrom("identity_users").select(["principal_id", "username", "password_hash", "email"]).execute()), [{ principal_id: "reader", username: "ada", password_hash: "stored-hash", email: "ada@example.com" }]);
    assert.deepEqual(await repos.principals.findById({ workspaceId: "ws-b08", id: "reader" }), { ...principal, disabledAt: undefined });
    assert.equal((await repos.sessions.findByTokenHash({ workspaceId: "ws-b08", tokenHash: "session-hash" }))?.principalId, "reader");
    for (const [permission, entityType, expected] of [
      ["content.read", "page", { allowed: true, reason: "matched" }],
      ["content.edit", "post", { allowed: true, reason: "matched" }],
      ["content.edit", "page", { allowed: false, reason: "resource_scope_mismatch" }],
      ["content.delete", "post", { allowed: false, reason: "no_grant" }],
    ] as const) {
      assert.deepEqual(await authorize({ deps: repos, principalId: "reader", permission, context: { workspaceId: "ws-b08" } }, { entityType }), expected);
    }
    assert.deepEqual(await authorize({ deps: repos, principalId: "reader", permission: "content.read", context: { workspaceId: "other" } }), { allowed: false, reason: "principal_disabled" });
  });
}

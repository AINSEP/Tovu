import assert from "node:assert/strict";
import test from "node:test";

import { authorize } from "../authorize";
import {
  listPermissionMigrations,
  migrateDeprecatedPermissionGrants,
  registerPermissionMigration,
} from "../permission-migrations";
import { NAVIGATION_PERMISSIONS } from "../../navigation/contracts";
import {
  InMemoryPolicyPermissionRepo,
  InMemoryPolicyRepo,
  InMemoryPrincipalPolicyRepo,
  InMemoryPrincipalRepo,
  InMemoryPrincipalRoleRepo,
  InMemoryRolePolicyRepo,
  InMemoryRoleRepo,
} from "../repo.memory";

/**
 * @file Dedicated TDD-first tests for the shared deprecate-old/grant-new
 * permission migration mechanism (ADR-PIPE-012 C-001/C-002, T004/T005).
 *
 * This is the highest-aggregate-risk contract in the Menus remediation
 * (security axis 3/5 in ADR-PIPE-012's Quality Attribute Scorecard) — a bug
 * here could fail-open or fail-closed-lockout across up to four sibling
 * features (Menus/Members/Analytics/Integrations) at once. Certified here,
 * in isolation, against a real `PolicyPermissionRepoPort`/`PolicyRepoPort`
 * fixture (the in-memory adapters — real implementations, not mocks, per
 * Article V/the identity test suite's own established convention, e.g.
 * `seed.test.ts`), before Programmer wires it into any live boot path.
 */

const WORKSPACE = "workspace-1";

function counterIdGen(prefix = "id") {
  let n = 0;
  return { newId: () => `${prefix}-${++n}` };
}

// ---------------------------------------------------------------------------
// T004: registerPermissionMigration / listPermissionMigrations (pure registry)
// ---------------------------------------------------------------------------

test("C-001: registerPermissionMigration registers a {from, to, reason} pair; listPermissionMigrations returns it", () => {
  registerPermissionMigration({
    from: "test.legacy.perm-a",
    to: ["test.new.perm-a1", "test.new.perm-a2"],
    reason: "test migration A",
  });
  registerPermissionMigration({
    from: "test.legacy.perm-b",
    to: ["test.new.perm-b1"],
    reason: "test migration B",
  });

  const all = listPermissionMigrations();
  const a = all.find((m) => m.from === "test.legacy.perm-a");
  const b = all.find((m) => m.from === "test.legacy.perm-b");

  assert.ok(a, "migration A was registered");
  assert.deepEqual(a?.to, ["test.new.perm-a1", "test.new.perm-a2"]);
  assert.equal(a?.reason, "test migration A");

  assert.ok(b, "migration B was registered");
  assert.deepEqual(b?.to, ["test.new.perm-b1"]);
});

test("C-001: re-registering the same `from` overwrites rather than duplicates (idempotent re-registration, matches PermissionCatalog.register)", () => {
  registerPermissionMigration({
    from: "test.legacy.perm-overwrite",
    to: ["test.new.perm-v1"],
    reason: "first registration",
  });
  registerPermissionMigration({
    from: "test.legacy.perm-overwrite",
    to: ["test.new.perm-v2a", "test.new.perm-v2b"],
    reason: "second registration supersedes the first",
  });

  const matches = listPermissionMigrations().filter((m) => m.from === "test.legacy.perm-overwrite");
  assert.equal(matches.length, 1, "exactly one entry exists for this `from`, not two");
  assert.deepEqual(matches[0].to, ["test.new.perm-v2a", "test.new.perm-v2b"]);
  assert.equal(matches[0].reason, "second registration supersedes the first");
});

// ---------------------------------------------------------------------------
// T005 / C-002 / INV-NEW-01: migrateDeprecatedPermissionGrants
// ---------------------------------------------------------------------------

function buildFixture() {
  const policies = new InMemoryPolicyRepo();
  const policyPermissions = new InMemoryPolicyPermissionRepo();
  return { policies, policyPermissions, idGen: counterIdGen("pp") };
}

test("C-002/INV-NEW-01: fans out a deprecated grant to every `to` string, keeps the deprecated grant, and leaves an unrelated permission untouched", async () => {
  registerPermissionMigration({
    from: "navigation.manage",
    to: [
      "admin.menus.read",
      "admin.menus.create",
      "admin.menus.update",
      "admin.menus.delete",
      "admin.menus.delete.force",
      "admin.menus.assign",
    ],
    reason: "ADR-PIPE-012 D-1/D-2/D-9 permission split/rename",
  });

  const { policies, policyPermissions, idGen } = buildFixture();
  await policies.save({
    id: "policy-1",
    workspaceId: WORKSPACE,
    name: "some-role-builtin-policy",
    isBuiltin: true,
    isFrozen: false,
  });
  await policyPermissions.save({
    id: idGen.newId(),
    workspaceId: WORKSPACE,
    policyId: "policy-1",
    permission: "navigation.manage",
    resourceType: null,
    constraintJson: null,
  });
  await policyPermissions.save({
    id: idGen.newId(),
    workspaceId: WORKSPACE,
    policyId: "policy-1",
    permission: "content.read",
    resourceType: null,
    constraintJson: null,
  });

  const result = await migrateDeprecatedPermissionGrants({
    policyPermissions,
    policies,
    idGen,
    workspaceId: WORKSPACE,
  });

  assert.equal(result.migratedGrantCount, 6, "one new row per `to` string");

  const held = (
    await policyPermissions.listByPolicyId({ workspaceId: WORKSPACE, policyId: "policy-1" })
  ).map((row) => row.permission);

  for (const target of [
    "admin.menus.read",
    "admin.menus.create",
    "admin.menus.update",
    "admin.menus.delete",
    "admin.menus.delete.force",
    "admin.menus.assign",
  ]) {
    assert.ok(held.includes(target), `policy now holds ${target}`);
  }
  assert.ok(held.includes("navigation.manage"), "the deprecated grant is retained, never removed");
  assert.ok(held.includes("content.read"), "an unrelated permission is untouched");
  assert.equal(held.length, 8, "exactly the original 2 rows + 6 new rows, no more");
});

test("C-002/INV-NEW-01: running the migration a second time is a no-op (idempotency)", async () => {
  registerPermissionMigration({
    from: "navigation.manage",
    to: [
      "admin.menus.read",
      "admin.menus.create",
      "admin.menus.update",
      "admin.menus.delete",
      "admin.menus.delete.force",
      "admin.menus.assign",
    ],
    reason: "ADR-PIPE-012 D-1/D-2/D-9 permission split/rename",
  });

  const { policies, policyPermissions, idGen } = buildFixture();
  await policies.save({
    id: "policy-1",
    workspaceId: WORKSPACE,
    name: "some-role-builtin-policy",
    isBuiltin: true,
    isFrozen: false,
  });
  await policyPermissions.save({
    id: idGen.newId(),
    workspaceId: WORKSPACE,
    policyId: "policy-1",
    permission: "navigation.manage",
    resourceType: null,
    constraintJson: null,
  });

  const first = await migrateDeprecatedPermissionGrants({
    policyPermissions,
    policies,
    idGen,
    workspaceId: WORKSPACE,
  });
  assert.equal(first.migratedGrantCount, 6);

  const second = await migrateDeprecatedPermissionGrants({
    policyPermissions,
    policies,
    idGen,
    workspaceId: WORKSPACE,
  });
  assert.equal(second.migratedGrantCount, 0, "the second run adds nothing new");

  const held = await policyPermissions.listByPolicyId({ workspaceId: WORKSPACE, policyId: "policy-1" });
  assert.equal(held.length, 7, "still exactly 1 original + 6 fanned-out rows, no duplicates");
});

test("C-002/INV-NEW-01: a policy that never held the deprecated permission is never touched", async () => {
  registerPermissionMigration({
    from: "navigation.manage",
    to: ["admin.menus.read", "admin.menus.manage"],
    reason: "ADR-PIPE-012 D-1/D-2/D-9 permission split/rename",
  });

  const { policies, policyPermissions, idGen } = buildFixture();
  await policies.save({
    id: "policy-untouched",
    workspaceId: WORKSPACE,
    name: "unrelated-policy",
    isBuiltin: false,
    isFrozen: false,
  });
  await policyPermissions.save({
    id: idGen.newId(),
    workspaceId: WORKSPACE,
    policyId: "policy-untouched",
    permission: "content.write",
    resourceType: null,
    constraintJson: null,
  });

  const result = await migrateDeprecatedPermissionGrants({
    policyPermissions,
    policies,
    idGen,
    workspaceId: WORKSPACE,
  });

  assert.equal(result.migratedGrantCount, 0);
  const held = (
    await policyPermissions.listByPolicyId({ workspaceId: WORKSPACE, policyId: "policy-untouched" })
  ).map((row) => row.permission);
  assert.deepEqual(held, ["content.write"], "unrelated policy's grants are exactly unchanged");
});

test("C-002: a `to` string already held by the policy is not duplicated", async () => {
  registerPermissionMigration({
    from: "navigation.manage",
    to: ["admin.menus.read", "admin.menus.manage"],
    reason: "ADR-PIPE-012 D-1/D-2/D-9 permission split/rename",
  });

  const { policies, policyPermissions, idGen } = buildFixture();
  await policies.save({
    id: "policy-partial",
    workspaceId: WORKSPACE,
    name: "partial-policy",
    isBuiltin: false,
    isFrozen: false,
  });
  await policyPermissions.save({
    id: idGen.newId(),
    workspaceId: WORKSPACE,
    policyId: "policy-partial",
    permission: "navigation.manage",
    resourceType: null,
    constraintJson: null,
  });
  // Already holds one of the two `to` strings ahead of the migration running.
  await policyPermissions.save({
    id: idGen.newId(),
    workspaceId: WORKSPACE,
    policyId: "policy-partial",
    permission: "admin.menus.read",
    resourceType: null,
    constraintJson: null,
  });

  const result = await migrateDeprecatedPermissionGrants({
    policyPermissions,
    policies,
    idGen,
    workspaceId: WORKSPACE,
  });

  assert.equal(result.migratedGrantCount, 1, "only the missing `to` string is added");
  const held = (
    await policyPermissions.listByPolicyId({ workspaceId: WORKSPACE, policyId: "policy-partial" })
  ).map((row) => row.permission);
  assert.equal(held.filter((p) => p === "admin.menus.read").length, 1, "no duplicate row");
  assert.ok(held.includes("admin.menus.manage"));
});

// ---------------------------------------------------------------------------
// T012: integration — a role holding only navigation.manage before migration
// is not silently narrowed by the split (ADR-PIPE-012 Migration Safety,
// Reconciliation Checks).
// ---------------------------------------------------------------------------

test("T012: a policy holding only navigation.manage is authorized for every new admin.menus.* action after migration runs", async () => {
  registerPermissionMigration({
    from: "navigation.manage",
    to: [
      "admin.menus.read",
      "admin.menus.create",
      "admin.menus.update",
      "admin.menus.delete",
      "admin.menus.delete.force",
      "admin.menus.assign",
    ],
    reason: "ADR-PIPE-012 D-1/D-2/D-9 permission split/rename",
  });

  const principals = new InMemoryPrincipalRepo();
  const principalRoles = new InMemoryPrincipalRoleRepo();
  const rolePolicies = new InMemoryRolePolicyRepo();
  const roles = new InMemoryRoleRepo();
  const policies = new InMemoryPolicyRepo();
  const policyPermissions = new InMemoryPolicyPermissionRepo();
  const principalPolicies = new InMemoryPrincipalPolicyRepo();

  const ws = "workspace-t012";
  await principals.save({
    id: "principal-1",
    workspaceId: ws,
    kind: "user",
    displayName: "Menus editor",
    status: "active",
    createdAt: "2026-07-13T00:00:00.000Z",
  });
  await roles.save({ id: "role-1", workspaceId: ws, name: "menus-editor", isBuiltin: false });
  await policies.save({
    id: "policy-1",
    workspaceId: ws,
    name: "menus-editor-policy",
    isBuiltin: false,
    isFrozen: false,
  });
  await rolePolicies.save({ id: "rp-1", workspaceId: ws, roleId: "role-1", policyId: "policy-1" });
  await principalRoles.save({ id: "pr-1", workspaceId: ws, principalId: "principal-1", roleId: "role-1" });
  await policyPermissions.save({
    id: "pp-1",
    workspaceId: ws,
    policyId: "policy-1",
    permission: "navigation.manage",
    resourceType: null,
    constraintJson: null,
  });

  const authorizeDeps = { principals, principalRoles, rolePolicies, principalPolicies, policyPermissions };

  // Before migration: the new action-specific strings are NOT yet granted.
  const beforeRead = await authorize({
    deps: authorizeDeps,
    principalId: "principal-1",
    permission: "admin.menus.read",
    context: { workspaceId: ws },
  });
  assert.equal(beforeRead.allowed, false, "pre-migration, the new string is not yet granted");

  await migrateDeprecatedPermissionGrants({
    policyPermissions,
    policies,
    idGen: { newId: () => `migrated-${Math.random()}` },
    workspaceId: ws,
  });

  // After migration: every action-specific admin.menus.* permission (the 6 CRUD strings, i.e.
  // every catalog entry except the umbrella "manage") now succeeds — no role is silently
  // narrowed by the split.
  const actionPermissions = NAVIGATION_PERMISSIONS.filter((p) => p !== "admin.menus.manage");
  assert.equal(actionPermissions.length, 6);

  for (const permission of actionPermissions) {
    const result = await authorize({
      deps: authorizeDeps,
      principalId: "principal-1",
      permission,
      context: { workspaceId: ws },
    });
    assert.equal(result.allowed, true, `post-migration, '${permission}' is granted`);
  }

  // The deprecated string is still resolvable too (never removed).
  const stillLegacy = await authorize({
    deps: authorizeDeps,
    principalId: "principal-1",
    permission: "navigation.manage",
    context: { workspaceId: ws },
  });
  assert.equal(stillLegacy.allowed, true, "the deprecated grant itself is retained");
});

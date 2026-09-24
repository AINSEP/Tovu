import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { assignRole, createUser, type AuthServiceDeps } from "@jini-ai/cms/identity";
import { createSqliteIdentityRouteDeps } from "#src/features/identity/wiring";
import { POST_ENTITY_TYPE, USER_ENTITY_TYPE } from "#src/features/trash/index";
import { withUserTrashAdminOverride } from "../trash-user-admin-override.js";

/**
 * @file RED-first coverage for `withUserTrashAdminOverride` (delete-user plan v2 Slice 3, "Open gap"
 * flagged in `ADS-memory/.local-artifacts/handoffs/2026-09-24-c7-delete-user-v2.md`): restore and
 * permanent purge of a trashed USER must admit the built-in `admin` role, not just the owner
 * `TRASH_PERMISSION_BY_ENTITY_TYPE.get("user") === "*"` alone would allow (OWNER DECISION
 * 2026-09-24). Exercises the wrapper directly, over a real SQLite-backed `AuthServiceDeps`
 * (`createSqliteIdentityRouteDeps`, same fixture shape `delete-user-service.test.ts` uses for
 * `callerMayManageUserTrash`'s own tests) — this file's `base` callback is a hand-built fake since
 * the wrapper's own contract is entirely about what it does AROUND `base`, not about a real
 * permission evaluator.
 */

const clock = { nowIso: () => "2026-09-24T00:00:00.000Z" };
function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

async function buildIdentity(workspaceId: string): Promise<{ identity: AuthServiceDeps; ownerPrincipalId: string }> {
  const db = openContentDb(":memory:");
  const wiring = createSqliteIdentityRouteDeps({ db, workspaceId, clock, idGen: counterIdGen() });
  await wiring.identityReady;
  const ownerPrincipalId = await wiring.ownerPrincipalId;
  const identity: AuthServiceDeps = {
    repos: {
      principals: wiring.principalRepo,
      users: wiring.userRepo,
      sessions: wiring.sessionRepo,
      roles: wiring.roleRepo,
      policies: wiring.policyRepo,
      policyPermissions: wiring.policyPermissionRepo,
      rolePolicies: wiring.rolePolicyRepo,
      principalRoles: wiring.principalRoleRepo,
      principalPolicies: wiring.principalPolicyRepo,
    },
    hasher: wiring.passwordHasher,
    clock,
    idGen: counterIdGen(),
  };
  return { identity, ownerPrincipalId };
}

async function createBareUser(identity: AuthServiceDeps, workspaceId: string, ownerPrincipalId: string, username: string): Promise<string> {
  const { principal } = await createUser({
    deps: identity,
    input: { workspaceId, callerPrincipalId: ownerPrincipalId, username, password: "correct-horse" },
  });
  return principal.id;
}

async function assignBuiltinAdmin(identity: AuthServiceDeps, workspaceId: string, ownerPrincipalId: string, principalId: string): Promise<void> {
  const adminRole = await identity.repos.roles.findByName({ workspaceId, name: "admin" });
  assert.ok(adminRole, "seedIdentity must have created the built-in admin role");
  await assignRole({ deps: identity, input: { workspaceId, callerPrincipalId: ownerPrincipalId, principalId, roleId: adminRole.id } });
}

const denyReason = { allowed: false as const, reason: "no_grant" };

test("withUserTrashAdminOverride: an already-allowed base decision passes through unchanged (owner never pays the role lookup)", async () => {
  const workspaceId = "ws-passthrough-allowed";
  const { identity } = await buildIdentity(workspaceId);
  const wrapped = withUserTrashAdminOverride({
    base: async () => ({ allowed: true, reason: "owner" }),
    identity,
    workspaceId,
  });

  const result = await wrapped({ principalId: "anyone", permission: "*", workspaceId, entityType: USER_ENTITY_TYPE });
  assert.deepEqual(result, { allowed: true, reason: "owner" });
});

test("withUserTrashAdminOverride: a denied non-user entityType is never overridden — does not widen any other trashable kind", async () => {
  const workspaceId = "ws-other-kind";
  const { identity, ownerPrincipalId } = await buildIdentity(workspaceId);
  const adminHolder = await createBareUser(identity, workspaceId, ownerPrincipalId, "admin-holder-other-kind");
  await assignBuiltinAdmin(identity, workspaceId, ownerPrincipalId, adminHolder);
  const wrapped = withUserTrashAdminOverride({ base: async () => denyReason, identity, workspaceId });

  const result = await wrapped({ principalId: adminHolder, permission: "content.write", workspaceId, entityType: POST_ENTITY_TYPE });
  assert.deepEqual(result, denyReason);
});

test("withUserTrashAdminOverride: a built-in admin (not owner) is allowed for entityType='user' when the base check denies — OWNER DECISION 2026-09-24", async () => {
  const workspaceId = "ws-user-admin-override";
  const { identity, ownerPrincipalId } = await buildIdentity(workspaceId);
  const adminHolder = await createBareUser(identity, workspaceId, ownerPrincipalId, "admin-holder-user-kind");
  await assignBuiltinAdmin(identity, workspaceId, ownerPrincipalId, adminHolder);
  const wrapped = withUserTrashAdminOverride({ base: async () => denyReason, identity, workspaceId });

  const result = await wrapped({ principalId: adminHolder, permission: "*", workspaceId, entityType: USER_ENTITY_TYPE });
  assert.equal(result.allowed, true);
});

test("withUserTrashAdminOverride: a caller holding neither owner nor the built-in admin role stays denied for entityType='user'", async () => {
  const workspaceId = "ws-user-no-grant";
  const { identity, ownerPrincipalId } = await buildIdentity(workspaceId);
  const bareUser = await createBareUser(identity, workspaceId, ownerPrincipalId, "bare-user-kind");
  const wrapped = withUserTrashAdminOverride({ base: async () => denyReason, identity, workspaceId });

  const result = await wrapped({ principalId: bareUser, permission: "*", workspaceId, entityType: USER_ENTITY_TYPE });
  assert.deepEqual(result, denyReason);
});

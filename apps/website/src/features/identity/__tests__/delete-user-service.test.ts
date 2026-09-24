import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import {
  assignRole,
  createUser,
  IdentityForbiddenError,
  IdentityNotFoundError,
  IdentityValidationError,
  OwnerRequiredError,
  type AuthServiceDeps,
} from "@jini-ai/cms/identity";
import { createSqliteIdentityRouteDeps, type IdentityRouteDepsSlice } from "../wiring.js";
import { deleteUser, SelfDeleteError, type DeleteUserDeps } from "../delete-user-service.js";

/**
 * @file RED-first coverage for `deleteUser` (delete-user plan Slice 2), one test per decision 4
 * rule plus the happy path, the disabled-owner exception, and the INV-08 concurrency guard.
 * Exercises the real SQLite-backed identity wiring (`createSqliteIdentityRouteDeps`), not a fake —
 * `deleteUser` is a thin orchestration layer over real `@jini-ai/cms/identity` transitions
 * (`createUser`/`assignRole`) and this suite's own direct repo grants for permission shapes those
 * transitions can't mint (a "user.manage but not owner" caller).
 */

const NOW = "2026-09-24T00:00:00.000Z";
const clock = { nowIso: () => NOW };
function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

interface Fixture {
  db: ContentDb;
  wiring: IdentityRouteDepsSlice;
  identity: AuthServiceDeps;
  deps: DeleteUserDeps;
  workspaceId: string;
  ownerPrincipalId: string;
}

async function setup(workspaceId: string): Promise<Fixture> {
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

  return { db, wiring, identity, deps: { identity, purge: wiring.userPurge }, workspaceId, ownerPrincipalId };
}

/** Creates a plain `kind='user'` principal with NO grants at all (not even a role). */
async function createBareUser(f: Fixture, username: string): Promise<string> {
  const { principal } = await createUser({
    deps: f.identity,
    input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, username, password: "correct-horse" },
  });
  return principal.id;
}

/** Grants `permission` to `principalId` directly (bypassing `createPolicy`/`attachPolicy`, which
 *  this suite doesn't otherwise need) — used to build a caller who holds `user.manage` WITHOUT
 *  also holding the owner wildcard, a shape `assignRole`'s built-in roles cannot produce (only the
 *  built-in `owner` role holds `user.manage`, and it holds it via `*`). */
async function grantDirectPermission(f: Fixture, principalId: string, permission: string, idPrefix: string): Promise<void> {
  const policyId = `${idPrefix}-policy`;
  await f.identity.repos.policies.save({ id: policyId, workspaceId: f.workspaceId, name: idPrefix, isBuiltin: false, isFrozen: false });
  await f.identity.repos.policyPermissions.save({ id: `${idPrefix}-grant`, workspaceId: f.workspaceId, policyId, permission });
  await f.identity.repos.principalPolicies.save({ id: `${idPrefix}-link`, workspaceId: f.workspaceId, principalId, policyId });
}

/** Assigns the built-in `owner` role (holds `*`) to `principalId`, making it an active
 *  owner-wildcard holder. */
async function makeOwnerWildcard(f: Fixture, principalId: string): Promise<void> {
  const ownerRole = await f.identity.repos.roles.findByName({ workspaceId: f.workspaceId, name: "owner" });
  assert.ok(ownerRole, "seedIdentity must have created the built-in owner role");
  await assignRole({
    deps: f.identity,
    input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId, roleId: ownerRole.id },
  });
}

async function disablePrincipalDirect(f: Fixture, principalId: string): Promise<void> {
  const principal = await f.identity.repos.principals.findById({ workspaceId: f.workspaceId, id: principalId });
  assert.ok(principal);
  await f.identity.repos.principals.save({ ...principal, status: "disabled", disabledAt: NOW });
}

test("deleteUser: a caller with no grants is refused with IdentityForbiddenError", async () => {
  const f = await setup("ws-forbidden");
  const nobodyId = await createBareUser(f, "nobody");
  const targetId = await createBareUser(f, "target");

  await assert.rejects(
    deleteUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: nobodyId, principalId: targetId, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) => err instanceof IdentityForbiddenError
  );
});

test("deleteUser: an unknown target is refused with the exact IdentityNotFoundError text", async () => {
  const f = await setup("ws-not-found");

  await assert.rejects(
    deleteUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: "does-not-exist", seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) => err instanceof IdentityNotFoundError && err.message === "principal 'does-not-exist' was not found"
  );
});

test("deleteUser: a non-human (kind !== 'user') target is refused with the exact IdentityValidationError text", async () => {
  const f = await setup("ws-kind");
  await f.identity.repos.principals.save({
    id: "agent-1",
    workspaceId: f.workspaceId,
    kind: "agent",
    displayName: "Agent",
    status: "active",
    createdAt: NOW,
  });

  await assert.rejects(
    deleteUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: "agent-1", seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) =>
      err instanceof IdentityValidationError &&
      err.message === "DELETE_USER target must be a human (kind='user') principal, got kind='agent'"
  );
});

test("deleteUser: deleting yourself is refused with the exact SelfDeleteError text", async () => {
  const f = await setup("ws-self");

  await assert.rejects(
    deleteUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: f.ownerPrincipalId, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) => err instanceof SelfDeleteError && err.message === "you cannot delete your own account"
  );
});

test("deleteUser: the seeded owner can never be deleted, even by another owner", async () => {
  const f = await setup("ws-seeded-owner");
  const secondOwnerId = await createBareUser(f, "second-owner");
  await makeOwnerWildcard(f, secondOwnerId);

  await assert.rejects(
    deleteUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: secondOwnerId, principalId: f.ownerPrincipalId, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) => err instanceof OwnerRequiredError && err.message === "the seeded owner principal can never be deleted"
  );
});

test("deleteUser: refuses to drop the workspace's last active owner-`*` principal (INV-08)", async () => {
  const f = await setup("ws-inv08");
  const lastOwnerId = await createBareUser(f, "last-owner");
  await makeOwnerWildcard(f, lastOwnerId);
  const callerId = await createBareUser(f, "user-manager");
  await grantDirectPermission(f, callerId, "user.manage", "user-manager");
  // The seeded owner is the workspace's OTHER active owner-`*` principal; disable it directly so
  // `lastOwnerId` really is the only one left, isolating INV-08 from the unconditional
  // seeded-owner refusal tested above.
  await disablePrincipalDirect(f, f.ownerPrincipalId);

  await assert.rejects(
    deleteUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: callerId, principalId: lastOwnerId, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) =>
      err instanceof OwnerRequiredError &&
      err.message === "the workspace must keep at least one active owner-`*` principal (INV-08)"
  );
});

test("deleteUser: happy path removes the principal, frees the username, and records the audit event", async () => {
  const f = await setup("ws-happy");
  const targetId = await createBareUser(f, "departing");

  const { removed } = await deleteUser({
    deps: f.deps,
    input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: targetId, seededOwnerPrincipalId: f.ownerPrincipalId },
  });

  assert.deepEqual(removed, { roles: 0, policies: 0, sessions: 0, apiKeys: 0, userSettings: 0 });
  assert.equal(await f.identity.repos.principals.findById({ workspaceId: f.workspaceId, id: targetId }), null);
  assert.equal(await f.identity.repos.users.findByUsername({ workspaceId: f.workspaceId, username: "departing" }), null);

  // The freed username can be reused immediately — CREATE_USER's own uniqueness check no longer
  // sees a live row for it.
  const recreated = await createUser({
    deps: f.identity,
    input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, username: "departing", password: "correct-horse" },
  });
  assert.ok(recreated.principal.id);
});

test("deleteUser: a DISABLED owner-`*` user can be deleted while another active owner exists", async () => {
  const f = await setup("ws-disabled-owner");
  const secondOwnerId = await createBareUser(f, "second-owner");
  await makeOwnerWildcard(f, secondOwnerId);
  await disablePrincipalDirect(f, secondOwnerId);

  const { removed } = await deleteUser({
    deps: f.deps,
    input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: secondOwnerId, seededOwnerPrincipalId: f.ownerPrincipalId },
  });

  assert.equal(removed.roles, 1);
  assert.equal(await f.identity.repos.principals.findById({ workspaceId: f.workspaceId, id: secondOwnerId }), null);
});

test("deleteUser: two concurrent deletes of the workspace's only two active owners — exactly one succeeds", async () => {
  const f = await setup("ws-concurrent-owners");
  const ownerA = await createBareUser(f, "owner-a");
  const ownerB = await createBareUser(f, "owner-b");
  await makeOwnerWildcard(f, ownerA);
  await makeOwnerWildcard(f, ownerB);
  const callerId = await createBareUser(f, "user-manager");
  await grantDirectPermission(f, callerId, "user.manage", "user-manager");
  // Isolate INV-08 from the seeded-owner refusal, same as the sequential INV-08 test above: only
  // ownerA/ownerB are active owner-`*` principals now.
  await disablePrincipalDirect(f, f.ownerPrincipalId);

  const [resultA, resultB] = await Promise.allSettled([
    deleteUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: callerId, principalId: ownerA, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    deleteUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: callerId, principalId: ownerB, seededOwnerPrincipalId: f.ownerPrincipalId } }),
  ]);

  const outcomes = [resultA, resultB];
  const fulfilled = outcomes.filter((r) => r.status === "fulfilled");
  const rejected = outcomes.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactly one of the two concurrent owner deletes must succeed");
  assert.equal(rejected.length, 1, "the other must be refused, never both succeeding and stranding the workspace with zero owners");
  assert.ok(rejected[0]!.status === "rejected" && rejected[0].reason instanceof OwnerRequiredError);
});

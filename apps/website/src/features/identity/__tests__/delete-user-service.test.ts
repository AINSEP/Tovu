import { NodeSessionTokens } from "@jini-ai/user-management/server";
import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import { createContentDbTransactionRunner, createUserTrashAdapter, SqliteTrashRepo, USER_ENTITY_TYPE } from "#src/features/trash/index";
import { bindRemoveEntity, createTrashService, type TrashAdapter, type TrashPort } from "@jini-ai/cms/trash";
import { SqliteUserPurge } from "#src/features/identity/user-purge.sqlite";
import { assignRole, createUser, type AuthServiceDeps } from "@jini-ai/user-management/server";
import { IdentityForbiddenError, IdentityNotFoundError, IdentityValidationError, OwnerRequiredError } from "@jini-ai/user-management";
import { DEFAULT_OWNER_CREDENTIALS, createSqliteIdentityRouteDeps, type IdentityRouteDepsSlice } from "../wiring.js";
import { trashUser, SelfDeleteError, type DeleteUserDeps } from "../delete-user-service.js";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";

/**
 * @file RED-first coverage for `trashUser` (delete-user plan v2 Slice 2, and the OWNER DECISION
 * 2026-09-24 that supersedes decision 1's "owner-role holders only" default). One test per decision
 * 4/5/7 rule plus the OWNER DECISION's caller gate (owner OR the built-in `admin` role, never a
 * custom role), the disabled-owner exception, the INV-08 concurrency guard, and the idempotent
 * re-trash. Exercises the real SQLite-backed identity AND Trash wiring (`createSqliteIdentityRouteDeps`
 * plus a real `createTrashService`/`createUserTrashAdapter`), not fakes — `trashUser` is a thin
 * orchestration layer over both, and the "already in the Trash" short-circuit specifically depends
 * on a real `TrashRepoPort` round-trip (see `adapters/user.ts`'s `hide` doc for why that check
 * cannot live in the adapter itself).
 */

const NOW = "2026-09-24T00:00:00.000Z";
const clock = { nowIso: () => NOW, nowMs: () => Date.parse(NOW) };
function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}
function counterTrashIdGen() {
  let n = 0;
  return { next: () => `trash-id-${++n}` };
}

interface Fixture {
  db: ContentDb;
  wiring: IdentityRouteDepsSlice;
  identity: AuthServiceDeps;
  trash: TrashPort;
  deps: DeleteUserDeps;
  workspaceId: string;
  ownerPrincipalId: string;
}

async function setup(workspaceId: string): Promise<Fixture> {
  const db = openContentDb(":memory:");
  // `trashed_items.workspace_id` FKs to `workspaces` (same setup as `trash/__tests__/user-adapter.test.ts`).
  db.$client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(workspaceId, workspaceId, workspaceId, "2026-01-01T00:00:00.000Z");
  const wiring = createSqliteIdentityRouteDeps({ ownerCredentials: DEFAULT_OWNER_CREDENTIALS, permissionGrants: createAppPermissionGrants({}), db, workspaceId, clock, idGen: counterIdGen() });
  await wiring.identityReady;
  const ownerPrincipalId = await wiring.ownerPrincipalId;

  const identity: AuthServiceDeps = {
    tokens: new NodeSessionTokens({}),
    repos: {
      transactions: wiring.transactions,
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

  const trashRepo = new SqliteTrashRepo(db.$client);
  const adapter: TrashAdapter = createUserTrashAdapter({ db, purge: new SqliteUserPurge(db), idGen: counterTrashIdGen(), clock });
  const trash = createTrashService({
    repo: trashRepo,
    adapters: new Map<string, TrashAdapter>([[USER_ENTITY_TYPE, adapter]]),
    idGen: { newId: () => (counterTrashIdGen()).next() },
    transaction: ({ work }) => (createContentDbTransactionRunner(db.$client))(work),
    entityPolicy: ({ entityType }) => (new Map<string, TrashAdapter>([[USER_ENTITY_TYPE, adapter]])).has(entityType)
  }, { onError: ({ error }) => console.error("[trash] onChanged hook failed; the trash/restore/purge it followed already committed", error) });
  const isInTrash = async (principalId: string): Promise<boolean> =>
    (await trashRepo.findByEntity({ workspaceId, entityType: USER_ENTITY_TYPE, entityId: principalId })) !== null;

  return {
    db,
    wiring,
    identity,
    trash,
    deps: {
      identity, removeUser: bindRemoveEntity({
        trash: trash,
        entityType: USER_ENTITY_TYPE
      }), isInTrash },
    workspaceId,
    ownerPrincipalId,
  };
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
 *  also holding the owner wildcard or the built-in admin role, a shape no built-in role produces. */
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

/** Assigns the built-in `admin` role to `principalId` — OWNER DECISION 2026-09-24's second gate,
 *  distinct from `makeOwnerWildcard`: `admin` holds no `user.manage` (Jini `seed.ts`, owner-only per
 *  DR-001; it holds `role.manage` since 2026-10-05, which no delete path checks), so this exercises
 *  the role-name check, not a permission grant. */
async function makeBuiltinAdmin(f: Fixture, principalId: string): Promise<void> {
  const adminRole = await f.identity.repos.roles.findByName({ workspaceId: f.workspaceId, name: "admin" });
  assert.ok(adminRole, "seedIdentity must have created the built-in admin role");
  await assignRole({
    deps: f.identity,
    input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId, roleId: adminRole.id },
  });
}

async function disablePrincipalDirect(f: Fixture, principalId: string): Promise<void> {
  const principal = await f.identity.repos.principals.findById({ workspaceId: f.workspaceId, id: principalId });
  assert.ok(principal);
  await f.identity.repos.principals.save({ ...principal, status: "disabled", disabledAt: NOW });
}

test("trashUser: a caller with no grants is refused with IdentityForbiddenError", async () => {
  const f = await setup("ws-forbidden");
  const nobodyId = await createBareUser(f, "nobody");
  const targetId = await createBareUser(f, "target");

  await assert.rejects(
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: nobodyId, principalId: targetId, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) => err instanceof IdentityForbiddenError
  );
});

test("trashUser: a caller holding only 'user.manage' (not owner, not the built-in admin role) is refused", async () => {
  const f = await setup("ws-user-manage-only");
  const callerId = await createBareUser(f, "user-manager");
  await grantDirectPermission(f, callerId, "user.manage", "user-manager");
  const targetId = await createBareUser(f, "target");

  await assert.rejects(
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: callerId, principalId: targetId, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) => err instanceof IdentityForbiddenError
  );
});

test("trashUser: a caller holding the built-in 'admin' role (not owner) may trash a user — OWNER DECISION 2026-09-24", async () => {
  const f = await setup("ws-builtin-admin");
  const callerId = await createBareUser(f, "admin-holder");
  await makeBuiltinAdmin(f, callerId);
  const targetId = await createBareUser(f, "target");

  await trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: callerId, principalId: targetId, seededOwnerPrincipalId: f.ownerPrincipalId } });

  assert.equal((await f.identity.repos.principals.findById({ workspaceId: f.workspaceId, id: targetId }))?.status, "disabled");
});

test("trashUser: a non-built-in role named admin cannot trash a user", async () => {
  const f = await setup("ws-custom-admin");
  const callerId = await createBareUser(f, "custom-admin-holder");
  await makeBuiltinAdmin(f, callerId);
  const admin = await f.identity.repos.roles.findByName({ workspaceId: f.workspaceId, name: "admin" });
  assert.ok(admin);
  await f.identity.repos.roles.save({ ...admin, isBuiltin: false });
  const targetId = await createBareUser(f, "target");
  const before = await f.identity.repos.principals.findById({ workspaceId: f.workspaceId, id: targetId });
  await assert.rejects(
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: callerId, principalId: targetId, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (error) => error instanceof IdentityForbiddenError,
  );
  assert.deepEqual(await f.identity.repos.principals.findById({ workspaceId: f.workspaceId, id: targetId }), before);
  assert.deepEqual((await f.trash.list({ workspaceId: f.workspaceId, now: NOW, limit: 50 })).items, []);
});

test("trashUser: an unknown target is refused with the exact IdentityNotFoundError text", async () => {
  const f = await setup("ws-not-found");

  await assert.rejects(
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: "does-not-exist", seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) => err instanceof IdentityNotFoundError && err.message === "principal 'does-not-exist' was not found"
  );
});

test("trashUser: a non-human (kind='agent') target is refused with the exact IdentityValidationError text", async () => {
  const f = await setup("ws-kind-agent");
  await f.identity.repos.principals.save({
    id: "agent-1",
    workspaceId: f.workspaceId,
    kind: "agent",
    displayName: "Agent",
    status: "active",
    createdAt: NOW,
  });

  await assert.rejects(
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: "agent-1", seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) =>
      err instanceof IdentityValidationError &&
      err.message === "DELETE_USER target must be a user or api_key principal, got kind='agent'"
  );
});

test("trashUser: a 'system' target is refused with the exact IdentityValidationError text", async () => {
  const f = await setup("ws-kind-system");
  await f.identity.repos.principals.save({
    id: "system-1",
    workspaceId: f.workspaceId,
    kind: "system",
    displayName: "System",
    status: "active",
    createdAt: NOW,
  });

  await assert.rejects(
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: "system-1", seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) =>
      err instanceof IdentityValidationError &&
      err.message === "DELETE_USER target must be a user or api_key principal, got kind='system'"
  );
});

test("trashUser: an 'api_key' target succeeds", async () => {
  const f = await setup("ws-api-key");
  await f.identity.repos.principals.save({
    id: "runner-1",
    workspaceId: f.workspaceId,
    kind: "api_key",
    displayName: "Tovu-Runner",
    status: "active",
    createdAt: NOW,
  });

  const outcome = await trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: "runner-1", seededOwnerPrincipalId: f.ownerPrincipalId } });

  assert.equal(outcome.ok, true);
  assert.equal((await f.identity.repos.principals.findById({ workspaceId: f.workspaceId, id: "runner-1" }))?.status, "disabled");
});

test("trashUser: deleting yourself is refused with the exact SelfDeleteError text", async () => {
  const f = await setup("ws-self");

  await assert.rejects(
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: f.ownerPrincipalId, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) => err instanceof SelfDeleteError && err.message === "you cannot delete your own account"
  );
});

test("trashUser: the seeded owner can never be deleted, even by another owner", async () => {
  const f = await setup("ws-seeded-owner");
  const secondOwnerId = await createBareUser(f, "second-owner");
  await makeOwnerWildcard(f, secondOwnerId);

  await assert.rejects(
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: secondOwnerId, principalId: f.ownerPrincipalId, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) => err instanceof OwnerRequiredError && err.message === "the seeded owner principal can never be deleted"
  );
});

test("trashUser: refuses to drop the workspace's last active owner-`*` principal", async () => {
  const f = await setup("ws-inv08");
  const lastOwnerId = await createBareUser(f, "last-owner");
  await makeOwnerWildcard(f, lastOwnerId);
  // An owner must pass the target guard before the active-owner floor can be exercised.
  const callerId = f.ownerPrincipalId;
  // The seeded owner is the workspace's OTHER active owner-`*` principal; disable it directly so
  // `lastOwnerId` really is the only one left, isolating INV-08 from the unconditional
  // seeded-owner refusal tested above.
  await disablePrincipalDirect(f, f.ownerPrincipalId);

  await assert.rejects(
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: callerId, principalId: lastOwnerId, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) =>
      err instanceof OwnerRequiredError &&
      err.message === "the workspace must keep at least one active owner-`*` principal"
  );
});

test("trashUser: a site member holding `*` never counts as the remaining owner (INV-08, F3144)", async () => {
  const f = await setup("ws-inv08-member");
  const lastOwnerId = await createBareUser(f, "last-owner");
  await makeOwnerWildcard(f, lastOwnerId);
  await disablePrincipalDirect(f, f.ownerPrincipalId);
  // Only a hand-edited store can give a member `*` (grant services refuse non-user targets).
  await f.identity.repos.principals.save({ id: "member-1", workspaceId: f.workspaceId, kind: "member", displayName: "Site member", status: "active", createdAt: "2026-01-01T00:00:00.000Z" });
  await grantDirectPermission(f, "member-1", "*", "member-star");

  await assert.rejects(
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: lastOwnerId, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) =>
      err instanceof OwnerRequiredError &&
      err.message === "the workspace must keep at least one active owner-`*` principal"
  );
});

test("trashUser: after trashing owner B, trashing owner C (the last active one besides the caller) still trips INV-08", async () => {
  const f = await setup("ws-inv08-sequential");
  const ownerB = await createBareUser(f, "owner-b");
  const ownerC = await createBareUser(f, "owner-c");
  await makeOwnerWildcard(f, ownerB);
  await makeOwnerWildcard(f, ownerC);
  await disablePrincipalDirect(f, f.ownerPrincipalId);

  await trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: ownerB, seededOwnerPrincipalId: f.ownerPrincipalId } });
  // The seeded owner (the caller here) is disabled, so it no longer counts as active — ownerC is
  // now the workspace's ONLY active owner-`*` principal, even though the caller itself holds `*`.
  await assert.rejects(
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: ownerC, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    (err: unknown) => err instanceof OwnerRequiredError
  );
});

test("trashUser: happy path disables the principal, revokes sessions, keeps roles, and indexes it for the Trash", async () => {
  const f = await setup("ws-happy");
  const targetId = await createBareUser(f, "departing");
  await makeBuiltinAdmin(f, targetId);
  const rolesBefore = await f.identity.repos.principalRoles.listByPrincipalId({ workspaceId: f.workspaceId, principalId: targetId });
  const neighborId = await createBareUser(f, "staying");
  f.db.$client.prepare(`INSERT INTO sessions (id, workspace_id, principal_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run("neighbor-session", f.workspaceId, neighborId, "neighbor-hash", NOW, NOW);
  const neighborBefore = f.db.$client.prepare(`SELECT * FROM sessions WHERE id = ?`).get("neighbor-session");
  f.db.$client
    .prepare(`INSERT INTO sessions (id, workspace_id, principal_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run("sess-1", f.workspaceId, targetId, "hash-1", NOW, NOW);

  const outcome = await trashUser({
    deps: f.deps,
    input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: targetId, seededOwnerPrincipalId: f.ownerPrincipalId },
  });

  assert.equal(outcome.ok, true);
  const target = await f.identity.repos.principals.findById({ workspaceId: f.workspaceId, id: targetId });
  assert.equal(target?.status, "disabled");
  const sessionCount = (f.db.$client.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE principal_id = ?`).get(targetId) as { n: number }).n;
  assert.equal(sessionCount, 0);
  assert.deepEqual(f.db.$client.prepare(`SELECT * FROM sessions WHERE id = ?`).get("neighbor-session"), neighborBefore);
  assert.deepEqual(await f.identity.repos.principalRoles.listByPrincipalId({ workspaceId: f.workspaceId, principalId: targetId }), rolesBefore);
  // Not hard-deleted — the row (and the freshly-created username) still exists, reserved while trashed.
  assert.notEqual(await f.identity.repos.users.findByUsername({ workspaceId: f.workspaceId, username: "departing" }), null);
  const trashPage = await f.trash.list({ workspaceId: f.workspaceId, now: NOW, limit: 50 });
  assert.ok(trashPage.items.some((item) => item.entityId === targetId));
  assert.equal(await f.trash.restore({ workspaceId: f.workspaceId, entityType: USER_ENTITY_TYPE, entityId: targetId, at: NOW }), "restored");
  assert.deepEqual(await f.identity.repos.principalRoles.listByPrincipalId({ workspaceId: f.workspaceId, principalId: targetId }), rolesBefore);
});

test("trashUser: a DISABLED owner-`*` user can be trashed while another active owner exists", async () => {
  const f = await setup("ws-disabled-owner");
  const secondOwnerId = await createBareUser(f, "second-owner");
  await makeOwnerWildcard(f, secondOwnerId);
  await disablePrincipalDirect(f, secondOwnerId);

  const outcome = await trashUser({
    deps: f.deps,
    input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: secondOwnerId, seededOwnerPrincipalId: f.ownerPrincipalId },
  });

  assert.equal(outcome.ok, true);
  assert.equal((await f.identity.repos.principals.findById({ workspaceId: f.workspaceId, id: secondOwnerId }))?.status, "disabled");
});

test("trashUser: two concurrent trashes of the workspace's only two active owners — exactly one succeeds", async () => {
  const f = await setup("ws-concurrent-owners");
  const ownerA = await createBareUser(f, "owner-a");
  const ownerB = await createBareUser(f, "owner-b");
  await makeOwnerWildcard(f, ownerA);
  await makeOwnerWildcard(f, ownerB);
  // The disabled seeded owner still holds `*`, but does not count toward the active-owner floor.
  const callerId = f.ownerPrincipalId;
  await disablePrincipalDirect(f, f.ownerPrincipalId);

  const [resultA, resultB] = await Promise.allSettled([
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: callerId, principalId: ownerA, seededOwnerPrincipalId: f.ownerPrincipalId } }),
    trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: callerId, principalId: ownerB, seededOwnerPrincipalId: f.ownerPrincipalId } }),
  ]);

  const outcomes = [resultA, resultB];
  const fulfilled = outcomes.filter((r) => r.status === "fulfilled");
  const rejected = outcomes.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactly one of the two concurrent owner trashes must succeed");
  assert.equal(rejected.length, 1, "the other must be refused, never both succeeding and stranding the workspace with zero owners");
  assert.ok(rejected[0]!.status === "rejected" && rejected[0].reason instanceof OwnerRequiredError);
  assert.equal(rejected[0].reason.message, "the workspace must keep at least one active owner-`*` principal");
});

test("trashUser: trashing an already-trashed user is an idempotent no-op — one index row, not two", async () => {
  const f = await setup("ws-idempotent");
  const targetId = await createBareUser(f, "departing");

  const first = await trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: targetId, seededOwnerPrincipalId: f.ownerPrincipalId } });
  const firstPage = await f.trash.list({ workspaceId: f.workspaceId, now: NOW, limit: 50 });
  assert.equal(firstPage.items.find((item) => item.entityId === targetId)?.priorMarker, "active");
  const second = await trashUser({ deps: f.deps, input: { workspaceId: f.workspaceId, callerPrincipalId: f.ownerPrincipalId, principalId: targetId, seededOwnerPrincipalId: f.ownerPrincipalId } });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  const trashPage = await f.trash.list({ workspaceId: f.workspaceId, now: NOW, limit: 50 });
  assert.equal(trashPage.items.filter((item) => item.entityId === targetId).length, 1);
  assert.deepEqual(trashPage.items, firstPage.items, "repeated trash preserves the original index row and prior marker");
  assert.equal(await f.trash.restore({ workspaceId: f.workspaceId, entityType: USER_ENTITY_TYPE, entityId: targetId, at: NOW }), "restored");
  assert.equal((await f.identity.repos.principals.findById({ workspaceId: f.workspaceId, id: targetId }))?.status, "active");
});

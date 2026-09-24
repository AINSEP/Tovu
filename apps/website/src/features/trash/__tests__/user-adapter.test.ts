import assert from "node:assert/strict";
import test from "node:test";

import * as schema from "#src/platform/db/schema.sqlite";
import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import { createSqliteIdentityRouteDeps, type IdentityRouteDepsSlice } from "#src/features/identity/wiring";
import { assignRole, createUser, type AuthServiceDeps } from "@jini-ai/cms/identity";

import { createUserTrashAdapter, USER_ENTITY_TYPE } from "../adapters/user.js";
import { mayActOnEntityType } from "../permissions.js";
import { buildTrashRegistry, type TrashRegistry } from "../registry.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { createTrashSweep } from "../sweeper.js";
import { computePurgeAfter, createTrashService } from "../write-service.js";
import type { TrashAdapter, TrashPort } from "../ports.js";

/**
 * @file RED-first coverage for the user `TrashAdapter` (delete-user plan v2 Slice 1) — hide/unhide
 * against real `principals`/`sessions` rows, purge delegated to the real `SqliteUserPurge`, and the
 * `"*"` permission gate. Real SQLite identity wiring throughout, same fixture shape as
 * `identity/__tests__/delete-user-service.test.ts` — no fakes for anything this adapter touches.
 */

const WS = "workspace-1";
const AT = "2026-09-24T00:00:00.000Z";
const AT2 = "2026-09-24T01:00:00.000Z";

interface Fixture {
  db: ContentDb;
  wiring: IdentityRouteDepsSlice;
  identity: AuthServiceDeps;
  registry: TrashRegistry;
  trash: TrashPort;
  ownerPrincipalId: string;
}

/** @param idGen the TRASH core's `{next()}` id generator, defaulting to a fresh counter; test (g)
 *  below passes a fixed one on purpose. Distinct from the identity library's own `{newId()}`
 *  generator ({@link counterIdGenNew}) — the two ports use different method names. */
async function setup(workspaceId: string, idGen: { next(): string } = counterIdGen()): Promise<Fixture> {
  const db = openContentDb(":memory:");
  // `trashed_items.workspace_id` FKs to `workspaces` (see `form-trash-flow.test.ts`'s identical setup).
  db.$client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(workspaceId, workspaceId, workspaceId, "2026-01-01T00:00:00.000Z");
  const clock = { nowIso: () => AT };
  const wiring = createSqliteIdentityRouteDeps({ db, workspaceId, clock, idGen: counterIdGenNew() });
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
    idGen: counterIdGenNew(),
  };

  const registry = buildTrashRegistry({ schema });
  const adapter: TrashAdapter = createUserTrashAdapter({ db, purge: wiring.userPurge, idGen, clock });
  const adapters = new Map<string, TrashAdapter>([[USER_ENTITY_TYPE, adapter]]);
  const trash = createTrashService({
    repo: new SqliteTrashRepo(db.$client),
    adapters,
    idGen,
    transaction: createContentDbTransactionRunner(db.$client),
  });

  return { db, wiring, identity, registry, trash, ownerPrincipalId };
}

function counterIdGen(): { next(): string } {
  let n = 0;
  return { next: () => `id-${++n}` };
}

/** The identity library's `IdGeneratorPort` shape (`.newId()`), separate from the trash core's
 *  `{next()}` above — see `setup`'s doc. */
function counterIdGenNew(): { newId(): string } {
  let n = 0;
  return { newId: () => `identity-id-${++n}` };
}

async function createBareUser(f: Fixture, username: string): Promise<string> {
  const { principal } = await createUser({
    deps: f.identity,
    input: { workspaceId: WS, callerPrincipalId: f.ownerPrincipalId, username, password: "correct-horse" },
  });
  return principal.id;
}

/** Grants `permission` directly, bypassing role assignment — used to build a caller who holds
 *  `user.manage` WITHOUT the owner wildcard (a shape no built-in role produces). */
async function grantDirectPermission(f: Fixture, principalId: string, permission: string, idPrefix: string): Promise<void> {
  await f.identity.repos.policies.save({ id: `${idPrefix}-policy`, workspaceId: WS, name: idPrefix, isBuiltin: false, isFrozen: false });
  await f.identity.repos.policyPermissions.save({ id: `${idPrefix}-grant`, workspaceId: WS, policyId: `${idPrefix}-policy`, permission });
  await f.identity.repos.principalPolicies.save({ id: `${idPrefix}-link`, workspaceId: WS, principalId, policyId: `${idPrefix}-policy` });
}

function principalRow(f: Fixture, id: string): { status: string; disabledAt: string | null } | undefined {
  return f.db.$client.prepare(`SELECT status, disabled_at AS disabledAt FROM principals WHERE id = ?`).get(id) as
    | { status: string; disabledAt: string | null }
    | undefined;
}

function sessionCount(f: Fixture, principalId: string): number {
  return (f.db.$client.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE principal_id = ?`).get(principalId) as { n: number }).n;
}

function roleCount(f: Fixture, principalId: string): number {
  return (f.db.$client.prepare(`SELECT COUNT(*) AS n FROM principal_roles WHERE principal_id = ?`).get(principalId) as { n: number }).n;
}

function outboxEventsNamed(f: Fixture, name: string): { payload: Record<string, unknown>; actorId: string | null }[] {
  const rows = f.db.$client.prepare(`SELECT event_json AS json FROM outbox_events`).all() as { json: string }[];
  return rows
    .map((row) => JSON.parse(row.json) as { name: string; payload: Record<string, unknown>; actorId?: string })
    .filter((event) => event.name === name)
    .map((event) => ({ payload: event.payload, actorId: event.actorId ?? null }));
}

async function trashItemRow(f: Fixture, entityId: string): Promise<{ id: string; priorMarker: string | null } | undefined> {
  const page = await f.trash.list({ workspaceId: WS, now: AT, limit: 50 });
  return page.items.find((row) => row.entityId === entityId);
}

test("hide: trashes an active user — disabled, sessions revoked, roles kept, priorMarker 'active', one trashed event", async () => {
  const f = await setup(WS);
  const targetId = await createBareUser(f, "departing");
  const ownerRole = await f.identity.repos.roles.findByName({ workspaceId: WS, name: "owner" });
  assert.ok(ownerRole);
  await assignRole({ deps: f.identity, input: { workspaceId: WS, callerPrincipalId: f.ownerPrincipalId, principalId: targetId, roleId: ownerRole.id } });
  f.db.$client
    .prepare(`INSERT INTO sessions (id, workspace_id, principal_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run("sess-1", WS, targetId, "hash-1", AT, AT2);

  const outcome = await f.trash.trash({
    workspaceId: WS,
    entityType: USER_ENTITY_TYPE,
    entityId: targetId,
    actor: { principalId: f.ownerPrincipalId },
    display: { title: "departing" },
    at: AT,
    expectedVersion: null,
  });

  assert.deepEqual(outcome, { ok: true, version: null, priorMarker: "active" });
  assert.deepEqual(principalRow(f, targetId), { status: "disabled", disabledAt: AT });
  assert.equal(sessionCount(f, targetId), 0);
  assert.equal(roleCount(f, targetId), 1, "roles are kept, not revoked");

  const item = await trashItemRow(f, targetId);
  assert.equal(item?.priorMarker, "active");

  const events = outboxEventsNamed(f, "identity.user.trashed");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    actorId: f.ownerPrincipalId,
    payload: { principalId: targetId, username: "departing", priorStatus: "active", sessionsRevoked: 1 },
  });
});

test("restore: brings an active-before-trash user back active, with roles intact and one restored event carrying the restorer's id", async () => {
  const f = await setup(WS);
  const targetId = await createBareUser(f, "departing");
  const ownerRole = await f.identity.repos.roles.findByName({ workspaceId: WS, name: "owner" });
  assert.ok(ownerRole);
  await assignRole({ deps: f.identity, input: { workspaceId: WS, callerPrincipalId: f.ownerPrincipalId, principalId: targetId, roleId: ownerRole.id } });
  await f.trash.trash({
    workspaceId: WS,
    entityType: USER_ENTITY_TYPE,
    entityId: targetId,
    actor: { principalId: f.ownerPrincipalId },
    display: { title: "departing" },
    at: AT,
    expectedVersion: null,
  });
  const restorerId = await createBareUser(f, "restorer");

  const outcome = await f.trash.restore({ workspaceId: WS, entityType: USER_ENTITY_TYPE, entityId: targetId, at: AT2, actor: { principalId: restorerId } });

  assert.equal(outcome, "restored");
  assert.deepEqual(principalRow(f, targetId), { status: "active", disabledAt: null });
  assert.equal(roleCount(f, targetId), 1);

  const events = outboxEventsNamed(f, "identity.user.restored");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    actorId: restorerId,
    payload: { principalId: targetId, username: "departing", restoredStatus: "active" },
  });
});

test("restore: a user who was already disabled before being trashed comes back disabled, not active", async () => {
  const f = await setup(WS);
  const targetId = await createBareUser(f, "departing");
  const before = await f.identity.repos.principals.findById({ workspaceId: WS, id: targetId });
  assert.ok(before);
  await f.identity.repos.principals.save({ ...before, status: "disabled", disabledAt: AT });
  await f.trash.trash({
    workspaceId: WS,
    entityType: USER_ENTITY_TYPE,
    entityId: targetId,
    actor: { principalId: f.ownerPrincipalId },
    display: { title: "departing" },
    at: AT,
    expectedVersion: null,
  });

  const outcome = await f.trash.restore({ workspaceId: WS, entityType: USER_ENTITY_TYPE, entityId: targetId, at: AT2, actor: { principalId: f.ownerPrincipalId } });

  assert.equal(outcome, "restored");
  assert.equal(principalRow(f, targetId)?.status, "disabled");
});

test("purgeSelected: removes the principal's identity rows across every table and records identity.user.deleted with reason 'manual'", async () => {
  const f = await setup(WS);
  const targetId = await createBareUser(f, "departing");
  const ownerRole = await f.identity.repos.roles.findByName({ workspaceId: WS, name: "owner" });
  assert.ok(ownerRole);
  await assignRole({ deps: f.identity, input: { workspaceId: WS, callerPrincipalId: f.ownerPrincipalId, principalId: targetId, roleId: ownerRole.id } });
  await f.trash.trash({
    workspaceId: WS,
    entityType: USER_ENTITY_TYPE,
    entityId: targetId,
    actor: { principalId: f.ownerPrincipalId },
    display: { title: "departing" },
    at: AT,
    expectedVersion: null,
  });
  const item = await trashItemRow(f, targetId);
  assert.ok(item);

  const report = await f.trash.purgeSelected({ workspaceId: WS, ids: [item.id], actor: { principalId: f.ownerPrincipalId }, authorizeItem: async () => true });

  assert.equal(report.purged, 1);
  assert.equal(await f.identity.repos.principals.findById({ workspaceId: WS, id: targetId }), null);
  assert.equal(await f.identity.repos.users.findByUsername({ workspaceId: WS, username: "departing" }), null);
  for (const table of ["principal_roles", "principal_policies", "sessions", "api_keys", "setting_values_user", "admin_execution_credentials"]) {
    const n = (f.db.$client.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE principal_id = ?`).get(targetId) as { n: number }).n;
    assert.equal(n, 0, `${table} must have no rows left for the purged principal`);
  }

  const events = outboxEventsNamed(f, "identity.user.deleted");
  assert.equal(events.length, 1);
  assert.equal(events[0]!.actorId, f.ownerPrincipalId);
  assert.equal((events[0]!.payload as { reason?: string }).reason, "manual");
});

test("sweeper: purges a user past its retention window and records identity.user.deleted with reason 'retention' and no actor", async () => {
  const f = await setup(WS);
  const targetId = await createBareUser(f, "departing");
  await f.trash.trash({
    workspaceId: WS,
    entityType: USER_ENTITY_TYPE,
    entityId: targetId,
    actor: { principalId: f.ownerPrincipalId },
    display: { title: "departing" },
    at: AT,
    expectedVersion: null,
  });
  const purgeAfter = computePurgeAfter(AT);

  // A distinctly-prefixed id generator: `f`'s own adapter (used above for `trash()`) already
  // produced an "id-1" event, and the sweep's purge-time event must not collide with it.
  let sweepSeq = 0;
  const sweepIdGen = { next: () => `sweep-id-${++sweepSeq}` };
  const adapters = new Map<string, TrashAdapter>([[USER_ENTITY_TYPE, createUserTrashAdapter({ db: f.db, purge: f.wiring.userPurge, idGen: sweepIdGen, clock: { nowIso: () => purgeAfter } })]]);
  const sweep = createTrashSweep({
    repo: new SqliteTrashRepo(f.db.$client),
    adapters,
    transaction: createContentDbTransactionRunner(f.db.$client),
  });
  const report = await sweep({ now: purgeAfter, leaseOwner: "sweeper-1", leaseUntil: purgeAfter, limit: 10 });

  assert.equal(report.purged, 1);
  assert.equal(await f.identity.repos.principals.findById({ workspaceId: WS, id: targetId }), null);

  const events = outboxEventsNamed(f, "identity.user.deleted");
  assert.equal(events.length, 1);
  assert.equal(events[0]!.actorId, null);
  assert.equal((events[0]!.payload as { reason?: string }).reason, "retention");
});

test("purge: an active principal (a forged/stale index row) is refused as version-changed — nothing is deleted", async () => {
  const f = await setup(WS);
  const targetId = await createBareUser(f, "still-active");
  // Forge a trashed_items row for a principal that was never actually hidden — the index and the
  // domain row have drifted apart, which purge must detect rather than trust.
  const repo = new SqliteTrashRepo(f.db.$client);
  await repo.insert({
    id: "forged-row",
    workspaceId: WS,
    entityType: USER_ENTITY_TYPE,
    entityId: targetId,
    trashedAt: AT,
    purgeAfter: computePurgeAfter(AT),
    actorPrincipalId: f.ownerPrincipalId,
    actorPluginId: null,
    displayTitle: "still-active",
    displaySubtitle: null,
    entityVersion: null,
    priorMarker: "active",
  });

  const report = await f.trash.purgeSelected({ workspaceId: WS, ids: ["forged-row"], actor: { principalId: f.ownerPrincipalId }, authorizeItem: async () => true });

  assert.deepEqual(report.results, [{ id: "forged-row", outcome: "version-changed" }]);
  assert.equal(report.purged, 0);
  assert.notEqual(await f.identity.repos.principals.findById({ workspaceId: WS, id: targetId }), null);
});

test("purge: an outbox insert that collides on id throws, rolling back the principal delete and leaving the trash row in place", async () => {
  // A fixed idGen forces the SAME event id to be used for the trash-time event AND the purge-time
  // event, so the purge's own outbox insert collides on `outbox_events`'s primary key and throws —
  // the deterministic way to reproduce "the outbox insert fails" without reaching into SQLite
  // internals.
  const fixedIdGen = { next: () => "fixed-event-id" };
  const f = await setup(WS, fixedIdGen);
  const targetId = await createBareUser(f, "departing");
  await f.trash.trash({
    workspaceId: WS,
    entityType: USER_ENTITY_TYPE,
    entityId: targetId,
    actor: { principalId: f.ownerPrincipalId },
    display: { title: "departing" },
    at: AT,
    expectedVersion: null,
  });
  const item = await trashItemRow(f, targetId);
  assert.ok(item);

  await assert.rejects(
    f.trash.purgeSelected({ workspaceId: WS, ids: [item.id], actor: { principalId: f.ownerPrincipalId }, authorizeItem: async () => true })
  );

  assert.notEqual(await f.identity.repos.principals.findById({ workspaceId: WS, id: targetId }), null, "the principal delete must have rolled back");
  assert.ok(await trashItemRow(f, targetId), "the trash row must still be there — purge never completed");
});

test("mayActOnEntityType('user'): a principal holding only 'user.manage' is refused; the owner ('*') is allowed", async () => {
  const f = await setup(WS);
  const editorId = await createBareUser(f, "editor");
  await grantDirectPermission(f, editorId, "user.manage", "editor");

  const editorDecision = await mayActOnEntityType(
    { authorize: f.wiring.authorize, workspaceId: WS, registry: f.registry },
    { principalId: editorId, entityType: USER_ENTITY_TYPE }
  );
  assert.equal(editorDecision.allowed, false);

  const ownerDecision = await mayActOnEntityType(
    { authorize: f.wiring.authorize, workspaceId: WS, registry: f.registry },
    { principalId: f.ownerPrincipalId, entityType: USER_ENTITY_TYPE }
  );
  assert.equal(ownerDecision.allowed, true);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConfirmOnlyHooks,
  buildGatewayDeps,
  buildOwnerOnlyInstanceAuthorize,
  planHashOf,
  resolveActorClassIdentity,
} from "../../composition.js";

/**
 * @file Direct/isolated unit coverage for `composition.ts`'s composition-root primitives —
 * `buildOwnerOnlyInstanceAuthorize`, `buildGatewayDeps`, `planHashOf`,
 * `resolveActorClassIdentity`, and `buildConfirmOnlyHooks`. Every one of these is also exercised
 * transitively through `src/server`/`src/features/{database,recovery,taxonomy}` composition roots
 * and their route tests (out of this repo area's own test scope), but per this file's own
 * established pattern (`gateway.unit.test.ts`'s "Instance scope" section covers
 * `buildOwnerOnlyInstanceAuthorize` composed through the gateway; this file isolates the primitive
 * itself), each generic `core/gated-mutations`-owned primitive gets its own direct, isolated test
 * here too — independent of whatever a specific ceremony's route wiring happens to exercise.
 */

test("grants every permission to exactly the resolved owner principal", async () => {
  const authorizeInstance = buildOwnerOnlyInstanceAuthorize({ ownerPrincipalId: Promise.resolve("owner-1") });

  const result = await authorizeInstance({ principalId: "owner-1", permission: "database.migrate" });

  assert.deepEqual(result, { allowed: true, reason: "owner_wildcard" });
});

test("denies a non-owner principal, even a workspace-scoped admin holding the same permission string", async () => {
  const authorizeInstance = buildOwnerOnlyInstanceAuthorize({ ownerPrincipalId: Promise.resolve("owner-1") });

  const result = await authorizeInstance({ principalId: "workspace-admin-1", permission: "database.migrate" });

  assert.deepEqual(result, { allowed: false, reason: "not_instance_owner" });
});

test("is agnostic to the requested permission string — the owner is granted, and a non-owner is denied, regardless of which permission is asked for", async () => {
  const authorizeInstance = buildOwnerOnlyInstanceAuthorize({ ownerPrincipalId: Promise.resolve("owner-1") });

  const ownerResult = await authorizeInstance({ principalId: "owner-1", permission: "taxonomy.mergeTerm" });
  const otherResult = await authorizeInstance({ principalId: "someone-else", permission: "recovery.restore" });

  assert.equal(ownerResult.allowed, true);
  assert.equal(otherResult.allowed, false);
});

test("resolves ownerPrincipalId fresh on every call, matching identity.ownerPrincipalId's fire-and-forget promise shape", async () => {
  let resolveOwner: (id: string) => void = () => {};
  const ownerPrincipalId = new Promise<string>((resolve) => {
    resolveOwner = resolve;
  });
  const authorizeInstance = buildOwnerOnlyInstanceAuthorize({ ownerPrincipalId });

  const pending = authorizeInstance({ principalId: "owner-1", permission: "database.migrate" });
  resolveOwner("owner-1");

  assert.deepEqual(await pending, { allowed: true, reason: "owner_wildcard" });
});

test("buildGatewayDeps passes clock/idGen/authorize through unchanged and attaches a fresh, empty token store", async () => {
  const clock = { nowIso: () => "2026-08-21T00:00:00.000Z" };
  const idGen = { newId: () => "id-1" };
  const authorize = async () => ({ allowed: true, reason: "ok" });

  const deps = buildGatewayDeps({ clock, idGen, authorize });

  assert.equal(deps.clock, clock, "clock must be the same reference, not a copy");
  assert.equal(deps.idGen, idGen, "idGen must be the same reference, not a copy");
  assert.equal(deps.authorize, authorize, "authorize must be the same reference, not a copy");
  assert.equal(deps.authorizeInstance, undefined, "omitted authorizeInstance stays undefined");
  assert.equal(await deps.tokens.count(), 0, "a freshly built token store starts empty");
});

test("buildGatewayDeps passes authorizeInstance through when supplied", () => {
  const clock = { nowIso: () => "2026-08-21T00:00:00.000Z" };
  const idGen = { newId: () => "id-1" };
  const authorize = async () => ({ allowed: true, reason: "ok" });
  const authorizeInstance = async () => ({ allowed: true, reason: "owner_wildcard" });

  const deps = buildGatewayDeps({ clock, idGen, authorize, authorizeInstance });

  assert.equal(deps.authorizeInstance, authorizeInstance);
});

test("buildGatewayDeps builds an independent token store per call", async () => {
  const clock = { nowIso: () => "2026-08-21T00:00:00.000Z" };
  const idGen = { newId: () => "id-1" };
  const authorize = async () => ({ allowed: true, reason: "ok" });

  const first = buildGatewayDeps({ clock, idGen, authorize });
  const second = buildGatewayDeps({ clock, idGen, authorize });
  await first.tokens.save({
    confirmationToken: "tok-1",
    domain: "database.migrate",
    planId: "plan-1",
    planHash: "hash-1",
    mintedAt: "2026-08-21T00:00:00.000Z",
    expiresAt: "2026-08-21T00:10:00.000Z",
    status: "minted",
    principalId: "user-1",
    scopeId: "instance",
  } as never);

  assert.equal(await first.tokens.count(), 1);
  assert.equal(await second.tokens.count(), 0, "the second call's store must not share state with the first");
});

test("planHashOf is a deterministic sha256 hex digest of the JSON-stable details object", () => {
  const details = { entityType: "post", entityId: "post-1", fields: ["title", "slug"] };

  const hash = planHashOf(details);

  assert.equal(hash, "082b7f7757490eadda6039582c61ce457c9439967c69a448ce17c7b078a0e1c8");
  assert.equal(hash.length, 64, "sha256 hex digest is always 64 characters");
});

test("planHashOf produces the same hash for the same details object called twice (re-derivation for PLAN_STALE checks)", () => {
  const details = { a: 1, b: 2 };

  assert.equal(planHashOf(details), planHashOf({ a: 1, b: 2 }));
});

test("planHashOf produces a different hash when the details object differs", () => {
  assert.notEqual(planHashOf({ a: 1 }), planHashOf({ a: 2 }));
});

test("resolveActorClassIdentity returns principalId unconditionally, regardless of principalKind", async () => {
  assert.equal(
    await resolveActorClassIdentity({ principalId: "user-1", principalKind: "user" }),
    "user-1"
  );
  assert.equal(
    await resolveActorClassIdentity({ principalId: "agent-1", principalKind: "agent" }),
    "agent-1"
  );
  assert.equal(
    await resolveActorClassIdentity({ principalId: "key-1", principalKind: "api_key" }),
    "key-1"
  );
});

test("buildConfirmOnlyHooks passes domain/permissions/scopeId through and defaults scopeKind to undefined", () => {
  const hooks = buildConfirmOnlyHooks({
    domain: "database.migrate",
    readPermission: "database.migrate.read",
    mutatePermission: "database.migrate",
    scopeId: "instance",
  });

  assert.equal(hooks.domain, "database.migrate");
  assert.equal(hooks.readPermission, "database.migrate.read");
  assert.equal(hooks.mutatePermission, "database.migrate");
  assert.equal(hooks.scopeId, "instance");
  assert.equal(hooks.scopeKind, undefined);
  assert.equal(hooks.resolveActorClassIdentity, resolveActorClassIdentity);
});

test("buildConfirmOnlyHooks passes scopeKind through when supplied", () => {
  const hooks = buildConfirmOnlyHooks({
    domain: "recovery.restore",
    readPermission: "recovery.restore.read",
    mutatePermission: "recovery.restore",
    scopeId: "instance",
    scopeKind: "instance",
  });

  assert.equal(hooks.scopeKind, "instance");
});

test("buildConfirmOnlyHooks's computePlan throws a tripwire error if gateway.ts ever calls it", async () => {
  const hooks = buildConfirmOnlyHooks({
    domain: "taxonomy.mergeTerm",
    readPermission: "taxonomy.read",
    mutatePermission: "taxonomy.mergeTerm",
    scopeId: "ws-1",
  });

  await assert.rejects(() => hooks.computePlan(), {
    message: "computePlan is not invoked by gateway.ts's confirm() — this hooks object is confirm-only",
  });
});

test("buildConfirmOnlyHooks's executeMutation throws a tripwire error if gateway.ts ever calls it", async () => {
  const hooks = buildConfirmOnlyHooks({
    domain: "taxonomy.mergeTerm",
    readPermission: "taxonomy.read",
    mutatePermission: "taxonomy.mergeTerm",
    scopeId: "ws-1",
  });

  await assert.rejects(() => hooks.executeMutation(), {
    message: "executeMutation is not invoked by gateway.ts's confirm() — this hooks object is confirm-only",
  });
});

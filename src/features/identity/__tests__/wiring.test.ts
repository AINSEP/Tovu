import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "../../../platform/db/sqlite/content-db.js";
// Side-effect import: registers the real BASE_CATALOG + the real permission-migration pairs
// (navigation.manage -> admin.menus.*, integration.manage -> admin.integrations.manage) before
// the tests below run. Reaches the barrel rather than `permissions.ts` directly because the
// package does not publish that module as its own subpath; loading the barrel loads it.
import "@jini-ai/cms/identity";
import { createInMemoryIdentityRouteDeps, createSqliteIdentityRouteDeps } from "../wiring.js";

const WORKSPACE = "workspace-1";
const fixedClock = { nowIso: () => "2026-07-14T00:00:00.000Z" };

function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

test("createInMemoryIdentityRouteDeps: identityReady also runs migrateDeprecatedPermissionGrants against real registered pairs (ADR-PIPE-012 T013)", async () => {
  const deps = createInMemoryIdentityRouteDeps({
    workspaceId: WORKSPACE,
    clock: fixedClock,
    idGen: counterIdGen(),
  });

  // Simulates a pre-existing policy holding both deprecated flat strings, seeded directly
  // against the same repos this wiring exposes — before identityReady resolves.
  await deps.policyRepo.save({
    id: "policy-legacy",
    workspaceId: WORKSPACE,
    name: "legacy-policy",
    isBuiltin: false,
    isFrozen: false,
  });
  await deps.policyPermissionRepo.save({
    id: "grant-legacy-navigation",
    workspaceId: WORKSPACE,
    policyId: "policy-legacy",
    permission: "navigation.manage",
  });
  await deps.policyPermissionRepo.save({
    id: "grant-legacy-integration",
    workspaceId: WORKSPACE,
    policyId: "policy-legacy",
    permission: "integration.manage",
  });

  await deps.identityReady;

  const grants = await deps.policyPermissionRepo.listByPolicyId({
    workspaceId: WORKSPACE,
    policyId: "policy-legacy",
  });
  const permissions = grants.map((g) => g.permission);

  assert.ok(permissions.includes("navigation.manage"), "old grant never removed");
  assert.ok(permissions.includes("integration.manage"), "old grant never removed");
  assert.ok(permissions.includes("admin.integrations.manage"), "Integrations migration ran");
  for (const menusPermission of [
    "admin.menus.read",
    "admin.menus.create",
    "admin.menus.update",
    "admin.menus.delete",
    "admin.menus.delete.force",
    "admin.menus.assign",
  ]) {
    assert.ok(permissions.includes(menusPermission), `Menus migration granted ${menusPermission}`);
  }
});

/**
 * `buildIdentityRouteDeps`'s own `authorize` closure -- the RBAC gate route handlers actually
 * call -- had never been invoked through the wiring layer itself; only `authorizeCore` in
 * isolation and the full HTTP-route path are covered elsewhere. This proves the closure threads
 * `principalId`/`permission`/`context` through to the SAME repos this wiring bound it to, for
 * both the allow and the fail-closed-deny outcome.
 */
test("createInMemoryIdentityRouteDeps: the wired authorize() closure grants the seeded owner's wildcard and fails closed for an unknown principal", async () => {
  const deps = createInMemoryIdentityRouteDeps({
    workspaceId: WORKSPACE,
    clock: fixedClock,
    idGen: counterIdGen(),
  });
  await deps.identityReady;
  const ownerPrincipalId = await deps.ownerPrincipalId;

  const ownerDecision = await deps.authorize({
    principalId: ownerPrincipalId,
    permission: "content.read",
    workspaceId: WORKSPACE,
  });
  assert.deepEqual(ownerDecision, { allowed: true, reason: "owner_wildcard" });

  const unknownDecision = await deps.authorize({
    principalId: "principal-does-not-exist",
    permission: "content.read",
    workspaceId: WORKSPACE,
  });
  assert.deepEqual(unknownDecision, { allowed: false, reason: "principal_disabled" });
});

test("createInMemoryIdentityRouteDeps: identityReady resolves even with no pre-existing legacy grants (no-op case)", async () => {
  const deps = createInMemoryIdentityRouteDeps({
    workspaceId: "workspace-2",
    clock: fixedClock,
    idGen: counterIdGen(),
  });

  await assert.doesNotReject(() => deps.identityReady);
});

test("createSqliteIdentityRouteDeps: a session survives a simulated restart (fresh wiring call against the same content.db file)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-identity-wiring-test-"));
  const dbPath = join(dir, "content.db");
  try {
    const ws = "workspace-restart-test";

    // "First boot."
    const db1 = openContentDb(dbPath);
    const first = createSqliteIdentityRouteDeps({ db: db1, workspaceId: ws, clock: fixedClock, idGen: counterIdGen() });
    await first.identityReady;

    const ownerBefore = await first.userRepo.findByUsername({ workspaceId: ws, username: "admin" });
    assert.ok(ownerBefore, "owner user was seeded on first boot");

    await first.sessionRepo.save({
      id: "session-1",
      workspaceId: ws,
      principalId: ownerBefore!.principalId,
      tokenHash: "fixed-token-hash",
      createdAt: fixedClock.nowIso(),
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    // "Restart": a brand-new content.db handle + a brand-new createSqliteIdentityRouteDeps call
    // against the SAME on-disk file — this is exactly what `tsx watch` does to the real process.
    const db2 = openContentDb(dbPath);
    const second = createSqliteIdentityRouteDeps({ db: db2, workspaceId: ws, clock: fixedClock, idGen: counterIdGen() });
    await second.identityReady;

    const ownerAfter = await second.userRepo.findByUsername({ workspaceId: ws, username: "admin" });
    assert.equal(
      ownerAfter?.principalId,
      ownerBefore!.principalId,
      "seedIdentity's idempotency check reuses the SAME principal id across restarts, not a fresh random one"
    );

    const sessionAfter = await second.sessionRepo.findByTokenHash({ workspaceId: ws, tokenHash: "fixed-token-hash" });
    assert.ok(sessionAfter, "the session persisted across the simulated restart");
    assert.equal(
      sessionAfter?.principalId,
      ownerAfter?.principalId,
      "the persisted session still points at a real, current principal — not orphaned"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

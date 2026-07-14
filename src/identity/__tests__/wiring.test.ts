import assert from "node:assert/strict";
import test from "node:test";

// Side-effect import: registers the real BASE_CATALOG + the real permission-migration pairs
// (navigation.manage -> admin.menus.*, integration.manage -> admin.integrations.manage) before
// the tests below run.
import "../permissions";
import { createInMemoryIdentityRouteDeps } from "../wiring";

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

test("createInMemoryIdentityRouteDeps: identityReady resolves even with no pre-existing legacy grants (no-op case)", async () => {
  const deps = createInMemoryIdentityRouteDeps({
    workspaceId: "workspace-2",
    clock: fixedClock,
    idGen: counterIdGen(),
  });

  await assert.doesNotReject(() => deps.identityReady);
});

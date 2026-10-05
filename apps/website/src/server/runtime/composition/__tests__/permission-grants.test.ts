import assert from "node:assert/strict";
import test from "node:test";

import { createPermissionMigrationRegistry } from "@jini-ai/user-management/server";

import { createPermissionGrantRegistry } from "#src/features/identity/permission-grants";
import { createInMemoryIdentityRouteDeps } from "#src/features/identity/wiring";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";

/**
 * Which grants boot reconciles must come only from the registry the composition root passes in,
 * never from which feature modules this process happened to import. Before the explicit registry,
 * a process that imported only the identity wiring reconciled against an empty module-scope
 * registry (all six grants below missing), and dynamically importing `features/pages/permissions`
 * added `pages.edit_html` to every later boot in the same process.
 */

const fixedClock = { nowIso: () => "2026-10-04T00:00:00.000Z", nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") };

function counterIdGen() {
  let n = 0;
  return { newId: () => `grant-id-${++n}` };
}

/** Grants only a registered host grant can deliver; none is in the library's admin seed list. */
const HOST_ADMIN_GRANTS = [
  "pages.edit_html",
  "admin.security.site-key.manage",
  "publish_content.read",
  "publish_content.apply",
  "publish.backstop",
  "fs_files.custom_root.manage",
] as const;

async function adminBuiltinPermissions(
  workspaceId: string,
  permissionGrants: ReturnType<typeof createPermissionGrantRegistry>
): Promise<string[]> {
  const deps = createInMemoryIdentityRouteDeps({ permissionGrants, workspaceId, clock: fixedClock, idGen: counterIdGen() });
  await deps.identityReady;
  const policy = await deps.policyRepo.findByName({ workspaceId, name: "admin-builtin-policy" });
  assert.ok(policy, "seedIdentity must have created the built-in admin policy");
  return (await deps.policyPermissionRepo.listByPolicyId({ workspaceId, policyId: policy.id })).map((row) => row.permission);
}

test("boot with the app's registry grants every host admin permission", async () => {
  const held = await adminBuiltinPermissions("ws-app-registry", createAppPermissionGrants({}));
  assert.deepEqual(HOST_ADMIN_GRANTS.filter((permission) => !held.includes(permission)), []);
});

test("importing feature permission modules registers nothing: a fresh registry still holds only the library built-ins", async () => {
  await import("#src/features/pages/permissions");
  await import("#src/features/identity/site-key-permission");
  await import("#src/features/publish-content/permissions");
  await import("#src/features/fs-files/custom-root-permission");

  const fresh = createPermissionGrantRegistry({});
  assert.deepEqual(fresh.roleGrants.list({}), []);
  assert.deepEqual(fresh.migrations.list({}), createPermissionMigrationRegistry({}).list({}));

  const held = await adminBuiltinPermissions("ws-empty-registry", fresh);
  assert.deepEqual(HOST_ADMIN_GRANTS.filter((permission) => held.includes(permission)), []);
});

test("two app registries are independent: registering on one never reaches the other", () => {
  const first = createAppPermissionGrants({});
  const second = createAppPermissionGrants({});
  first.roleGrants.register({ role: "admin", permission: "test.only-first", reason: "isolation" });
  first.migrations.register({ from: "test.only-first.old", to: ["test.only-first.new"], reason: "isolation" });
  assert.equal(second.roleGrants.list({}).some((grant) => grant.permission === "test.only-first"), false);
  assert.equal(second.migrations.list({}).some((migration) => migration.from === "test.only-first.old"), false);
});

test("the site-key rename migration keeps admin.security.tokens.manage -> admin.security.site-key.manage", () => {
  const migration = createAppPermissionGrants({}).migrations.list({}).find((m) => m.from === "admin.security.tokens.manage");
  assert.deepEqual(migration?.to, ["admin.security.site-key.manage"]);
});

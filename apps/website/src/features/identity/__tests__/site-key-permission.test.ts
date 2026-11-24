import { contentKernel } from "#src/platform/db/content-kernel";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { DEFAULT_OWNER_CREDENTIALS, createSqliteIdentityRouteDeps } from "../wiring.js";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";

/**
 * @file The host binding of `@jini-ai/user-management/identity/site-key-permission`: the app's real
 * registry passes this product's own site-key env var name (K3), and a real SQLite `identityReady`
 * boot reconciles the grant. The permission chain itself (editor/viewer refused, admin granted in
 * both vintages) is certified next to the module in Jini.
 */

const APP_PERMISSION_GRANTS = createAppPermissionGrants({});
const SITE_KEY_MANAGE = "admin.security.site-key.manage";
const INTEGRATIONS_MANAGE = "admin.integrations.manage";
const WORKSPACE = "ws-site-key-privilege";
const clock = { nowIso: () => "2026-09-09T00:00:00.000Z", nowMs: () => Date.parse("2026-09-09T00:00:00.000Z") };

function counterIdGen(prefix: string) {
  let n = 0;
  return { newId: () => `${prefix}-${++n}` };
}

test("real identityReady boot restores token-management access in a workspace lacking the integrations anchor", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "site-key-boot-"));
  const db = openContentDb(join(dir, "content.db"));
  t.after(() => { db.$client.close(); rmSync(dir, { recursive: true, force: true }); });
  const idGen = counterIdGen("boot");
  const setup = createSqliteIdentityRouteDeps({ ownerCredentials: DEFAULT_OWNER_CREDENTIALS, permissionGrants: createAppPermissionGrants({}), db: contentKernel({ store: db }), workspaceId: WORKSPACE, clock, idGen, reconcileGrantsOnBoot: false });
  await setup.identityReady;
  const policy = await setup.policyRepo.findByName({ workspaceId: WORKSPACE, name: "admin-builtin-policy" });
  const role = await setup.roleRepo.findByName({ workspaceId: WORKSPACE, name: "admin" });
  assert.ok(policy);
  assert.ok(role);
  for (const row of await setup.policyPermissionRepo.listByPolicyId({ workspaceId: WORKSPACE, policyId: policy.id })) {
    if (row.permission === INTEGRATIONS_MANAGE || row.permission === SITE_KEY_MANAGE) {
      await setup.policyPermissionRepo.delete({ workspaceId: WORKSPACE, id: row.id });
    }
  }
  await setup.principalRepo.save({ id: "vintage-admin", workspaceId: WORKSPACE, kind: "user", displayName: "Vintage admin", status: "active", createdAt: clock.nowIso() });
  await setup.principalRoleRepo.save({ id: "vintage-role", workspaceId: WORKSPACE, principalId: "vintage-admin", roleId: role.id });
  const request = { workspaceId: WORKSPACE, principalId: "vintage-admin", permission: "admin.security.site-key.manage" };
  assert.deepEqual(await setup.authorize(request), { allowed: false, reason: "no_grant" });
  const boot = createSqliteIdentityRouteDeps({ ownerCredentials: DEFAULT_OWNER_CREDENTIALS, permissionGrants: createAppPermissionGrants({}), db: contentKernel({ store: db }), workspaceId: WORKSPACE, clock, idGen });
  await boot.identityReady;
  assert.deepEqual(await boot.authorize(request), { allowed: true, reason: "matched" });
  const grants = await boot.policyPermissionRepo.listByPolicyId({ workspaceId: WORKSPACE, policyId: policy.id });
  assert.equal(grants.some((row) => row.permission === INTEGRATIONS_MANAGE), false);
});

test("K3 pin: the app registry names the host's own site key in the migration reason, byte-for-byte", () => {
  const migration = APP_PERMISSION_GRANTS.migrations.list({}).find((row) => row.from === INTEGRATIONS_MANAGE && row.to.includes(SITE_KEY_MANAGE));
  assert.equal(migration?.reason,
    "The admin Security page's Site key tab reads/generates the TOVU_SITE_KEY " +
    "site key — the key that decrypts every sealed credential this install holds, including " +
    "every connection admin.integrations.manage already protects. Every principal already " +
    "trusted with integration connection config inherits site key management too.");
});

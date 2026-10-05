import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createSqliteIdentityRouteDeps } from "#src/features/identity/wiring";
// The app's explicit grant registry (`registerPublishContentPermissionGrants` registers the Task 9
// grants under test) — reached without the `publish-content` server module, which would drag in
// every route's Express wiring just for this.
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";

// A reproducible already-seeded workspace with publishing grants explicitly absent.
const WORKSPACE_ID = "workspace-publish-permissions";

const PUBLISH_CONTENT_READ = "publish_content.read";
const PUBLISH_CONTENT_APPLY = "publish_content.apply";

const fixedClock = { nowIso: () => "2026-09-18T00:00:00.000Z" };

function counterIdGen(prefix: string) {
  let n = 0;
  return { newId: () => `${prefix}-${++n}` };
}

async function createSeededContentDb(): Promise<{ dir: string; dbPath: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-content-perm-boot-test-"));
  const dbPath = path.join(dir, "content.db");
  const db = openContentDb(dbPath);
  try {
    const setup = createSqliteIdentityRouteDeps({ permissionGrants: createAppPermissionGrants({}), db, workspaceId: WORKSPACE_ID,
      clock: fixedClock, idGen: counterIdGen("seed"), reconcileGrantsOnBoot: false });
    await setup.identityReady;
    const admin = await setup.policyRepo.findByName({ workspaceId: WORKSPACE_ID, name: "admin-builtin-policy" });
    assert.ok(admin);
    const grants = await setup.policyPermissionRepo.listByPolicyId({ workspaceId: WORKSPACE_ID, policyId: admin.id });
    for (const grant of grants) {
      if ([PUBLISH_CONTENT_READ, PUBLISH_CONTENT_APPLY].includes(grant.permission)) {
        await setup.policyPermissionRepo.delete({ workspaceId: WORKSPACE_ID, id: grant.id });
      }
    }
    const before = await permissionsOfBuiltinPolicy(setup, "admin-builtin-policy");
    assert.equal(before.includes(PUBLISH_CONTENT_READ), false);
    assert.equal(before.includes(PUBLISH_CONTENT_APPLY), false);
    return { dir, dbPath };
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  } finally {
    db.$client.close();
  }
}

async function bootSeededContentDb(dbPath: string, idPrefix: string) {
  const db = openContentDb(dbPath);
  const deps = createSqliteIdentityRouteDeps({ permissionGrants: createAppPermissionGrants({}), db, workspaceId: WORKSPACE_ID,
    clock: fixedClock, idGen: counterIdGen(idPrefix) });
  try {
    await deps.identityReady;
    return { ...deps, close: () => { if (db.$client.open) db.$client.close(); } };
  } catch (error) {
    db.$client.close();
    throw error;
  }
}

async function permissionsOfBuiltinPolicy(
  deps: ReturnType<typeof createSqliteIdentityRouteDeps>,
  policyName: string
): Promise<string[]> {
  const policy = await deps.policyRepo.findByName({ workspaceId: WORKSPACE_ID, name: policyName });
  assert.ok(policy, `the seeded content.db must have a '${policyName}' row`);
  const grants = await deps.policyPermissionRepo.listByPolicyId({
    workspaceId: WORKSPACE_ID,
    policyId: policy.id,
  });
  return grants.map((row) => row.permission);
}

test("booting against a seeded content.db with no publishing grants adds publish_content.read and publish_content.apply to admin", async (t) => {
  const { dir, dbPath } = await createSeededContentDb();
  try {
    const deps = await bootSeededContentDb(dbPath, "boot");
    t.after(() => deps.close());

    const adminPermissions = await permissionsOfBuiltinPolicy(deps, "admin-builtin-policy");

    assert.ok(
      adminPermissions.includes(PUBLISH_CONTENT_READ),
      "admin must hold publish_content.read after boot reconciles the seeded content.db"
    );
    assert.ok(
      adminPermissions.includes(PUBLISH_CONTENT_APPLY),
      "admin must hold publish_content.apply after boot reconciles the seeded content.db"
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("editor and viewer do NOT gain publish_content.read or publish_content.apply", async (t) => {
  const { dir, dbPath } = await createSeededContentDb();
  try {
    const deps = await bootSeededContentDb(dbPath, "boot");
    t.after(() => deps.close());

    for (const policyName of ["editor-builtin-policy", "viewer-builtin-policy"]) {
      const permissions = await permissionsOfBuiltinPolicy(deps, policyName);
      assert.ok(
        !permissions.includes(PUBLISH_CONTENT_READ),
        `${policyName} must NOT gain publish_content.read`
      );
      assert.ok(
        !permissions.includes(PUBLISH_CONTENT_APPLY),
        `${policyName} must NOT gain publish_content.apply`
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("boot's authorize callback permits admin and refuses editor and viewer publishing", async (t) => {
  const { dir, dbPath } = await createSeededContentDb();
  const deps = await bootSeededContentDb(dbPath, "boot");
  t.after(() => { deps.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const roles = await deps.roleRepo.list({ workspaceId: WORKSPACE_ID });
  for (const name of ["admin", "editor", "viewer"] as const) {
    const role = roles.find((r) => r.name === name);
    assert.ok(role);
    const principalId = `principal-${name}`;
    await deps.principalRepo.save({ id: principalId, workspaceId: WORKSPACE_ID, kind: "user",
      displayName: name, status: "active", createdAt: fixedClock.nowIso() });
    await deps.principalRoleRepo.save({ id: `assignment-${name}`, workspaceId: WORKSPACE_ID,
      principalId, roleId: role.id });
    // Control: each principal really has a working role/policy chain.
    assert.equal((await deps.authorize({ workspaceId: WORKSPACE_ID, principalId, permission: "content.read" })).allowed, true);
    for (const permission of [PUBLISH_CONTENT_READ, PUBLISH_CONTENT_APPLY]) {
      const decision = await deps.authorize({ workspaceId: WORKSPACE_ID, principalId, permission });
      assert.equal(decision.allowed, name === "admin", `${name}: ${permission}`);
    }
  }
});

test("re-running boot against the same seeded database is idempotent — no duplicate grant rows", async (t) => {
  const { dir, dbPath } = await createSeededContentDb();
  try {
    const first = await bootSeededContentDb(dbPath, "first");
    t.after(() => first.close());
    const firstPermissions = await permissionsOfBuiltinPolicy(first, "admin-builtin-policy");
    assert.equal(firstPermissions.filter((p) => p === PUBLISH_CONTENT_READ).length, 1);
    assert.equal(firstPermissions.filter((p) => p === PUBLISH_CONTENT_APPLY).length, 1);
    first.close();

    // "Restart": a brand-new content.db handle + a brand-new createSqliteIdentityRouteDeps call
    // over the SAME, already-migrated file — same technique as `wiring.test.ts`'s own
    // simulated-restart test.
    const second = await bootSeededContentDb(dbPath, "second");
    t.after(() => second.close());

    const adminPermissions = await permissionsOfBuiltinPolicy(second, "admin-builtin-policy");
    const readCount = adminPermissions.filter((permission) => permission === PUBLISH_CONTENT_READ).length;
    const applyCount = adminPermissions.filter((permission) => permission === PUBLISH_CONTENT_APPLY).length;

    assert.equal(readCount, 1, "re-running boot must not duplicate the publish_content.read row");
    assert.equal(applyCount, 1, "re-running boot must not duplicate the publish_content.apply row");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

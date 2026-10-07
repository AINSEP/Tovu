import assert from "node:assert/strict";
import test from "node:test";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createUserTrashAdapter } from "../adapters/user.js";
import { SelfDeleteError, assertUserAccountAction } from "#src/features/identity/delete-user-service";
import { createInMemoryIdentityRouteDeps } from "#src/features/identity/wiring";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import { identityServiceDepsFrom } from "#src/server/inbound/admin-http/routes/users/deps";
import { createUser, assignRole } from "@jini-ai/user-management/server";
import { OwnerRequiredError } from "@jini-ai/user-management";

for (const action of ["hide", "purge"] as const) test(`user adapter ${action}: injected target guard refuses before any writes`, async () => {
  const db = openContentDb(":memory:");
  try {
    db.$client.prepare("INSERT INTO workspaces (id,name,slug,created_at) VALUES ('w','w','w','now')").run();
    db.$client.prepare("INSERT INTO principals (id,workspace_id,kind,display_name,status,created_at) VALUES ('u','w','user','admin','disabled','now')").run();
    let purged = false;
    const adapter = createUserTrashAdapter({ db, purge: { async purgeUser() { purged = true; throw new Error("must not purge"); } }, idGen: { next: () => "event" }, clock: { nowIso: () => "2026-10-07T00:00:00Z" },
      assertAccountAction: async () => { throw new SelfDeleteError("you cannot delete your own account"); },
    } as Parameters<typeof createUserTrashAdapter>[0]);
    await assert.rejects(adapter[action]({ workspaceId: "w", entityId: "u", at: "2026-10-07T00:00:00Z", expectedVersion: null }, { actor: { principalId: "u" } }), { name: "Error", message: "you cannot delete your own account" });
    assert.equal(purged, false);
    assert.equal(db.$client.prepare("SELECT status FROM principals WHERE id='u'").get()?.status, "disabled");
  } finally { db.$client.close(); }
});

for (const action of ["trash", "purge", "disable"] as const) test(`${action}: independent last active owner floor, including retention purge`, async () => {
  let n = 0;
  const workspaceId = `floor-${action}`;
  const clock = { nowMs: () => Date.parse("2026-10-07T00:00:00Z"), nowIso: () => "2026-10-07T00:00:00Z" };
  const idGen = { newId: () => `floor-${++n}` };
  const wiring = createInMemoryIdentityRouteDeps({ permissionGrants: createAppPermissionGrants({}), workspaceId, clock, idGen });
  await wiring.identityReady;
  const seeded = await wiring.ownerPrincipalId;
  const deps = identityServiceDepsFrom({ ...wiring, workspaceId, clock, idGen, principalRepo: Object.assign(wiring.principalRepo, createSettingsPrincipalLookup({ repo: wiring.principalRepo })) });
  const { principal } = await createUser({ deps, input: { workspaceId, callerPrincipalId: seeded, username: "last-owner", password: "correct-horse-battery" } });
  const owner = await wiring.roleRepo.findByName({ workspaceId, name: "owner" });
  assert.ok(owner);
  await assignRole({ deps, input: { workspaceId, callerPrincipalId: seeded, principalId: principal.id, roleId: owner.id } });
  const original = await wiring.principalRepo.findById({ workspaceId, id: seeded });
  assert.ok(original);
  await wiring.principalRepo.save({ ...original, status: "disabled" });
  await assert.rejects(assertUserAccountAction({ deps, workspaceId, principalId: principal.id, action }, action === "purge" ? {} : { callerPrincipalId: seeded }), { constructor: OwnerRequiredError, message: "the workspace must keep at least one active owner-`*` principal" });
  assert.equal((await wiring.principalRepo.findById({ workspaceId, id: principal.id }))?.status, "active");
});

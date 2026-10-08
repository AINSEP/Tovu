import { buildPermanentDeleteRegistrations } from "#src/features/permanent-delete/tool-registrations";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import type { ToolExecutionContext } from "@jini-ai/core";
import { PERMANENT_DELETE_SPECS } from "#src/features/permanent-delete/agent-tools";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createSqliteIdentityRouteDeps } from "#src/features/identity/wiring";
import { assertUserAccountAction } from "#src/features/identity/delete-user-service";
import { SqliteUserPurge } from "#src/features/identity/user-purge.sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createTrashService, bindRemoveEntity } from "@jini-ai/cms/trash";
import { createUserTrashAdapter, SqliteTrashRepo, createContentDbTransactionRunner } from "#src/features/trash/index";
import { createUser, assignRole } from "@jini-ai/user-management/server";
import { identityServiceDepsFrom } from "#src/server/inbound/admin-http/routes/users/deps";
import { registerAdminTrashPurgeRoute } from "#src/server/inbound/admin-http/routes/trash/purge";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { createAppPermissionGrants } from "../app-permission-grants.js";
import { withUserTrashAdminOverride } from "../trash-user-admin-override.js";
import { buildPermanentDeleteDeps } from "../permanent-delete-deps.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


async function setup() {
  const db = openContentDb(":memory:");
  const workspaceId = "purge-protections";
  const clock = { nowMs: () => Date.parse("2026-10-07T00:00:00Z"), nowIso: () => "2026-10-07T00:00:00.000Z" };
  let n = 0;
  const idGen = { newId: () => `purge-${++n}` };
  db.$client.prepare("INSERT INTO workspaces (id,name,slug,created_at) VALUES (?,?,?,?)").run(workspaceId, workspaceId, workspaceId, clock.nowIso());
  const identity = createSqliteIdentityRouteDeps({ db, workspaceId, clock, idGen, permissionGrants: createAppPermissionGrants({}) });
  await identity.identityReady;
  const ownerId = await identity.ownerPrincipalId;
  const service = identityServiceDepsFrom({ ...identity, clock, idGen });
  const trashRepo = new SqliteTrashRepo(db.$client);
  const adapter = createUserTrashAdapter({ db, purge: new SqliteUserPurge(db), idGen: { next: idGen.newId }, clock,
    assertAccountAction: (required, optional) => identity.transactions.run({ workspaceId, execute: () => assertUserAccountAction({ ...required, deps: service }, { ...optional, seededOwnerPrincipalId: ownerId }) }),
  });
  const trash = createTrashService({ repo: trashRepo, adapters: new Map([["user", adapter]]), idGen,
    transaction: ({ work }) => createContentDbTransactionRunner(db.$client)(work), entityPolicy: ({ entityType }) => entityType === "user" });
  const authorize = withUserTrashAdminOverride({ base: async () => ({ allowed: true, reason: "grant" }), identity: service, workspaceId, seededOwnerPrincipalId: ownerId });
  const routeDeps = { ...identity, workspaceId, clock, idGen, trash, registry: new Map(), db: db.$client, authorize };
  const permanent = buildPermanentDeleteDeps(routeDeps as unknown as Parameters<typeof buildPermanentDeleteDeps>[0]);
  const app = express();
  registerAdminTrashPurgeRoute(app, routeDeps);
  const make = async (name: string, role: "admin" | "owner" | undefined = undefined) => {
    const { principal } = await createUser({ deps: service, input: { workspaceId, callerPrincipalId: ownerId, username: name, password: "correct-horse-battery" } });
    if (role) {
      const r = await identity.roleRepo.findByName({ workspaceId, name: role });
      assert.ok(r);
      await assignRole({ deps: service, input: { workspaceId, callerPrincipalId: ownerId, principalId: principal.id, roleId: r.id } });
    }
    return principal.id;
  };
  const move = async (id: string) => {
    await bindRemoveEntity({ trash, entityType: "user" })({ workspaceId, id, at: clock.nowIso(), display: { title: id }, expectedVersion: null, actor: { principalId: ownerId } });
    const item = await trashRepo.findByEntity({ workspaceId, entityType: "user", entityId: id });
    assert.ok(item);
    return item.id;
  };
  const invoke = async (callerId: string, ids: string[]) => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: callerId };
    await extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/trash/purge")({ params: { workspaceId }, body: { ids } }, res);
    return capture;
  };
  return { db, identity, ownerId, workspaceId, make, move, invoke, permanent, trashRepo, adapter };
}

for (const kind of ["self", "admin", "owner"] as const) test(`HTTP Trash purge refuses ${kind} target for an admin; leaves identity and Trash intact`, async () => {
  const f = await setup();
  try {
    const caller = await f.make("manager", "admin");
    const target = kind === "self" ? caller : await f.make("target", kind);
    const id = await f.move(target);
    assert.deepEqual(await f.invoke(caller, [id]), { statusCode: 200, jsonBody: { purged: 0, results: [{ id, outcome: "forbidden" }] } });
    assert.ok(await f.identity.principalRepo.findById({ workspaceId: f.workspaceId, id: target }));
    assert.ok(await f.trashRepo.findByEntity({ workspaceId: f.workspaceId, entityType: "user", entityId: target }));
  } finally { f.db.$client.close(); }
});

for (const tool of ["identity_user_delete", "trash_purge_item", "trash_empty"] as const) {
  for (const kind of ["self", "admin", "owner"] as const) test(`${tool}: refuses ${kind} target before showing confirmation`, async () => {
    const f = await setup();
    try {
      const caller = await f.make("manager", "admin");
      const target = kind === "self" ? caller : await f.make("target", kind);
      const trashId = await f.move(target);
      await assert.rejects(f.permanent.prepare(tool, tool === "identity_user_delete" ? target : tool === "trash_empty" ? null : trashId, caller), {
        message: tool === "identity_user_delete" && kind === "self" ? "identity_user_delete: cannot permanently delete yourself or the seeded owner." : `${tool}: permission denied for a selected Trash item. Nothing was deleted.`,
      });
      assert.ok(await f.identity.principalRepo.findById({ workspaceId: f.workspaceId, id: target }));
    } finally { f.db.$client.close(); }
  });
}

test("owner can purge another admin; builtin admin can purge ordinary user", async () => {
  const f = await setup();
  try {
    const caller = await f.make("manager", "admin");
    const protectedTarget = await f.make("another-admin", "admin");
    const ordinary = await f.make("ordinary");
    for (const [actor, target] of [[f.ownerId, protectedTarget], [caller, ordinary]]) {
      const id = await f.move(target);
      assert.deepEqual(await f.invoke(actor, [id]), { statusCode: 200, jsonBody: { purged: 1, results: [{ id, outcome: "purged" }] } });
      assert.equal(await f.identity.principalRepo.findById({ workspaceId: f.workspaceId, id: target }), null);
    }
  } finally { f.db.$client.close(); }
});

test("purge tool rechecks target role after preparation; admin promotion invalidates consent", async () => {
  const f = await setup();
  try {
    const caller = await f.make("manager", "admin");
    const target = await f.make("ordinary");
    await f.move(target);
    const plan = await f.permanent.prepare("identity_user_delete", target, caller);
    const role = await f.identity.roleRepo.findByName({ workspaceId: f.workspaceId, name: "admin" });
    assert.ok(role);
    await f.identity.principalRoleRepo.save({ id: "promotion", workspaceId: f.workspaceId, principalId: target, roleId: role.id });
    const result = await plan.execute();
    assert.equal(result.purged, 0);
    assert.ok(await f.identity.principalRepo.findById({ workspaceId: f.workspaceId, id: target }));
  } finally { f.db.$client.close(); }
});

for (const path of ["http", "identity_user_delete", "trash_purge_item", "trash_empty", "retention"] as const) test(`${path}: stale Trash marker cannot delete the last active owner`, async () => {
  const f = await setup();
  try {
    const lastOwner = await f.make("last-owner", "owner");
    const id = await f.move(lastOwner);
    const seeded = await f.identity.principalRepo.findById({ workspaceId: f.workspaceId, id: f.ownerId });
    const last = await f.identity.principalRepo.findById({ workspaceId: f.workspaceId, id: lastOwner });
    assert.ok(seeded); assert.ok(last);
    await f.identity.principalRepo.save({ ...seeded, status: "disabled" });
    await f.identity.principalRepo.save({ ...last, status: "active" });
    if (path === "http") {
      assert.deepEqual(await f.invoke(f.ownerId, [id]), { statusCode: 200, jsonBody: { purged: 0, results: [{ id, outcome: "forbidden" }] } });
    } else if (path === "retention") {
      await assert.rejects(f.adapter.purge({ workspaceId: f.workspaceId, entityId: lastOwner, at: "2026-10-07T00:00:00Z", expectedVersion: null }), { message: "the workspace must keep at least one active owner-`*` principal" });
    } else {
      await assert.rejects(f.permanent.prepare(path, path === "identity_user_delete" ? lastOwner : path === "trash_empty" ? null : id, f.ownerId), { message: `${path}: permission denied for a selected Trash item. Nothing was deleted.` });
    }
    assert.equal((await f.identity.principalRepo.findById({ workspaceId: f.workspaceId, id: lastOwner }))?.status, "active");
  } finally { f.db.$client.close(); }
});

test("identity_user_delete catalog admits builtin admin ordinary-user management; target guard remains authoritative", () => {
  const spec = PERMANENT_DELETE_SPECS.find(s => s.name === "identity_user_delete");
  assert.ok(spec);
  assert.equal(spec.permission, "user.manage");
});

test("registered identity_user_delete admits admin ordinary target up to human confirmation, and refuses admin target", async () => {
  const f = await setup();
  try {
    const caller = await f.make("manager", "admin");
    const ordinary = await f.make("ordinary");
    const protectedTarget = await f.make("protected", "admin");
    await f.move(ordinary); await f.move(protectedTarget);
    const registrations = buildPermanentDeleteRegistrations({ ...f.permanent, authorize: f.identity.authorize }, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) });
    const registration = registrations.find(r => r.descriptor.id === "identity_user_delete");
    assert.ok(registration);
    const call = (principalId: string) => registration.handler({ principal: { id: caller }, input: { principalId }, signal: new AbortController().signal } as ToolExecutionContext);
    await assert.rejects(call(ordinary), { name: "ToolInputError", message: "PERMANENT_DELETE_NO_CONFIRMATION_CHANNEL: identity_user_delete: this execution context has no interactive confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed." });
    await assert.rejects(call(protectedTarget), { name: "ToolInputError", message: "identity_user_delete: permission denied for a selected Trash item. Nothing was deleted." });
    assert.ok(await f.identity.principalRepo.findById({ workspaceId: f.workspaceId, id: ordinary }));
  } finally { f.db.$client.close(); }
});

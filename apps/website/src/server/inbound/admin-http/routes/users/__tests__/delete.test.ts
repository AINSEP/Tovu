import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import {
  createSqliteIdentityRouteDeps,
  type IdentityRouteDepsSlice,
} from "#src/features/identity/wiring";
import { SqliteUserPurge } from "#src/features/identity/user-purge.sqlite";
import {
  bindRemoveEntity,
  createContentDbTransactionRunner,
  createTrashService,
  createUserTrashAdapter,
  SqliteTrashRepo,
  USER_ENTITY_TYPE,
  type TrashAdapter,
} from "#src/features/trash/index";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminUserDeleteRoute } from "../delete.js";
import { identityServiceDepsFrom, type UsersRouteDeps } from "../deps.js";
import { assignRole, createUser } from "@jini-ai/cms/identity";

/**
 * @file RED-first coverage for the `DELETE_USER` HTTP route (delete-user plan v2 Slice 2/3, and the
 * OWNER DECISION 2026-09-24). Built over `createSqliteIdentityRouteDeps` PLUS a real
 * `createTrashService`/`createUserTrashAdapter` (the same combination
 * `identity/__tests__/delete-user-service.test.ts` uses) — a trashed user is disabled, not deleted,
 * so this suite asserts on `trashed_items`/`principals`, not on the row being gone.
 */

const WORKSPACE_ID = "ws-delete-route";
const NOW = "2026-09-24T00:00:00.000Z";
const clock = { nowIso: () => NOW };
function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}
function counterTrashIdGen() {
  let n = 0;
  return { next: () => `trash-id-${++n}` };
}
const ROUTE_PATH = `/api/admin/v1/workspaces/:workspaceId/users/:principalId`;

function urlFor(principalId: string) {
  return `/api/admin/v1/workspaces/${WORKSPACE_ID}/users/${principalId}`;
}

/** Mounts the delete route over an already-assembled `deps` bag, authenticated as `callerId`. Kept
 *  separate from `buildApp` below so a test that needs a second caller identity against the SAME
 *  seeded database (e.g. the OWNER_REQUIRED case) can reuse one `deps`/wiring instead of standing
 *  up an unrelated second in-memory database. */
function mountApp(deps: UsersRouteDeps, callerId: string): express.Express {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: callerId };
    next();
  });
  registerAdminUserDeleteRoute(app, deps);
  return app;
}

async function buildApp(
  depsOverrides: Partial<UsersRouteDeps> = {},
  principalId?: string
): Promise<{ app: express.Express; deps: UsersRouteDeps; wiring: IdentityRouteDepsSlice; db: ContentDb; ownerId: string }> {
  const db = openContentDb(":memory:");
  db.$client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WORKSPACE_ID, WORKSPACE_ID, WORKSPACE_ID, "2026-01-01T00:00:00.000Z");
  const wiring = createSqliteIdentityRouteDeps({ db, workspaceId: WORKSPACE_ID, clock, idGen: counterIdGen() });
  await wiring.identityReady;
  const ownerId = await wiring.ownerPrincipalId;
  const callerId = principalId ?? ownerId;

  const trashRepo = new SqliteTrashRepo(db.$client);
  const adapter: TrashAdapter = createUserTrashAdapter({ db, purge: new SqliteUserPurge(db), idGen: counterTrashIdGen(), clock });
  const trash = createTrashService({
    repo: trashRepo,
    adapters: new Map<string, TrashAdapter>([[USER_ENTITY_TYPE, adapter]]),
    idGen: counterTrashIdGen(),
    transaction: createContentDbTransactionRunner(db.$client),
  });

  const deps: UsersRouteDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: wiring.authorize,
    clock,
    idGen: counterIdGen(),
    principalRepo: wiring.principalRepo,
    userRepo: wiring.userRepo,
    sessionRepo: wiring.sessionRepo,
    roleRepo: wiring.roleRepo,
    policyRepo: wiring.policyRepo,
    policyPermissionRepo: wiring.policyPermissionRepo,
    rolePolicyRepo: wiring.rolePolicyRepo,
    principalRoleRepo: wiring.principalRoleRepo,
    principalPolicyRepo: wiring.principalPolicyRepo,
    passwordHasher: wiring.passwordHasher,
    ownerPrincipalId: wiring.ownerPrincipalId,
    removeUser: bindRemoveEntity(trash, USER_ENTITY_TYPE),
    isInTrash: async (principalIdToCheck: string) =>
      (await trashRepo.findByEntity({ workspaceId: WORKSPACE_ID, entityType: USER_ENTITY_TYPE, entityId: principalIdToCheck })) !== null,
    ...depsOverrides,
  };
  const app = mountApp(deps, callerId);
  return { app, deps, wiring, db, ownerId };
}

test("DELETE_USER route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/users/some-id`, { method: "DELETE" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("DELETE_USER route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "delete", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("DELETE_USER route: 204 trashes an existing user", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const { principal: target } = await createUser({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "departing-route", password: "correct-horse-battery" },
  });

  const res = await fetch(`${baseUrl}${urlFor(target.id)}`, { method: "DELETE" });
  assert.equal(res.status, 204);
  assert.equal((await deps.principalRepo.findById({ workspaceId: WORKSPACE_ID, id: target.id }))?.status, "disabled");
  assert.equal(await deps.isInTrash!(target.id), true);
});

test("DELETE_USER route: 204 is idempotent when the target is already in the Trash", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const { principal: target } = await createUser({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "twice-trashed", password: "correct-horse-battery" },
  });

  const first = await fetch(`${baseUrl}${urlFor(target.id)}`, { method: "DELETE" });
  assert.equal(first.status, 204);
  const second = await fetch(`${baseUrl}${urlFor(target.id)}`, { method: "DELETE" });
  assert.equal(second.status, 204);
});

test("DELETE_USER route: 403 FORBIDDEN when the caller is neither the owner nor the built-in admin role", async (t) => {
  const { app, deps, ownerId } = await buildApp({}, "unauthorized-caller");
  const baseUrl = await startTestServer(app, t);
  const { principal: target } = await createUser({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "forbidden-target", password: "correct-horse-battery" },
  });

  const res = await fetch(`${baseUrl}${urlFor(target.id)}`, { method: "DELETE" });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

test("DELETE_USER route: 204 when the caller holds the built-in admin role (not owner) — OWNER DECISION 2026-09-24", async (t) => {
  const { deps, ownerId } = await buildApp();
  const svcDeps = identityServiceDepsFrom(deps);
  const { principal: adminCaller } = await createUser({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "admin-caller", password: "correct-horse-battery" },
  });
  const adminRole = await deps.roleRepo.findByName({ workspaceId: WORKSPACE_ID, name: "admin" });
  assert.ok(adminRole, "seedIdentity must have created the built-in admin role");
  await assignRole({ deps: svcDeps, input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, principalId: adminCaller.id, roleId: adminRole!.id } });
  const { principal: target } = await createUser({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "admin-target", password: "correct-horse-battery" },
  });

  const appAsAdmin = mountApp(deps, adminCaller.id);
  const baseUrl = await startTestServer(appAsAdmin, t);
  const res = await fetch(`${baseUrl}${urlFor(target.id)}`, { method: "DELETE" });
  assert.equal(res.status, 204);
});

test("DELETE_USER route: 409 SELF_DELETE when the caller targets their own principal", async (t) => {
  const { app, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor(ownerId)}`, { method: "DELETE" });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "SELF_DELETE");
});

test("DELETE_USER route: 409 OWNER_REQUIRED for the seeded owner", async (t) => {
  const { deps, ownerId } = await buildApp();
  const svcDeps = identityServiceDepsFrom(deps);
  const { principal: secondOwner } = await createUser({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "second-owner-route", password: "correct-horse-battery" },
  });
  const ownerRole = await deps.roleRepo.findByName({ workspaceId: WORKSPACE_ID, name: "owner" });
  assert.ok(ownerRole, "seedIdentity must have created the built-in owner role");
  await assignRole({ deps: svcDeps, input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, principalId: secondOwner.id, roleId: ownerRole!.id } });

  // Same deps/database, but authenticated as the freshly-minted second owner (not the seeded
  // owner) so the seeded-owner refusal is isolated from the SELF_DELETE refusal tested above.
  const appAsSecondOwner = mountApp(deps, secondOwner.id);
  const baseUrl2 = await startTestServer(appAsSecondOwner, t);

  const res = await fetch(`${baseUrl2}${urlFor(ownerId)}`, { method: "DELETE" });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "OWNER_REQUIRED");
});

test("DELETE_USER route: 404 RESOURCE_NOT_FOUND for an unknown principalId", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, { method: "DELETE" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
});

test("DELETE_USER route: 501 NOT_SUPPORTED when the composition root has no Trash wiring", async (t) => {
  const { app, deps, ownerId } = await buildApp({ removeUser: undefined });
  const baseUrl = await startTestServer(app, t);
  const { principal: target } = await createUser({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "unsupported-target", password: "correct-horse-battery" },
  });

  const res = await fetch(`${baseUrl}${urlFor(target.id)}`, { method: "DELETE" });
  assert.equal(res.status, 501);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "NOT_SUPPORTED");
});

test("DELETE_USER route: 500 internal error when an unexpected error is thrown", async (t) => {
  const throwingRepo = {
    findById: async () => {
      throw new Error("unexpected db failure");
    },
    list: async () => [],
    save: async () => {},
    delete: async () => {},
  };
  const { app } = await buildApp({ principalRepo: throwingRepo as unknown as UsersRouteDeps["principalRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-id")}`, { method: "DELETE" });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

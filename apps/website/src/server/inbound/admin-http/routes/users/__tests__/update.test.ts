import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminUserUpdateRoute } from "../update.js";
import { identityServiceDepsFrom, type UsersRouteDeps } from "../deps.js";
import { createPolicy, createRole, createUser, login, validateSession } from "@jini-ai/user-management/server";

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = `/api/admin/v1/workspaces/:workspaceId/users/:principalId`;

test("UPDATE_USER maps a missing host audit binding to 500 and leaves the username unchanged", async () => {
  const { app, deps, ownerId } = await buildApp();
  const { user } = await createUser({ deps: identityServiceDepsFrom(deps), input: {
    workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "before-wiring-fault", password: "fixture-password",
  } });
  // Deliberately bypass the required field to exercise a JavaScript host wiring fault.
  deps.outbox = undefined as unknown as UsersRouteDeps["outbox"];
  const handler = extractRouteHandler(app, "patch", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  await handler({ params: { workspaceId: WORKSPACE_ID, principalId: user.principalId }, body: { username: "after" } }, res);
  assert.equal(capture.statusCode, 500);
  assert.deepEqual(capture.jsonBody, { error: "internal error" });
  assert.deepEqual(await deps.userRepo.findByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: user.principalId }), user);
});

function urlFor(principalId: string) {
  return `/api/admin/v1/workspaces/${WORKSPACE_ID}/users/${principalId}`;
}

async function buildApp(
  depsOverrides: Partial<UsersRouteDeps> = {},
  principalId?: string
): Promise<{ app: express.Express; deps: UsersRouteDeps; ownerId: string }> {
  const base = createRouteDeps();
  await base.identityReady;
  const ownerId = await base.ownerPrincipalId;
  const callerId = principalId ?? ownerId;

  const deps: UsersRouteDeps = {
    workspaceId: base.workspaceId,
    authorize: base.authorize,
    clock: base.clock,
    idGen: base.idGen,
    principalRepo: base.principalRepo,
    userRepo: base.userRepo,
    sessionRepo: base.sessionRepo,
    roleRepo: base.roleRepo,
    policyRepo: base.policyRepo,
    policyPermissionRepo: base.policyPermissionRepo,
    rolePolicyRepo: base.rolePolicyRepo,
    principalRoleRepo: base.principalRoleRepo,
    principalPolicyRepo: base.principalPolicyRepo,
    passwordHasher: base.passwordHasher,
    transactions: base.transactions,
    tokens: base.tokens,
    ownerPrincipalId: base.ownerPrincipalId,
    isInTrash: base.isInTrash,
    outbox: base.outbox,
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: callerId };
    next();
  });
  registerAdminUserUpdateRoute(app, deps);
  return { app, deps, ownerId };
}

test("UPDATE_USER route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/users/some-id`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "x@example.com" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("UPDATE_USER route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "patch", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("UPDATE_USER route: a missing principalId reports an empty user id as not found", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "patch", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  await handler({ params: { workspaceId: WORKSPACE_ID }, body: { email: "x@example.com" } }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { code: "RESOURCE_NOT_FOUND", error: "user '' was not found" });
});

test("UPDATE_USER route: direct invoke fallback for a nullish body (`rawBody ?? {}`)", async () => {
  const { app, deps, ownerId } = await buildApp();
  const { principal: target } = await createUser({ deps: identityServiceDepsFrom(deps), input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "nullish-body-target", password: "nullish-body-target-p4ssw0rd!" } }, { email: "existing@example.com" });
  const handler = extractRouteHandler(app, "patch", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  await handler({ params: { workspaceId: WORKSPACE_ID, principalId: target.id }, body: undefined }, res);
  // No `email` survives the (undefined ?? {}) coercion, so this is a legal "leave email unchanged" PATCH.
  assert.equal(capture.statusCode, 200);
  const body = capture.jsonBody as { user: { email?: string } };
  assert.equal(body.user.email, "existing@example.com");
  assert.equal((await deps.userRepo.findByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: target.id }))?.email, "existing@example.com");
});

test("UPDATE_USER route: 200 sets email, clears it back to undefined on an empty string", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const { principal: target } = await createUser({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "email-target", password: "email-target-p4ssw0rd!" },
  });

  const svcDeps = identityServiceDepsFrom(deps);
  const { role } = await createRole({ deps: svcDeps, input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "update-role" } });
  const { policy } = await createPolicy({ deps: svcDeps, input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "update-policy" } });
  await deps.principalRoleRepo.save({ id: "role-link-update", workspaceId: WORKSPACE_ID, principalId: target.id, roleId: role.id });
  await deps.principalPolicyRepo.save({ id: "policy-link-update", workspaceId: WORKSPACE_ID, principalId: target.id, policyId: policy.id });

  const set = await fetch(`${baseUrl}${urlFor(target.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "new@example.com", username: " Renamed-Target ", password: "ignored-password", anotherField: true }),
  });
  assert.equal(set.status, 200);
  const setBody = (await set.json()) as { user: { email?: string; username: string; roleIds: string[]; policyIds: string[] } };
  assert.equal(setBody.user.email, "new@example.com");
  assert.deepEqual(setBody.user.roleIds, [role.id]);
  assert.deepEqual(setBody.user.policyIds, [policy.id]);
  assert.equal(setBody.user.username, "renamed-target", "AC-28 now accepts username; other unknown fields stay ignored");

  const cleared = await fetch(`${baseUrl}${urlFor(target.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "" }),
  });
  assert.equal(cleared.status, 200);
  const clearedBody = (await cleared.json()) as { user: { email?: string } };
  assert.equal(clearedBody.user.email, undefined);
});

test("UPDATE_USER route: 403 FORBIDDEN when caller lacks user.manage for another operator", async (t) => {
  const { app } = await buildApp({}, "unauthorized-user");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-principal-id")}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "x@example.com" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "user.manage");
});

test("UPDATE_USER route: 404 RESOURCE_NOT_FOUND for a nonexistent principalId", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "x@example.com" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
});

test("UPDATE_USER route: a non-string username is rejected before looking up the target user", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  // An existing user would also be rejected by Jini's later username validation.
  const response = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: null }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: "VALIDATION_ERROR", error: "username must be a string" });
});

/**
 * `assembleUpdatedUserResponse`'s `if (!principal) throw` guard is defensive: `updateUser` itself
 * just succeeded against this exact `principalId`, so a normal request can never observe a missing
 * principal here (a `UserRecord` row orphaned from its `PrincipalRecord` is a data-integrity
 * anomaly, and there is no exposed mutation — no principal-delete route exists, only disable — that
 * can produce one). Exercised here via the real `principalRepo` dependency seam (not a direct
 * handler invocation) so the guard is proven to fire correctly if that anomaly ever occurs, without
 * asserting on any implementation-internal shape.
 */
test("UPDATE_USER route: 404 RESOURCE_NOT_FOUND when the principal row is missing after a successful user update", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const { principal: target } = await createUser({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "orphaned-user", password: "orphaned-user-p4ssw0rd!" },
  });
  const realFindById = deps.principalRepo.findById.bind(deps.principalRepo);
  const patchedPrincipalRepo: UsersRouteDeps["principalRepo"] = {
    ...deps.principalRepo,
    findById: async (input) => (input.id === target.id ? null : realFindById(input)),
  };
  // Reuse the SAME underlying deps (so the user row created above is visible) and only swap
  // `principalRepo` — a fresh `buildApp()` call would boot an unrelated in-memory store.
  const patchedApp = express();
  patchedApp.use(express.json());
  patchedApp.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: ownerId };
    next();
  });
  registerAdminUserUpdateRoute(patchedApp, { ...deps, principalRepo: patchedPrincipalRepo });
  const baseUrl = await startTestServer(patchedApp, t);

  const res = await fetch(`${baseUrl}${urlFor(target.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "x@example.com" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
  assert.match(body.error, new RegExp(`principal '${target.id}' was not found`));
});

test("UPDATE_USER route: 500 internal error when an unexpected error is thrown", async (t) => {
  const throwingRepo = {
    findByPrincipalId: async () => {
      throw new Error("unexpected db failure");
    },
    findByUsername: async () => null,
    save: async () => {},
  };
  const { app } = await buildApp({ userRepo: throwingRepo as unknown as UsersRouteDeps["userRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-id")}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "x@example.com" }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

test("UPDATE_USER route: 409 USER_IN_TRASH when the target is currently in the Trash — OWNER DECISION 2026-09-24", async (t) => {
  let trashedTargetId = "";
  const { app, deps, ownerId } = await buildApp({ isInTrash: async (id) => id === trashedTargetId });
  const baseUrl = await startTestServer(app, t);
  const { principal: target } = await createUser({ deps: identityServiceDepsFrom(deps), input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "updatetrashed", password: "updatetrashed-p4ssw0rd!" } }, { email: "trashed-original@example.com" });

  trashedTargetId = target.id;
  assert.notEqual(target.id, ownerId);
  const before = await deps.userRepo.findByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: target.id });
  const res = await fetch(`${baseUrl}${urlFor(target.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "x@example.com" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "USER_IN_TRASH");
  assert.equal(body.error, "this user is in the Trash; restore them first");
  assert.deepEqual(await deps.userRepo.findByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: target.id }), before);
});

async function patchUsername(app: express.Express, callerId: string, principalId: string, body: unknown) {
  const { res, capture } = createCapturingResponse(); res.locals.principal = { id: callerId };
  await extractRouteHandler(app, "patch", ROUTE_PATH)({ params: { workspaceId: WORKSPACE_ID, principalId }, body }, res);
  return capture;
}

test("username PATCH retains email and sessions, writes a secret-free audit entry, and changes the next login", async () => {
  const { app, deps, ownerId } = await buildApp();
  const service = identityServiceDepsFrom(deps);
  const { user: target } = await createUser({ deps: service, input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId,
    username: "rename-login", password: "rename-login-password" } }, { email: "retained@example.test" });
  const signedIn = await login({ deps: service, input: { workspaceId: WORKSPACE_ID, username: target.username, password: "rename-login-password" } });
  const result = await patchUsername(app, ownerId, target.principalId, { username: " Renamed-Login ", password: "ignored" });
  assert.equal(result.statusCode, 200);
  const response = result.jsonBody as { user: { username: string; email: string; principalId: string } };
  assert.equal(response.user.username, "renamed-login"); assert.equal(response.user.email, "retained@example.test");
  assert.equal(response.user.principalId, target.principalId);
  assert.equal((await validateSession({ deps: service, input: { workspaceId: WORKSPACE_ID, rawToken: signedIn.rawToken } }))?.principal.id, target.principalId);
  const rows = await deps.outbox!.claimPending({ batchSize: 100, nowIso: deps.clock.nowIso() });
  const events = rows.map(row => row.event).filter(event => event.name === "identity.user.username_changed");
  assert.equal(events.length, 1);
  assert.equal(events[0]!.actorId, ownerId);
  assert.deepEqual(events[0]!.payload, { principalId: target.principalId, previousUsername: "rename-login", username: "renamed-login" });
  assert.equal(JSON.stringify(response).includes("passwordHash"), false);
  assert.equal((await login({ deps: service, input: { workspaceId: WORKSPACE_ID, username: "renamed-login", password: "rename-login-password" } })).principal.id, target.principalId);
});

test("username PATCH gives exact validation and conflict reasons, including Trash reservations", async () => {
  const trash = new Set<string>();
  const { app, deps, ownerId } = await buildApp({ isInTrash: async id => trash.has(id) });
  const service = identityServiceDepsFrom(deps);
  const make = (username: string) => createUser({ deps: service, input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username, password: "rename-conflict-password" } });
  const { user: target } = await make("first"); const { user: held } = await make("taken");
  for (const [username, status, code, error] of [
    ["   ", 400, "VALIDATION_ERROR", "username must not be blank"],
    [null, 400, "VALIDATION_ERROR", "username must be a string"],
    [" TAKEN ", 409, "RESOURCE_CONFLICT", "username 'taken' is already in use"],
  ] as const) {
    const result = await patchUsername(app, ownerId, target.principalId, { username });
    assert.equal(result.statusCode, status); assert.deepEqual(result.jsonBody, {
      error, code, ...(status === 409 ? { details: { field: "username" } } : {}),
    });
  }
  trash.add(held.principalId);
  const conflict = await patchUsername(app, ownerId, target.principalId, { username: "TAKEN" });
  assert.equal(conflict.statusCode, 409);
  assert.deepEqual(conflict.jsonBody, { code: "USERNAME_IN_TRASH", error: "a user with this username is in the Trash; restore or delete them permanently first", details: { field: "username" } });
  assert.equal((await deps.userRepo.findByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: target.principalId }))?.username, "first");
});

test("username PATCH requires user.manage for self and refuses delegated management of owners", async () => {
  const { app, deps, ownerId } = await buildApp(); const service = identityServiceDepsFrom(deps);
  const { principal: manager } = await createUser({ deps: service, input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "rename-manager", password: "manager-password" } });
  const { policy } = await createPolicy({ deps: service, input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "rename-grants" } });
  await deps.principalPolicyRepo.save({ id: "rename-policy-link", workspaceId: WORKSPACE_ID, principalId: manager.id, policyId: policy.id });
  const grant = (permission: string) => deps.policyPermissionRepo.save({ id: `rename-${permission}`, workspaceId: WORKSPACE_ID, policyId: policy.id, permission, resourceType: null, constraintJson: null });
  await grant("member.manage");
  assert.equal((await patchUsername(app, manager.id, manager.id, { username: "self-rename" })).statusCode, 403);
  await grant("user.manage");
  const ownerEdit = await patchUsername(app, manager.id, ownerId, { username: "owner-rename" });
  assert.equal(ownerEdit.statusCode, 409);
  assert.deepEqual(ownerEdit.jsonBody, { code: "OWNER_REQUIRED", error: "only an owner can modify an owner principal" });
  const seededEdit = await patchUsername(app, ownerId, ownerId, { username: "owner-rename" });
  assert.equal(seededEdit.statusCode, 400);
  assert.deepEqual(seededEdit.jsonBody, { code: "VALIDATION_ERROR", error: "the seeded owner's username cannot be changed until a persistent owner identity is configured" });
  const { principal: secondOwner } = await createUser({ deps: service, input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "secondary-owner", password: "secondary-owner-password" } });
  const ownerRole = await deps.roleRepo.findByName({ workspaceId: WORKSPACE_ID, name: "owner" }); assert.ok(ownerRole);
  await deps.principalRoleRepo.save({ id: "secondary-owner-role", workspaceId: WORKSPACE_ID, principalId: secondOwner.id, roleId: ownerRole.id });
  assert.equal((await patchUsername(app, ownerId, secondOwner.id, { username: "secondary-renamed" })).statusCode, 200);
});

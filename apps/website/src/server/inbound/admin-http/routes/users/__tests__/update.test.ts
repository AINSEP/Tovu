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
import { createUser } from "@jini-ai/cms/identity";

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = `/api/admin/v1/workspaces/:workspaceId/users/:principalId`;

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
    ownerPrincipalId: base.ownerPrincipalId,
    isInTrash: base.isInTrash,
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

test("UPDATE_USER route: direct invoke fallback for nullish params.principalId", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "patch", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  await handler({ params: { workspaceId: WORKSPACE_ID }, body: { email: "x@example.com" } }, res);
  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { code?: string }).code, "RESOURCE_NOT_FOUND");
});

test("UPDATE_USER route: direct invoke fallback for a nullish body (`rawBody ?? {}`)", async () => {
  const { app, deps, ownerId } = await buildApp();
  const { principal: target } = await createUser({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "nullish-body-target", password: "nullish-body-target-p4ssw0rd!" },
  });
  const handler = extractRouteHandler(app, "patch", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  await handler({ params: { workspaceId: WORKSPACE_ID, principalId: target.id }, body: undefined }, res);
  // No `email` survives the (undefined ?? {}) coercion, so this is a legal "leave email unchanged" PATCH.
  assert.equal(capture.statusCode, 200);
  const body = capture.jsonBody as { user: { email?: string } };
  assert.equal(body.user.email, undefined);
});

test("UPDATE_USER route: 200 sets email, clears it back to undefined on an empty string", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const { principal: target } = await createUser({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "email-target", password: "email-target-p4ssw0rd!" },
  });

  const set = await fetch(`${baseUrl}${urlFor(target.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "new@example.com", username: "should-be-ignored" }),
  });
  assert.equal(set.status, 200);
  const setBody = (await set.json()) as { user: { email?: string; username: string } };
  assert.equal(setBody.user.email, "new@example.com");
  assert.equal(setBody.user.username, "email-target", "username is ignored per AC-28");

  const cleared = await fetch(`${baseUrl}${urlFor(target.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "" }),
  });
  assert.equal(cleared.status, 200);
  const clearedBody = (await cleared.json()) as { user: { email?: string } };
  assert.equal(clearedBody.user.email, undefined);
});

test("UPDATE_USER route: 403 FORBIDDEN when caller lacks user.manage and member.manage", async (t) => {
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
  assert.equal(body.details.permission, "user.manage|member.manage");
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
  const { app, deps, ownerId } = await buildApp({ isInTrash: async () => true });
  const baseUrl = await startTestServer(app, t);
  const { principal: target } = await createUser({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "updatetrashed", password: "updatetrashed-p4ssw0rd!" },
  });

  const res = await fetch(`${baseUrl}${urlFor(target.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "x@example.com" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "USER_IN_TRASH");
  assert.equal(body.error, "this user is in the Trash; restore them first");
});

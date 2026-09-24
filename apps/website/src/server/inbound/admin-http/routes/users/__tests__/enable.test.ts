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
import { registerAdminUserEnableRoute } from "../enable.js";
import { identityServiceDepsFrom, type UsersRouteDeps } from "../deps.js";
import { createPolicy, createRole, createUser } from "@jini-ai/cms/identity";

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = `/api/admin/v1/workspaces/:workspaceId/users/:principalId/enable`;

function urlFor(principalId: string) {
  return `/api/admin/v1/workspaces/${WORKSPACE_ID}/users/${principalId}/enable`;
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
  registerAdminUserEnableRoute(app, deps);
  return { app, deps, ownerId };
}

async function createDisabledTestUser(deps: UsersRouteDeps, ownerId: string, username: string) {
  const svcDeps = identityServiceDepsFrom(deps);
  const { principal } = await createUser({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username, password: `${username}-p4ssw0rd!` },
  });
  await deps.principalRepo.save({ ...principal, status: "disabled", disabledAt: deps.clock.nowIso() });
  return principal.id;
}

test("ENABLE_PRINCIPAL route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/users/some-id/enable`, { method: "POST" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("ENABLE_PRINCIPAL route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("ENABLE_PRINCIPAL route: direct invoke fallback for nullish params.principalId", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  await handler({ params: { workspaceId: WORKSPACE_ID }, body: {} }, res);
  // An empty-string principalId cannot be found, so the domain layer 404s.
  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { code?: string }).code, "RESOURCE_NOT_FOUND");
});

test("ENABLE_PRINCIPAL route: 200 re-activates a disabled user and reports its role/policy grants", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const targetId = await createDisabledTestUser(deps, ownerId, "enableroute");
  const svcDeps = identityServiceDepsFrom(deps);
  const { role } = await createRole({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "enable-route-role" },
  });
  await deps.principalRoleRepo.save({ id: deps.idGen.newId(), workspaceId: WORKSPACE_ID, principalId: targetId, roleId: role.id });
  const { policy } = await createPolicy({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "enable-route-policy" },
  });
  await deps.principalPolicyRepo.save({ id: deps.idGen.newId(), workspaceId: WORKSPACE_ID, principalId: targetId, policyId: policy.id });

  const res = await fetch(`${baseUrl}${urlFor(targetId)}`, { method: "POST" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { user: { status: string; principalId: string; roleIds: string[]; policyIds: string[] } };
  assert.equal(body.user.status, "active");
  assert.equal(body.user.principalId, targetId);
  assert.deepEqual(body.user.roleIds, [role.id]);
  assert.deepEqual(body.user.policyIds, [policy.id]);
});

test("ENABLE_PRINCIPAL route: 403 FORBIDDEN when caller lacks user.manage", async (t) => {
  const { app, deps, ownerId } = await buildApp({}, "unauthorized-user");
  const baseUrl = await startTestServer(app, t);
  const targetId = await createDisabledTestUser(deps, ownerId, "enableforbidden");

  const res = await fetch(`${baseUrl}${urlFor(targetId)}`, { method: "POST" });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "user.manage");
});

test("ENABLE_PRINCIPAL route: 400 VALIDATION_ERROR when target is not kind='user'", async (t) => {
  const { app, deps } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const nonHumanId = "system-principal-for-enable-test";
  await deps.principalRepo.save({
    id: nonHumanId,
    workspaceId: WORKSPACE_ID,
    kind: "system",
    displayName: "system",
    status: "disabled",
    createdAt: deps.clock.nowIso(),
  });

  const res = await fetch(`${baseUrl}${urlFor(nonHumanId)}`, { method: "POST" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("ENABLE_PRINCIPAL route: 404 RESOURCE_NOT_FOUND for a nonexistent principalId", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, { method: "POST" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
});

test("ENABLE_PRINCIPAL route: 404 RESOURCE_NOT_FOUND when the paired users row is missing (defensive check)", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const targetId = await createDisabledTestUser(deps, ownerId, "enableorphaned");

  const realFindByPrincipalId = deps.userRepo.findByPrincipalId.bind(deps.userRepo);
  deps.userRepo.findByPrincipalId = async (args) => {
    if (args.principalId === targetId) return null;
    return realFindByPrincipalId(args);
  };

  const res = await fetch(`${baseUrl}${urlFor(targetId)}`, { method: "POST" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
  assert.match(body.error, new RegExp(targetId));
});

test("ENABLE_PRINCIPAL route: 500 internal error when an unexpected error is thrown", async (t) => {
  const throwingRepo = {
    findById: async () => {
      throw new Error("unexpected db failure");
    },
    list: async () => [],
    save: async () => {},
  };
  const { app } = await buildApp({ principalRepo: throwingRepo as unknown as UsersRouteDeps["principalRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-id")}`, { method: "POST" });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

test("ENABLE_PRINCIPAL route: 409 USER_IN_TRASH when the target is currently in the Trash — OWNER DECISION 2026-09-24", async (t) => {
  const { app, deps, ownerId } = await buildApp({ isInTrash: async () => true });
  const baseUrl = await startTestServer(app, t);
  const targetId = await createDisabledTestUser(deps, ownerId, "enabletrashed");

  const res = await fetch(`${baseUrl}${urlFor(targetId)}`, { method: "POST" });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "USER_IN_TRASH");
  assert.equal(body.error, "this user is in the Trash; restore them first");
});

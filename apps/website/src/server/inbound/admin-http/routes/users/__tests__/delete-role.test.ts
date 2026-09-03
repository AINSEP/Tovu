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
import { registerAdminRoleDeleteRoute } from "../delete-role.js";
import { identityServiceDepsFrom, type UsersRouteDeps } from "../deps.js";
import { assignRole, createRole, createUser } from "@jini-ai/cms/identity";

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = `/api/admin/v1/workspaces/:workspaceId/roles/:roleId`;

function urlFor(roleId: string) {
  return `/api/admin/v1/workspaces/${WORKSPACE_ID}/roles/${roleId}`;
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
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: callerId };
    next();
  });
  registerAdminRoleDeleteRoute(app, deps);
  return { app, deps, ownerId };
}

test("DELETE_ROLE route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/roles/some-id`, { method: "DELETE" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("DELETE_ROLE route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "delete", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("DELETE_ROLE route: direct invoke fallback for nullish params.roleId", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "delete", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  await handler({ params: { workspaceId: WORKSPACE_ID }, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { code?: string }).code, "RESOURCE_NOT_FOUND");
});

test("DELETE_ROLE route: 204 deletes an unused custom role", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const { role } = await createRole({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "deletable-via-route" },
  });

  const res = await fetch(`${baseUrl}${urlFor(role.id)}`, { method: "DELETE" });
  assert.equal(res.status, 204);
  assert.equal(await deps.roleRepo.findById({ workspaceId: WORKSPACE_ID, id: role.id }), null);
});

test("DELETE_ROLE route: 403 FORBIDDEN when caller lacks role.manage", async (t) => {
  const { app } = await buildApp({}, "unauthorized-user");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-role-id")}`, { method: "DELETE" });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "role.manage");
});

test("DELETE_ROLE route: 400 VALIDATION_ERROR when target is a built-in role", async (t) => {
  const { app, deps } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const roles = await deps.roleRepo.list({ workspaceId: WORKSPACE_ID });
  const builtin = roles.find((r) => r.isBuiltin);
  assert.ok(builtin, "seed must include at least one built-in role");

  const res = await fetch(`${baseUrl}${urlFor(builtin!.id)}`, { method: "DELETE" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("DELETE_ROLE route: 404 RESOURCE_NOT_FOUND for a nonexistent roleId", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, { method: "DELETE" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
});

test("DELETE_ROLE route: 409 RESOURCE_CONFLICT when the role is still assigned to a principal", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const svcDeps = identityServiceDepsFrom(deps);
  const { role } = await createRole({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "still-assigned-role" },
  });
  const { principal: target } = await createUser({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "roleholder-dr", password: "roleholder-dr-p4ssw0rd!" },
  });
  await assignRole({ deps: svcDeps, input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, principalId: target.id, roleId: role.id } });

  const res = await fetch(`${baseUrl}${urlFor(role.id)}`, { method: "DELETE" });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string; details: { field: string } };
  assert.equal(body.code, "RESOURCE_CONFLICT");
  assert.equal(body.details.field, "roleId");
});

test("DELETE_ROLE route: 500 internal error when an unexpected error is thrown", async (t) => {
  const throwingRepo = {
    findById: async () => {
      throw new Error("unexpected db failure");
    },
    list: async () => [],
    save: async () => {},
    delete: async () => {},
  };
  const { app } = await buildApp({ roleRepo: throwingRepo as unknown as UsersRouteDeps["roleRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-id")}`, { method: "DELETE" });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

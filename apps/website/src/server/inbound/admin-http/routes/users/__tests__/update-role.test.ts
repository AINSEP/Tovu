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
import { registerAdminRoleUpdateRoute } from "../update-role.js";
import { identityServiceDepsFrom, type UsersRouteDeps } from "../deps.js";
import { createRole } from "@jini-ai/cms/identity";

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
  registerAdminRoleUpdateRoute(app, deps);
  return { app, deps, ownerId };
}

async function createCustomRole(deps: UsersRouteDeps, ownerId: string, name: string) {
  const { role } = await createRole({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name },
  });
  return role.id;
}

test("UPDATE_ROLE route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/roles/some-role`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "renamed" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("UPDATE_ROLE route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "patch", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("UPDATE_ROLE route: direct invoke fallback for nullish params.roleId and nullish body", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "patch", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  // No roleId param, no body at all -> `roleId ?? ""`, `body ?? {}`, `name ?? ""` all fall back;
  // an empty roleId is not found before the empty-name check is ever reached.
  await handler({ params: { workspaceId: WORKSPACE_ID } }, res);
  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { code?: string }).code, "RESOURCE_NOT_FOUND");
});

test("UPDATE_ROLE route: 200 on success renaming a non-built-in role", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const roleId = await createCustomRole(deps, ownerId, "editor-in-training");

  const res = await fetch(`${baseUrl}${urlFor(roleId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "senior-editor" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { role: { id: string; name: string; isBuiltin: boolean } };
  assert.equal(body.role.id, roleId);
  assert.equal(body.role.name, "senior-editor");
  assert.equal(body.role.isBuiltin, false);
});

test("UPDATE_ROLE route: 400 VALIDATION_ERROR when name is empty (real HTTP, non-built-in target)", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const roleId = await createCustomRole(deps, ownerId, "blank-name-role");

  const res = await fetch(`${baseUrl}${urlFor(roleId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "   " }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.match(body.error, /role name is required/);
});

test("INV-06: UPDATE_ROLE route: 400 VALIDATION_ERROR when the target role is built-in", async (t) => {
  const { app, deps } = await buildApp();
  const ownerRole = await deps.roleRepo.findByName({ workspaceId: WORKSPACE_ID, name: "owner" });
  assert.ok(ownerRole, "seed created the built-in owner role");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor(ownerRole!.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "renamed-owner" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.match(body.error, /built-in role cannot be renamed/);

  const stored = await deps.roleRepo.findById({ workspaceId: WORKSPACE_ID, id: ownerRole!.id });
  assert.equal(stored?.name, "owner", "a built-in role's name must never actually change");
});

test("UPDATE_ROLE route: 403 FORBIDDEN when caller lacks role.manage", async (t) => {
  const { app, deps, ownerId } = await buildApp({}, "unauthorized-user");
  const roleId = await createCustomRole(deps, ownerId, "forbidden-target-role");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor(roleId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "should-not-apply" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "role.manage");
});

test("UPDATE_ROLE route: 404 RESOURCE_NOT_FOUND for a nonexistent roleId", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "irrelevant" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
});

test("UPDATE_ROLE route: 500 internal error when an unexpected error is thrown", async (t) => {
  const throwingRepo = {
    findById: async () => {
      throw new Error("unexpected db failure");
    },
    findByName: async () => null,
    list: async () => [],
    save: async () => {},
    delete: async () => {},
  };
  const { app } = await buildApp({ roleRepo: throwingRepo as unknown as UsersRouteDeps["roleRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-id")}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "irrelevant" }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

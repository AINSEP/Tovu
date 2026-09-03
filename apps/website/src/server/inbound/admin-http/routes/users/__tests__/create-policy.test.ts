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
import { registerAdminPolicyCreateRoute } from "../create-policy.js";
import type { UsersRouteDeps } from "../deps.js";

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = `/api/admin/v1/workspaces/:workspaceId/policies`;
const URL_BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/policies`;

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
  registerAdminPolicyCreateRoute(app, deps);
  return { app, deps, ownerId };
}

test("CREATE_POLICY route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/policies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "my-policy" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("CREATE_POLICY route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("CREATE_POLICY route: 201 on success without description", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "test-policy-1" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { policy: { name: string; description?: string } };
  assert.equal(body.policy.name, "test-policy-1");
  assert.equal(body.policy.description, undefined);
});

test("CREATE_POLICY route: 201 on success with description", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "test-policy-2", description: "custom description" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { policy: { name: string; description?: string } };
  assert.equal(body.policy.name, "test-policy-2");
  assert.equal(body.policy.description, "custom description");
});

test("CREATE_POLICY route: 400 VALIDATION_ERROR when name is invalid", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("CREATE_POLICY route: 403 FORBIDDEN when caller lacks permission", async (t) => {
  // Principal "unauthorized-user" has no grants
  const { app } = await buildApp({}, "unauthorized-user");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "forbidden-policy" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "role.manage");
});

test("CREATE_POLICY route: 500 internal error when unexpected error is thrown", async (t) => {
  const throwingRepo = {
    save: async () => {
      throw new Error("unexpected db failure");
    },
    findById: async () => null,
    list: async () => [],
    delete: async () => {},
  };
  const { app } = await buildApp({ policyRepo: throwingRepo as unknown as UsersRouteDeps["policyRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "will-fail-policy" }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

test("CREATE_POLICY route: direct invoke with empty/null rawBody", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  // null body triggers (rawBody ?? {}) branch
  await handler({ params: { workspaceId: WORKSPACE_ID }, body: null }, res);
  // empty name triggers validation error (400)
  assert.equal(capture.statusCode, 400);
  assert.deepEqual(capture.jsonBody, { error: "policy name is required", code: "VALIDATION_ERROR" });
});

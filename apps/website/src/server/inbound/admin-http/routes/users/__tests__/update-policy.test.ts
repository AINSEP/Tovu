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
import { registerAdminPolicyUpdateRoute } from "../update-policy.js";
import { identityServiceDepsFrom, type UsersRouteDeps } from "../deps.js";
import { createPolicy } from "@jini-ai/cms/identity";

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = `/api/admin/v1/workspaces/:workspaceId/policies/:policyId`;

function urlFor(policyId: string) {
  return `/api/admin/v1/workspaces/${WORKSPACE_ID}/policies/${policyId}`;
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
  registerAdminPolicyUpdateRoute(app, deps);
  return { app, deps, ownerId };
}

test("UPDATE_POLICY route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/policies/some-id`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "x" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("UPDATE_POLICY route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "patch", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("UPDATE_POLICY route: direct invoke fallback for nullish params.policyId", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "patch", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  await handler({ params: { workspaceId: WORKSPACE_ID }, body: { name: "x" } }, res);
  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { code?: string }).code, "RESOURCE_NOT_FOUND");
});

test("UPDATE_POLICY route: direct invoke fallback for a nullish body (both fields undefined)", async () => {
  const { app, deps, ownerId } = await buildApp();
  const { policy } = await createPolicy({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "nullish-body-target" },
  });
  const handler = extractRouteHandler(app, "patch", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  await handler({ params: { workspaceId: WORKSPACE_ID, policyId: policy.id }, body: undefined }, res);
  // No name/description survives the (undefined ?? {}) coercion, so the domain layer 400s.
  assert.equal(capture.statusCode, 400);
  assert.equal((capture.jsonBody as { code?: string }).code, "VALIDATION_ERROR");
});

test("UPDATE_POLICY route: 200 renames and re-describes a custom policy", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const { policy } = await createPolicy({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "before-rename" },
  });

  const res = await fetch(`${baseUrl}${urlFor(policy.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "after-rename", description: "new description" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { policy: { name: string; description?: string } };
  assert.equal(body.policy.name, "after-rename");
  assert.equal(body.policy.description, "new description");
});

test("UPDATE_POLICY route: 403 FORBIDDEN when caller lacks role.manage", async (t) => {
  const { app } = await buildApp({}, "unauthorized-user");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-policy-id")}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "x" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "role.manage");
});

test("UPDATE_POLICY route: 400 VALIDATION_ERROR when target is a built-in policy", async (t) => {
  const { app, deps } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const policies = await deps.policyRepo.list({ workspaceId: WORKSPACE_ID });
  const builtin = policies.find((p) => p.isBuiltin);
  assert.ok(builtin, "seed must include at least one built-in policy");

  const res = await fetch(`${baseUrl}${urlFor(builtin!.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "trying-to-rename-builtin" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("UPDATE_POLICY route: 400 VALIDATION_ERROR when neither name nor description is supplied", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const { policy } = await createPolicy({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "empty-patch-target" },
  });

  const res = await fetch(`${baseUrl}${urlFor(policy.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("UPDATE_POLICY route: 404 RESOURCE_NOT_FOUND for a nonexistent policyId", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "x" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
});

test("UPDATE_POLICY route: 500 internal error when an unexpected error is thrown", async (t) => {
  const throwingRepo = {
    findById: async () => {
      throw new Error("unexpected db failure");
    },
    list: async () => [],
    save: async () => {},
    delete: async () => {},
  };
  const { app } = await buildApp({ policyRepo: throwingRepo as unknown as UsersRouteDeps["policyRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-id")}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "x" }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

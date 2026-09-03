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
import { registerAdminPolicyDeleteRoute } from "../delete-policy.js";
import { identityServiceDepsFrom, type UsersRouteDeps } from "../deps.js";
import { attachPolicy, createPolicy, createUser } from "@jini-ai/cms/identity";

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
  registerAdminPolicyDeleteRoute(app, deps);
  return { app, deps, ownerId };
}

test("DELETE_POLICY route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/policies/some-id`, { method: "DELETE" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("DELETE_POLICY route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "delete", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("DELETE_POLICY route: direct invoke fallback for nullish params.policyId", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "delete", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  await handler({ params: { workspaceId: WORKSPACE_ID }, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { code?: string }).code, "RESOURCE_NOT_FOUND");
});

test("DELETE_POLICY route: 204 deletes an unused custom policy", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const { policy } = await createPolicy({
    deps: identityServiceDepsFrom(deps),
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "deletable-via-route" },
  });

  const res = await fetch(`${baseUrl}${urlFor(policy.id)}`, { method: "DELETE" });
  assert.equal(res.status, 204);
  assert.equal(await deps.policyRepo.findById({ workspaceId: WORKSPACE_ID, id: policy.id }), null);
});

test("DELETE_POLICY route: 403 FORBIDDEN when caller lacks role.manage", async (t) => {
  const { app } = await buildApp({}, "unauthorized-user");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-policy-id")}`, { method: "DELETE" });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "role.manage");
});

test("DELETE_POLICY route: 400 VALIDATION_ERROR when target is a built-in policy", async (t) => {
  const { app, deps } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const policies = await deps.policyRepo.list({ workspaceId: WORKSPACE_ID });
  const builtin = policies.find((p) => p.isBuiltin);
  assert.ok(builtin, "seed must include at least one built-in policy");

  const res = await fetch(`${baseUrl}${urlFor(builtin!.id)}`, { method: "DELETE" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

/**
 * RBAC audit note (not a bug, verified): there is no exposed mutation anywhere in this codebase
 * that detaches a policy from a principal or role once attached (grepped
 * `detachPolicy`/`removePolicyFromPrincipal`/`unassignRole` — none exist). So the reference-count
 * guard below is airtight against "delete the policy that's the last thing granting someone
 * `role.manage`, locking everyone out": a policy still attached to anyone can never be deleted
 * (409, this test), and a policy that CAN be deleted (unreferenced) was by construction granting no
 * one anything at the moment of deletion.
 */
test("DELETE_POLICY route: 409 RESOURCE_CONFLICT when the policy is still attached to a principal", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const svcDeps = identityServiceDepsFrom(deps);
  const { policy } = await createPolicy({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "still-attached-policy" },
  });
  const { principal: target } = await createUser({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "policyholder-dp", password: "policyholder-dp-p4ssw0rd!" },
  });
  await attachPolicy({ deps: svcDeps, input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, principalId: target.id, policyId: policy.id } });

  const res = await fetch(`${baseUrl}${urlFor(policy.id)}`, { method: "DELETE" });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string; details: { field: string } };
  assert.equal(body.code, "RESOURCE_CONFLICT");
  assert.equal(body.details.field, "policyId");

  // Confirm the guard actually blocked the write — the policy row (and its attachment) still exist.
  assert.notEqual(await deps.policyRepo.findById({ workspaceId: WORKSPACE_ID, id: policy.id }), null);
});

test("DELETE_POLICY route: 404 RESOURCE_NOT_FOUND for a nonexistent policyId", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, { method: "DELETE" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
});

test("DELETE_POLICY route: 500 internal error when an unexpected error is thrown", async (t) => {
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

  const res = await fetch(`${baseUrl}${urlFor("any-id")}`, { method: "DELETE" });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

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
import { registerAdminPolicyWritePermissionRoute } from "../write-policy-permission.js";
import type { UsersRouteDeps } from "../deps.js";

/**
 * @file Route-level branch coverage for `POST .../policies/:policyId/permissions`
 * (`WRITE_POLICY_PERMISSION`, INV-07/AC-24/AC-26). Fixtures mirror `assign-role.test.ts`'s
 * `seedBarePrincipal`/`attachRoleManageOnlyPolicy` — the same non-owner `role.manage`-only holder
 * shape used to prove the INV-07 clamp actually runs at the route, not just the service level.
 */

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = "/api/admin/v1/workspaces/:workspaceId/policies/:policyId/permissions";
const urlFor = (policyId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/policies/${policyId}/permissions`;

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
  registerAdminPolicyWritePermissionRoute(app, deps);
  return { app, deps, ownerId };
}

async function seedBarePrincipal(deps: UsersRouteDeps, id: string): Promise<void> {
  await deps.principalRepo.save({
    id,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: id,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
}

/** Same fixture `assign-role.test.ts` uses: a policy carrying ONLY `role.manage`, attached to
 *  `principalId` — a non-owner `role.manage` holder whose OWN grant authority is narrower than
 *  what it is gated to write. */
async function attachRoleManageOnlyPolicy(deps: UsersRouteDeps, principalId: string): Promise<void> {
  const policyId = `role-manage-only-${principalId}`;
  await deps.policyRepo.save({
    id: policyId,
    workspaceId: deps.workspaceId,
    name: policyId,
    isBuiltin: false,
    isFrozen: false,
  });
  await deps.policyPermissionRepo.save({
    id: `pp-${policyId}`,
    workspaceId: deps.workspaceId,
    policyId,
    permission: "role.manage",
    resourceType: null,
    constraintJson: null,
  });
  await deps.principalPolicyRepo.save({
    id: `pa-${principalId}`,
    workspaceId: deps.workspaceId,
    principalId,
    policyId,
  });
}

async function createTargetPolicy(deps: UsersRouteDeps, id: string): Promise<string> {
  await deps.policyRepo.save({ id, workspaceId: deps.workspaceId, name: id, isBuiltin: false, isFrozen: false });
  return id;
}

test("WRITE_POLICY_PERMISSION route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/policies/some-id/permissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ permission: "member.manage" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("WRITE_POLICY_PERMISSION route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("WRITE_POLICY_PERMISSION route: direct invoke fallback for nullish params.policyId and nullish body", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  // No policyId param, no body at all -> `body ?? {}`, `body.permission ?? ""`,
  // `resourceType`/`constraintJson` both stay undefined (the `!== undefined` false side).
  await handler({ params: { workspaceId: WORKSPACE_ID } }, res);
  assert.equal(capture.statusCode, 400);
  assert.equal((capture.jsonBody as { code?: string }).code, "PERMISSION_UNKNOWN");
});

test("WRITE_POLICY_PERMISSION route: 403 FORBIDDEN when caller lacks role.manage", async (t) => {
  const { app, deps } = await buildApp({}, "unauthorized-user");
  await seedBarePrincipal(deps, "unauthorized-user");
  const policyId = await createTargetPolicy(deps, "policy-for-forbidden");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor(policyId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ permission: "member.manage" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "role.manage");
});

test("WRITE_POLICY_PERMISSION route: 400 PERMISSION_UNKNOWN for an unregistered permission string", async (t) => {
  const { app, deps } = await buildApp();
  const policyId = await createTargetPolicy(deps, "policy-for-unknown-permission");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor(policyId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ permission: "not.a.real.permission" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "PERMISSION_UNKNOWN");
  assert.equal(body.details.permission, "not.a.real.permission");
});

test("WRITE_POLICY_PERMISSION route: 404 NOT_FOUND when the target policy does not exist", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ permission: "member.manage" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
});

test("WRITE_POLICY_PERMISSION route: 400 VALIDATION_ERROR when the target policy is built-in (INV-06)", async (t) => {
  const { app, deps } = await buildApp();
  const ownerPolicy = await deps.policyRepo.findByName({ workspaceId: WORKSPACE_ID, name: "owner-builtin-policy" });
  assert.ok(ownerPolicy, "seed created the owner role's built-in policy");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor(ownerPolicy!.id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ permission: "member.manage" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("WRITE_POLICY_PERMISSION route: 400 VALIDATION_ERROR when the target policy is frozen (INV-06/AC-26)", async (t) => {
  const { app, deps } = await buildApp();
  const frozenPolicyId = "frozen-policy-for-write-test";
  await deps.policyRepo.save({
    id: frozenPolicyId,
    workspaceId: WORKSPACE_ID,
    name: frozenPolicyId,
    isBuiltin: false,
    isFrozen: true,
  });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor(frozenPolicyId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ permission: "member.manage" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("INV-07: WRITE_POLICY_PERMISSION route: 403 GRANT_EXCEEDS_ISSUER when caller does not hold the permission unconstrained", async (t) => {
  const { app, deps } = await buildApp({}, "limited-admin-wpp");
  await seedBarePrincipal(deps, "limited-admin-wpp");
  await attachRoleManageOnlyPolicy(deps, "limited-admin-wpp");
  const policyId = await createTargetPolicy(deps, "policy-for-grant-clamp");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor(policyId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ permission: "content.write" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { offendingPermissions: string[] } };
  assert.equal(body.code, "GRANT_EXCEEDS_ISSUER");
  assert.ok(body.details.offendingPermissions.includes("content.write"));

  const rows = await deps.policyPermissionRepo.listByPolicyId({ workspaceId: WORKSPACE_ID, policyId });
  assert.deepEqual(rows, [], "a refused grant must not have written a policy_permission row");
});

test("WRITE_POLICY_PERMISSION route: 201 on success, with resourceType and constraintJson provided", async (t) => {
  const { app, deps } = await buildApp();
  const policyId = await createTargetPolicy(deps, "policy-for-success");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor(policyId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      permission: "member.manage",
      resourceType: "member",
      constraintJson: '{"tierId":"tier-1"}',
    }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as {
    policyPermission: { policyId: string; permission: string; resourceType: string | null; constraintJson: string | null };
  };
  assert.equal(body.policyPermission.policyId, policyId);
  assert.equal(body.policyPermission.permission, "member.manage");
  assert.equal(body.policyPermission.resourceType, "member");
  assert.equal(body.policyPermission.constraintJson, '{"tierId":"tier-1"}');

  const rows = await deps.policyPermissionRepo.listByPolicyId({ workspaceId: WORKSPACE_ID, policyId });
  assert.equal(rows.length, 1);
});

test("WRITE_POLICY_PERMISSION route: 500 internal error when an unexpected error is thrown", async (t) => {
  const throwingRepo = {
    findById: async () => {
      throw new Error("unexpected db failure");
    },
    findByName: async () => null,
    list: async () => [],
    save: async () => {},
    delete: async () => {},
  };
  const { app } = await buildApp({ policyRepo: throwingRepo as unknown as UsersRouteDeps["policyRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-id")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ permission: "member.manage" }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

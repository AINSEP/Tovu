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
import { registerAdminUserAttachPolicyRoute } from "../attach-policy.js";
import type { UsersRouteDeps } from "../deps.js";

/**
 * @file Route-level branch coverage for `POST .../users/:principalId/policies` (`ATTACH_POLICY`,
 * state.spec §3 AC-24/AC-25) — the mirror image of `assign-role.test.ts`'s coverage, same rationale
 * (see that file's header for the full explanation of the `?? ""` fallbacks and the fixture
 * technique borrowed from `@jini-ai/cms`'s `identity/__tests__/grant-service.test.ts`).
 */

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = "/api/admin/v1/workspaces/:workspaceId/users/:principalId/policies";
const urlFor = (principalId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/users/${principalId}/policies`;

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
  registerAdminUserAttachPolicyRoute(app, deps);
  return { app, deps, ownerId };
}

/** Mint a bare principal directly via the repo (bypassing CREATE_USER's gate) — mirrors
 *  `grant-service.test.ts`'s `seedBarePrincipal`. */
async function seedBarePrincipal(
  deps: UsersRouteDeps,
  id: string,
  kind: "user" | "api_key" | "system" = "user"
): Promise<void> {
  await deps.principalRepo.save({
    id,
    workspaceId: deps.workspaceId,
    kind,
    displayName: id,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
}

/** Build a custom policy carrying ONLY `role.manage` and attach it to `principalId` — the AC-24
 *  fixture `grant-service.test.ts` uses to construct a non-owner `role.manage` holder whose grant
 *  authority is narrower than a built-in policy's permission set. */
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

test("ATTACH_POLICY route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/users/some-id/policies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policyId: "some-policy" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("ATTACH_POLICY route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("ATTACH_POLICY route: direct invoke fallback for nullish params.principalId and null body (`req.body?.policyId ?? \"\"`)", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  // No principalId param, null body -> both fall back to "" -> `principal '' was not found`.
  await handler({ params: { workspaceId: WORKSPACE_ID }, body: null }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "principal '' was not found" });
});

test("ATTACH_POLICY route: 403 FORBIDDEN when caller lacks role.manage", async (t) => {
  const { app, deps } = await buildApp({}, "unauthorized-user");
  await seedBarePrincipal(deps, "unauthorized-user");
  await seedBarePrincipal(deps, "target-user-1");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("target-user-1")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policyId: "any-policy" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "role.manage");
});

test("ATTACH_POLICY route: 400 VALIDATION_ERROR when target is not kind='user'", async (t) => {
  const { app, deps } = await buildApp();
  await seedBarePrincipal(deps, "machine-2", "api_key");
  const ownerPolicy = await deps.policyRepo.findByName({ workspaceId: WORKSPACE_ID, name: "owner-builtin-policy" });
  assert.ok(ownerPolicy, "seed created the built-in owner policy");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("machine-2")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policyId: ownerPolicy!.id }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("ATTACH_POLICY route: 404 NOT_FOUND when the target principal does not exist", async (t) => {
  const { app, deps } = await buildApp();
  const viewerPolicy = await deps.policyRepo.findByName({ workspaceId: WORKSPACE_ID, name: "viewer-builtin-policy" });
  assert.ok(viewerPolicy);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policyId: viewerPolicy!.id }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "principal 'does-not-exist' was not found");
});

test("ATTACH_POLICY route: 404 NOT_FOUND when policyId is missing or unknown", async (t) => {
  const { app, deps } = await buildApp();
  await seedBarePrincipal(deps, "target-user-2");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("target-user-2")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "policy '' was not found");
});

test("AC-24: ATTACH_POLICY route: 403 GRANT_EXCEEDS_ISSUER when the policy confers a permission the caller does not hold unconstrained", async (t) => {
  const { app, deps } = await buildApp({}, "limited-admin");
  await seedBarePrincipal(deps, "limited-admin");
  await attachRoleManageOnlyPolicy(deps, "limited-admin");
  await seedBarePrincipal(deps, "target-user-3");
  const editorPolicy = await deps.policyRepo.findByName({ workspaceId: WORKSPACE_ID, name: "editor-builtin-policy" });
  assert.ok(editorPolicy, "seed created the built-in editor policy");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("target-user-3")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policyId: editorPolicy!.id }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { offendingPermissions: string[] } };
  assert.equal(body.code, "GRANT_EXCEEDS_ISSUER");
  assert.ok(body.details.offendingPermissions.includes("content.write"));

  const attachments = await deps.principalPolicyRepo.listByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: "target-user-3" });
  assert.deepEqual(attachments, [], "a refused grant must not have written an attachment row");
});

test("ATTACH_POLICY route: 500 internal error when an unexpected error is thrown", async (t) => {
  const base = createRouteDeps();
  await base.identityReady;
  const throwingPolicyRepo = {
    findById: async () => {
      throw new Error("unexpected db failure");
    },
    findByName: base.policyRepo.findByName.bind(base.policyRepo),
    save: base.policyRepo.save.bind(base.policyRepo),
    list: base.policyRepo.list.bind(base.policyRepo),
    delete: base.policyRepo.delete.bind(base.policyRepo),
  };
  const { app, deps } = await buildApp({ policyRepo: throwingPolicyRepo as unknown as UsersRouteDeps["policyRepo"] });
  await seedBarePrincipal(deps, "target-user-4");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("target-user-4")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policyId: "will-fail-policy" }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

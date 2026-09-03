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
import { registerAdminUserAssignRoleRoute } from "../assign-role.js";
import type { UsersRouteDeps } from "../deps.js";

/**
 * @file Route-level branch coverage for `POST .../users/:principalId/roles` (`ASSIGN_ROLE`,
 * state.spec §3 AC-24/AC-25). The happy path is already exercised end-to-end in
 * `identity-crud-routes.test.ts`; this file targets every branch `sendAssignRoleError` maps onto
 * the admin error envelope — `IdentityForbiddenError` (403 FORBIDDEN), `GrantExceedsIssuerError`
 * (403 GRANT_EXCEEDS_ISSUER, the INV-07 clamp), `IdentityValidationError` (400, non-`user` target),
 * `IdentityNotFoundError` (404, missing target/role), and the default 500 — plus the workspace-
 * mismatch 404 and the two `?? ""` fallbacks (`req.params.principalId`, `req.body?.roleId`) that
 * are unreachable through real HTTP (Express always populates a matched required `:param`, and
 * `body-parser`'s `jsonParser` sets `req.body = req.body || {}` unconditionally before any
 * content-type check — see `node_modules/body-parser/lib/types/json.js`). Exercised via
 * `extractRouteHandler`/`createCapturingResponse`, the same direct-invoke technique that helper's
 * own doc comment prescribes for exactly this shape, already used by this directory's
 * `create-policy.test.ts`/`create-role.test.ts` and by `presentation/patch-active-theme.test.ts`.
 *
 * Domain-level behavior (the INV-07 clamp's full matrix, AC-25b's non-human-target rule, etc.) is
 * already exhaustively covered in `@jini-ai/cms`'s `identity/__tests__/grant-service.test.ts` —
 * these tests prove the ROUTE is wired to those errors correctly (status code, error envelope
 * shape), using the same fixture techniques (a custom role-manage-only policy attached to a bare
 * principal) that suite uses at the service level.
 */

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = "/api/admin/v1/workspaces/:workspaceId/users/:principalId/roles";
const urlFor = (principalId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/users/${principalId}/roles`;

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
  registerAdminUserAssignRoleRoute(app, deps);
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
 *  authority is narrower than a built-in role's permission set. */
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

test("ASSIGN_ROLE route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/users/some-id/roles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleId: "some-role" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("ASSIGN_ROLE route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("ASSIGN_ROLE route: direct invoke fallback for nullish params.principalId and null body (`req.body?.roleId ?? \"\"`)", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  // No principalId param, null body -> both fall back to "" -> `principal '' was not found`.
  await handler({ params: { workspaceId: WORKSPACE_ID }, body: null }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "principal '' was not found" });
});

test("ASSIGN_ROLE route: 403 FORBIDDEN when caller lacks role.manage", async (t) => {
  const { app, deps } = await buildApp({}, "unauthorized-user");
  await seedBarePrincipal(deps, "unauthorized-user");
  await seedBarePrincipal(deps, "target-user-1");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("target-user-1")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleId: "any-role" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "role.manage");
});

test("ASSIGN_ROLE route: 400 VALIDATION_ERROR when target is not kind='user'", async (t) => {
  const { app, deps } = await buildApp();
  await seedBarePrincipal(deps, "machine-1", "api_key");
  const ownerRole = await deps.roleRepo.findByName({ workspaceId: WORKSPACE_ID, name: "owner" });
  assert.ok(ownerRole, "seed created the built-in owner role");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("machine-1")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleId: ownerRole!.id }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("ASSIGN_ROLE route: 404 NOT_FOUND when the target principal does not exist", async (t) => {
  const { app, deps } = await buildApp();
  const viewerRole = await deps.roleRepo.findByName({ workspaceId: WORKSPACE_ID, name: "viewer" });
  assert.ok(viewerRole);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleId: viewerRole!.id }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "principal 'does-not-exist' was not found");
});

test("ASSIGN_ROLE route: 404 NOT_FOUND when roleId is missing or unknown", async (t) => {
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
  assert.equal(body.error, "role '' was not found");
});

test("AC-24: ASSIGN_ROLE route: 403 GRANT_EXCEEDS_ISSUER when the role confers a permission the caller does not hold unconstrained", async (t) => {
  const { app, deps } = await buildApp({}, "limited-admin");
  await seedBarePrincipal(deps, "limited-admin");
  await attachRoleManageOnlyPolicy(deps, "limited-admin");
  await seedBarePrincipal(deps, "target-user-3");
  const editorRole = await deps.roleRepo.findByName({ workspaceId: WORKSPACE_ID, name: "editor" });
  assert.ok(editorRole, "seed created the built-in editor role");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("target-user-3")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleId: editorRole!.id }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { offendingPermissions: string[] } };
  assert.equal(body.code, "GRANT_EXCEEDS_ISSUER");
  assert.ok(body.details.offendingPermissions.includes("content.write"));

  const assignments = await deps.principalRoleRepo.listByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: "target-user-3" });
  assert.deepEqual(assignments, [], "a refused grant must not have written an assignment row");
});

test("ASSIGN_ROLE route: 500 internal error when an unexpected error is thrown", async (t) => {
  const base = createRouteDeps();
  await base.identityReady;
  const ownerId = await base.ownerPrincipalId;
  const throwingRoleRepo = {
    findById: async () => {
      throw new Error("unexpected db failure");
    },
    findByName: base.roleRepo.findByName.bind(base.roleRepo),
    save: base.roleRepo.save.bind(base.roleRepo),
    list: base.roleRepo.list.bind(base.roleRepo),
    delete: base.roleRepo.delete.bind(base.roleRepo),
  };
  const { app, deps } = await buildApp({ roleRepo: throwingRoleRepo as unknown as UsersRouteDeps["roleRepo"] });
  await seedBarePrincipal(deps, "target-user-4");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("target-user-4")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleId: "will-fail-role" }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
  void ownerId;
});

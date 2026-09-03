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
import { registerAdminUserDisableRoute } from "../disable.js";
import { identityServiceDepsFrom, type UsersRouteDeps } from "../deps.js";
import { createUser } from "@jini-ai/cms/identity";

/**
 * @file Route-level branch coverage for `POST .../users/:principalId/disable` (`DISABLE_PRINCIPAL`,
 * REQ-11/AC-08/AC-21/AC-27/INV-08). Includes a direct fixture proof of INV-08 (the "must keep at
 * least one active owner-`*` principal" floor) for a NON-seeded owner-wildcard holder: the seeded
 * owner already has its own unconditional refusal (tested separately below), so this proves the
 * count-based floor independently by disabling the real seeded-owner fixture (via a direct repo
 * write, not through this route) and granting the wildcard to a second principal instead — the
 * `ownerPrincipalId` route dependency is overridden to a value that does not match that second
 * principal, so only the count check (not the seeded-owner identity check) can be what refuses it.
 */

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = `/api/admin/v1/workspaces/:workspaceId/users/:principalId/disable`;

function urlFor(principalId: string) {
  return `/api/admin/v1/workspaces/${WORKSPACE_ID}/users/${principalId}/disable`;
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
  registerAdminUserDisableRoute(app, deps);
  return { app, deps, ownerId };
}

async function createTestUser(deps: UsersRouteDeps, ownerId: string, username: string) {
  const svcDeps = identityServiceDepsFrom(deps);
  const { principal } = await createUser({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username, password: `${username}-p4ssw0rd!` },
  });
  return principal.id;
}

/** Attach a policy carrying only `permission` (unconstrained) to `principalId`, mirroring
 *  `assign-role.test.ts`'s `attachRoleManageOnlyPolicy` fixture shape. */
async function attachSinglePermissionPolicy(deps: UsersRouteDeps, principalId: string, permission: string): Promise<void> {
  const policyId = `${permission}-only-${principalId}`;
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: policyId, isBuiltin: false, isFrozen: false });
  await deps.policyPermissionRepo.save({
    id: `pp-${policyId}`,
    workspaceId: deps.workspaceId,
    policyId,
    permission,
    resourceType: null,
    constraintJson: null,
  });
  await deps.principalPolicyRepo.save({ id: `pa-${principalId}`, workspaceId: deps.workspaceId, principalId, policyId });
}

test("DISABLE_PRINCIPAL route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/users/some-id/disable`, { method: "POST" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("DISABLE_PRINCIPAL route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("DISABLE_PRINCIPAL route: direct invoke fallback for nullish params.principalId", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  await handler({ params: { workspaceId: WORKSPACE_ID }, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { code?: string }).code, "RESOURCE_NOT_FOUND");
});

test("DISABLE_PRINCIPAL route: 200 disables a user, session-gate flips, and reports role/policy grants", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const targetId = await createTestUser(deps, ownerId, "disableroute");
  // Attach a real role + policy first: the response's `roleIds`/`policyIds` can only come back
  // non-empty if `assembleDisabledUserResponse`'s `Promise.all([...listByPrincipalId])` +
  // `toAdminUserResponse(...)` call genuinely executed with this exact data (a same-run
  // contradiction proof against a false "uncovered" report on those lines, not just a trivial
  // `[]` that would pass even if that code never ran).
  await attachSinglePermissionPolicy(deps, targetId, "member.manage");
  const roleId = `role-for-${targetId}`;
  await deps.roleRepo.save({ id: roleId, workspaceId: WORKSPACE_ID, name: roleId, isBuiltin: false });
  await deps.principalRoleRepo.save({ id: `pr-${targetId}`, workspaceId: WORKSPACE_ID, principalId: targetId, roleId });

  const res = await fetch(`${baseUrl}${urlFor(targetId)}`, { method: "POST" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { user: { status: string; principalId: string; roleIds: string[]; policyIds: string[] } };
  assert.equal(body.user.status, "disabled");
  assert.equal(body.user.principalId, targetId);
  assert.deepEqual(body.user.roleIds, [roleId]);
  assert.equal(body.user.policyIds.length, 1);

  const stored = await deps.principalRepo.findById({ workspaceId: WORKSPACE_ID, id: targetId });
  assert.equal(stored?.status, "disabled");
  assert.ok(stored?.disabledAt);

  // A disabled principal must lose its authorization immediately (no explicit session
  // revocation call in `disablePrincipal` itself — `validateSession`'s status check is what
  // actually invalidates every session for a disabled principal; verified here at the same
  // `authorize()` seam every gated route already consults).
  const authResult = await deps.authorize({ principalId: targetId, permission: "user.manage", workspaceId: WORKSPACE_ID });
  assert.equal(authResult.allowed, false);
});

test("DISABLE_PRINCIPAL route: 200 idempotent no-op when the target is already disabled", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const targetId = await createTestUser(deps, ownerId, "disabletwice");

  const first = await fetch(`${baseUrl}${urlFor(targetId)}`, { method: "POST" });
  assert.equal(first.status, 200);

  const second = await fetch(`${baseUrl}${urlFor(targetId)}`, { method: "POST" });
  assert.equal(second.status, 200);
  const body = (await second.json()) as { user: { status: string } };
  assert.equal(body.user.status, "disabled");
});

test("DISABLE_PRINCIPAL route: 403 FORBIDDEN when caller lacks user.manage", async (t) => {
  const { app, deps, ownerId } = await buildApp({}, "unauthorized-user");
  const baseUrl = await startTestServer(app, t);
  const targetId = await createTestUser(deps, ownerId, "disableforbidden");

  const res = await fetch(`${baseUrl}${urlFor(targetId)}`, { method: "POST" });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "user.manage");
});

test("REQ-13: DISABLE_PRINCIPAL route: 409 OWNER_REQUIRED when the target is the seeded owner", async (t) => {
  const { app, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor(ownerId)}`, { method: "POST" });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "OWNER_REQUIRED");
});

test("INV-08: DISABLE_PRINCIPAL route: 409 OWNER_REQUIRED when disabling the target would drop the active owner-`*` count to zero", async (t) => {
  const base = createRouteDeps();
  await base.identityReady;
  const realSeededOwnerId = await base.ownerPrincipalId;

  // Disable the REAL seeded-owner fixture directly (bypassing this route entirely) so it no
  // longer counts toward INV-08's active-owner-wildcard headcount.
  const realSeededOwner = await base.principalRepo.findById({ workspaceId: WORKSPACE_ID, id: realSeededOwnerId });
  assert.ok(realSeededOwner);
  await base.principalRepo.save({ ...realSeededOwner!, status: "disabled", disabledAt: base.clock.nowIso() });

  // A caller with `user.manage` only (not the wildcard) so IT never counts toward the headcount.
  const callerId = "inv08-caller";
  await base.principalRepo.save({
    id: callerId,
    workspaceId: WORKSPACE_ID,
    kind: "user",
    displayName: callerId,
    status: "active",
    createdAt: base.clock.nowIso(),
  });

  // The lone remaining owner-`*` holder — NOT the recognized "seeded owner" (see the
  // `ownerPrincipalId` override below), so only the INV-08 count check can refuse this, not the
  // seeded-owner identity check.
  const lastOwnerId = "inv08-last-owner";
  await base.principalRepo.save({
    id: lastOwnerId,
    workspaceId: WORKSPACE_ID,
    kind: "user",
    displayName: lastOwnerId,
    status: "active",
    createdAt: base.clock.nowIso(),
  });

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
    // Overridden: does not match `lastOwnerId`, so `target.id === seededOwnerPrincipalId` is
    // false and execution reaches the INV-08 count check instead of short-circuiting on it.
    ownerPrincipalId: Promise.resolve("unrelated-owner-id-for-inv08-test"),
  };
  await attachSinglePermissionPolicy(deps, callerId, "user.manage");
  await attachSinglePermissionPolicy(deps, lastOwnerId, "*");

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: callerId };
    next();
  });
  registerAdminUserDisableRoute(app, deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor(lastOwnerId)}`, { method: "POST" });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "OWNER_REQUIRED");

  const stored = await deps.principalRepo.findById({ workspaceId: WORKSPACE_ID, id: lastOwnerId });
  assert.equal(stored?.status, "active", "the last owner-`*` principal must remain active — refused, not disabled");
});

test("DISABLE_PRINCIPAL route: 404 RESOURCE_NOT_FOUND for a nonexistent principalId", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, { method: "POST" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
});

test("DISABLE_PRINCIPAL route: 404 RESOURCE_NOT_FOUND when the paired users row is missing (defensive check)", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const targetId = await createTestUser(deps, ownerId, "disableorphaned");

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

test("DISABLE_PRINCIPAL route: 500 internal error when an unexpected error is thrown", async (t) => {
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

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
import { registerAdminUserResetPasswordRoute } from "../reset-password.js";
import { identityServiceDepsFrom, type UsersRouteDeps } from "../deps.js";
import { createUser } from "@jini-ai/cms/identity";

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = `/api/admin/v1/workspaces/:workspaceId/users/:principalId/reset-password`;

function urlFor(principalId: string) {
  return `/api/admin/v1/workspaces/${WORKSPACE_ID}/users/${principalId}/reset-password`;
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
  registerAdminUserResetPasswordRoute(app, deps);
  return { app, deps, ownerId };
}

async function createTestUser(deps: UsersRouteDeps, ownerId: string, username: string) {
  const svcDeps = identityServiceDepsFrom(deps);
  const { principal, user } = await createUser({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username, password: `${username}-p4ssw0rd!` },
  });
  return { principalId: principal.id, originalHash: user.passwordHash };
}

test("RESET_USER_PASSWORD route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/users/some-id/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "irrelevant" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("RESET_USER_PASSWORD route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("RESET_USER_PASSWORD route: direct invoke fallback for nullish params.principalId and nullish body", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  // No `principalId` param and no `body` at all — exercises `req.params.principalId ?? ""`,
  // `req.body ?? {}`, and `body.password ?? ""` together (Express itself would never omit a
  // matched `:principalId` segment, so this is the direct-invoke-only path).
  await handler({ params: { workspaceId: WORKSPACE_ID } }, res);
  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { code?: string }).code, "RESOURCE_NOT_FOUND");
});

test("RESET_USER_PASSWORD route: 204 on success, revokes every active session, never echoes the password", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const { principalId, originalHash } = await createTestUser(deps, ownerId, "resetroute");

  // Seed two active sessions for the target, one already revoked.
  const activeSessionId = deps.idGen.newId();
  const alreadyRevokedSessionId = deps.idGen.newId();
  const nowIso = deps.clock.nowIso();
  await deps.sessionRepo.save({
    id: activeSessionId,
    workspaceId: WORKSPACE_ID,
    principalId,
    tokenHash: "active-token-hash",
    createdAt: nowIso,
    expiresAt: nowIso,
  });
  await deps.sessionRepo.save({
    id: alreadyRevokedSessionId,
    workspaceId: WORKSPACE_ID,
    principalId,
    tokenHash: "already-revoked-token-hash",
    createdAt: nowIso,
    expiresAt: nowIso,
    revokedAt: nowIso,
  });

  const res = await fetch(`${baseUrl}${urlFor(principalId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "brand-new-p4ssw0rd!" }),
  });
  assert.equal(res.status, 204);
  const rawBody = await res.text();
  assert.equal(rawBody, "", "no response body — the raw new password is never echoed back (INV-05)");

  const updatedUser = await deps.userRepo.findByPrincipalId({ workspaceId: WORKSPACE_ID, principalId });
  assert.ok(updatedUser);
  assert.notEqual(updatedUser?.passwordHash, originalHash, "password hash must actually change");

  const activeSession = await deps.sessionRepo.findById({ workspaceId: WORKSPACE_ID, id: activeSessionId });
  assert.ok(activeSession?.revokedAt, "previously active session must be revoked by a password reset (AC-29)");

  const revokedSession = await deps.sessionRepo.findById({ workspaceId: WORKSPACE_ID, id: alreadyRevokedSessionId });
  assert.equal(revokedSession?.revokedAt, nowIso, "an already-revoked session's revokedAt is left untouched");
});

test("RESET_USER_PASSWORD route: 403 FORBIDDEN when caller lacks user.manage", async (t) => {
  const { app, deps, ownerId } = await buildApp({}, "unauthorized-user");
  const baseUrl = await startTestServer(app, t);
  const { principalId } = await createTestUser(deps, ownerId, "resetforbidden");

  const res = await fetch(`${baseUrl}${urlFor(principalId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "some-p4ssw0rd!" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "user.manage");
});

test("RESET_USER_PASSWORD route: 400 VALIDATION_ERROR when password is missing", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const { principalId } = await createTestUser(deps, ownerId, "resetnopassword");

  const res = await fetch(`${baseUrl}${urlFor(principalId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("RESET_USER_PASSWORD route: 404 RESOURCE_NOT_FOUND for a nonexistent principalId", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "some-p4ssw0rd!" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
});

test("RESET_USER_PASSWORD route: 500 internal error when an unexpected error is thrown", async (t) => {
  const throwingRepo = {
    findByPrincipalId: async () => {
      throw new Error("unexpected db failure");
    },
    findByUsername: async () => null,
    save: async () => {},
  };
  const { app } = await buildApp({ userRepo: throwingRepo as unknown as UsersRouteDeps["userRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-id")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "some-p4ssw0rd!" }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

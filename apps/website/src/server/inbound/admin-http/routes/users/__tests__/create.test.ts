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
import { registerAdminUserCreateRoute } from "../create.js";
import type { UsersRouteDeps } from "../deps.js";

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = `/api/admin/v1/workspaces/:workspaceId/users`;
const URL_BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/users`;

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
  registerAdminUserCreateRoute(app, deps);
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

test("CREATE_USER route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "someone", password: "p4ssw0rd!" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("CREATE_USER route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("CREATE_USER route: direct invoke fallback for nullish body (`parseUserCreateBody`'s `rawBody ?? {}`)", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  // No `body` key at all -> `parseUserCreateBody(undefined)` -> username/password both fall back
  // to "" -> the domain layer's own presence check fires (a real HTTP request can never reach
  // this: express.json() always sets req.body to at least `{}`).
  await handler({ params: { workspaceId: WORKSPACE_ID } }, res);
  assert.equal(capture.statusCode, 400);
  assert.equal((capture.jsonBody as { code?: string }).code, "VALIDATION_ERROR");
});

test("CREATE_USER route: 201 on success, with email provided", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "newoperator", email: "newoperator@example.com", password: "op3r4tor-p4ss!" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as {
    user: { username: string; email: string | undefined; status: string; roleIds: string[]; policyIds: string[] };
  };
  assert.equal(body.user.username, "newoperator");
  assert.equal(body.user.email, "newoperator@example.com");
  assert.equal(body.user.status, "active");
  // A freshly created user is born with NO roles/policies — it cannot inherit privileges the
  // creator lacks, since it inherits none at all (confirms no CREATE_USER escalation path).
  assert.deepEqual(body.user.roleIds, []);
  assert.deepEqual(body.user.policyIds, []);
});

test("CREATE_USER route: 400 VALIDATION_ERROR when username is missing (real HTTP, email omitted)", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "some-p4ssw0rd!" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("CREATE_USER route: 409 RESOURCE_CONFLICT when username is already in use", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const payload = JSON.stringify({ username: "duplicateop", password: "op3r4tor-p4ss!" });
  const first = await fetch(`${baseUrl}${URL_BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
  assert.equal(first.status, 201);

  const second = await fetch(`${baseUrl}${URL_BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
  assert.equal(second.status, 409);
  const body = (await second.json()) as { code: string; details: { field: string } };
  assert.equal(body.code, "RESOURCE_CONFLICT");
  assert.equal(body.details.field, "username");
});

test("CREATE_USER route: 403 FORBIDDEN when caller holds neither user.manage nor member.manage", async (t) => {
  const { app, deps } = await buildApp({}, "unauthorized-user");
  await seedBarePrincipal(deps, "unauthorized-user");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "shouldnotexist", password: "op3r4tor-p4ss!" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "user.manage|member.manage");
});

test("CREATE_USER route: 500 internal error when an unexpected error is thrown", async (t) => {
  const throwingRepo = {
    findByUsername: async () => {
      throw new Error("unexpected db failure");
    },
    list: async () => [],
    save: async () => {},
  };
  const { app } = await buildApp({ userRepo: throwingRepo as unknown as UsersRouteDeps["userRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "willfail", password: "op3r4tor-p4ss!" }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

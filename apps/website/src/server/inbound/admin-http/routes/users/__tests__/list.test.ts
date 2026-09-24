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
import { registerAdminUserListRoute } from "../list.js";
import { identityServiceDepsFrom, type UsersRouteDeps } from "../deps.js";
import { createPolicy, createRole, createUser } from "@jini-ai/cms/identity";

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
    isInTrash: base.isInTrash,
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: callerId };
    next();
  });
  registerAdminUserListRoute(app, deps);
  return { app, deps, ownerId };
}

test("LIST_USERS route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/users`);
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("LIST_USERS route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "get", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("LIST_USERS route: 403 FORBIDDEN when caller has neither user.manage nor member.manage", async (t) => {
  const { app } = await buildApp({}, "unauthorized-user");
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "user.manage");
});

test("LIST_USERS route: 200 returns only kind='user' principals with role/policy id arrays", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const svcDeps = identityServiceDepsFrom(deps);
  const { principal: created } = await createUser({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "listme", password: "listme-p4ssw0rd!" },
  });
  const { role } = await createRole({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "list-route-role" },
  });
  await deps.principalRoleRepo.save({
    id: deps.idGen.newId(),
    workspaceId: WORKSPACE_ID,
    principalId: created.id,
    roleId: role.id,
  });
  const { policy } = await createPolicy({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, name: "list-route-policy" },
  });
  await deps.principalPolicyRepo.save({
    id: deps.idGen.newId(),
    workspaceId: WORKSPACE_ID,
    principalId: created.id,
    policyId: policy.id,
  });

  // Seed a non-human principal directly — must be filtered out of the response entirely.
  await deps.principalRepo.save({
    id: "system-principal-for-list-test",
    workspaceId: WORKSPACE_ID,
    kind: "system",
    displayName: "system",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });

  const res = await fetch(`${baseUrl}${URL_BASE}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    users: Array<{ principalId: string; username: string; roleIds: string[]; policyIds: string[] }>;
  };
  assert.ok(!body.users.some((u) => u.principalId === "system-principal-for-list-test"), "non-human principal must be filtered out");
  const listed = body.users.find((u) => u.principalId === created.id);
  assert.ok(listed, "the newly created user must appear in the list");
  assert.equal(listed!.username, "listme");
  assert.deepEqual(listed!.roleIds, [role.id]);
  assert.deepEqual(listed!.policyIds, [policy.id]);
});

test("LIST_USERS route: a kind='user' principal with no paired users row is silently dropped (defensive null check)", async (t) => {
  const { app, deps, ownerId } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const svcDeps = identityServiceDepsFrom(deps);
  const { principal: created } = await createUser({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "orphaned", password: "orphaned-p4ssw0rd!" },
  });

  const realFindByPrincipalId = deps.userRepo.findByPrincipalId.bind(deps.userRepo);
  deps.userRepo.findByPrincipalId = async (args) => {
    if (args.principalId === created.id) return null;
    return realFindByPrincipalId(args);
  };

  const res = await fetch(`${baseUrl}${URL_BASE}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { users: Array<{ principalId: string }> };
  assert.ok(!body.users.some((u) => u.principalId === created.id), "a principal with no paired users row must be dropped, not crash the response");
});

test("LIST_USERS route: 500 internal error when an unexpected error is thrown", async (t) => {
  const throwingRepo = {
    findById: async () => null,
    list: async () => {
      throw new Error("unexpected db failure");
    },
    save: async () => {},
  };
  const { app } = await buildApp({ principalRepo: throwingRepo as unknown as UsersRouteDeps["principalRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`);
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

test("LIST_USERS route: a trashed (disabled + indexed) user is dropped from the list — OWNER DECISION 2026-09-24", async (t) => {
  const trashedIds = new Set<string>();
  const { app, deps, ownerId } = await buildApp({ isInTrash: async (id) => trashedIds.has(id) });
  const baseUrl = await startTestServer(app, t);

  const svcDeps = identityServiceDepsFrom(deps);
  const { principal: trashed } = await createUser({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "listtrashed", password: "listtrashed-p4ssw0rd!" },
  });
  await deps.principalRepo.save({ ...trashed, status: "disabled", disabledAt: deps.clock.nowIso() });
  trashedIds.add(trashed.id);

  const { principal: merelyDisabled } = await createUser({
    deps: svcDeps,
    input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username: "listdisablednottrashed", password: "listdisablednottrashed-p4ssw0rd!" },
  });
  await deps.principalRepo.save({ ...merelyDisabled, status: "disabled", disabledAt: deps.clock.nowIso() });

  const res = await fetch(`${baseUrl}${URL_BASE}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { users: Array<{ principalId: string }> };
  assert.ok(!body.users.some((u) => u.principalId === trashed.id), "a trashed user must not be listed");
  assert.ok(body.users.some((u) => u.principalId === merelyDisabled.id), "a disabled-but-not-trashed user must still be listed");
});

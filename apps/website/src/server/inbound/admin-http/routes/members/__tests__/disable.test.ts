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
import { createRateLimiter, MAGIC_LINK_PER_EMAIL } from "#src/contracts/core/rate-limit/rate-limit";
import { registerAdminMemberDisableRoute } from "../disable.js";
import type { MembersRouteDeps } from "../deps.js";
import type { MemberRecord } from "#src/features/members/index";

/**
 * @file Route-level branch coverage for `POST .../members/:memberId/disable` (ADR-021 §5). The
 * 403 FORBIDDEN branch (caller lacks `member.manage`) is already covered end-to-end with a real
 * login in `src/server/__tests__/routes/members-auth.test.ts` (AC-20) — this file targets every
 * other branch: workspace mismatch, the pre-try `req.params.memberId ?? ""` fallback (only
 * reachable via direct invoke, mirroring this directory's `users/__tests__` convention), success
 * (with session-revocation proof), idempotent re-disable, not-found, and the default 500.
 */

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = `/api/admin/v1/workspaces/:workspaceId/members/:memberId/disable`;

function urlFor(memberId: string) {
  return `/api/admin/v1/workspaces/${WORKSPACE_ID}/members/${memberId}/disable`;
}

async function buildApp(
  depsOverrides: Partial<MembersRouteDeps> = {},
  principalId?: string
): Promise<{ app: express.Express; deps: MembersRouteDeps; ownerId: string }> {
  const base = createRouteDeps();
  await base.identityReady;
  const ownerId = await base.ownerPrincipalId;
  const callerId = principalId ?? ownerId;

  const deps: MembersRouteDeps = {
    ...base,
    magicLinkPerEmailLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: base.clock }),
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: callerId };
    next();
  });
  registerAdminMemberDisableRoute(app, deps);
  return { app, deps, ownerId };
}

async function seedMember(deps: MembersRouteDeps, id: string): Promise<MemberRecord> {
  const nowIso = deps.clock.nowIso();
  const member: MemberRecord = {
    id,
    workspaceId: WORKSPACE_ID,
    email: `${id}@example.com`,
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso,
    version: 1,
  };
  await deps.memberRepo.save(member);
  return member;
}

test("MEMBER_DISABLE route: 404 when workspaceId does not match", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/members/some-id/disable`, { method: "POST" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("MEMBER_DISABLE route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("MEMBER_DISABLE route: direct invoke fallback for nullish params.memberId (`req.params.memberId ?? \"\"`)", async () => {
  const { app, ownerId } = await buildApp();
  const handler = extractRouteHandler(app, "post", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: ownerId };
  await handler({ params: { workspaceId: WORKSPACE_ID } }, res);
  assert.equal(capture.statusCode, 404);
  assert.match((capture.jsonBody as { error: string }).error, /'' was not found/);
});

test("MEMBER_DISABLE route: 200 on success, revokes every live member session", async (t) => {
  const { app, deps } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const member = await seedMember(deps, "member-to-disable");

  const nowIso = deps.clock.nowIso();
  await deps.memberSessionRepo.save({
    id: "session-1",
    workspaceId: WORKSPACE_ID,
    memberId: member.id,
    tokenHash: "token-hash-1",
    createdAt: nowIso,
    expiresAt: nowIso,
  });

  const res = await fetch(`${baseUrl}${urlFor(member.id)}`, { method: "POST" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { member: { id: string; status: string } };
  assert.equal(body.member.id, member.id);
  assert.equal(body.member.status, "disabled");

  const sessions = await deps.memberSessionRepo.listByMember({ workspaceId: WORKSPACE_ID, memberId: member.id });
  assert.equal(sessions.length, 1);
  assert.ok(sessions[0]!.revokedAt, "a live session must be revoked by disabling the member");
});

test("MEMBER_DISABLE route: 200 idempotent no-op when the member is already disabled", async (t) => {
  const { app, deps } = await buildApp();
  const baseUrl = await startTestServer(app, t);
  const member = await seedMember(deps, "member-disable-twice");

  const first = await fetch(`${baseUrl}${urlFor(member.id)}`, { method: "POST" });
  assert.equal(first.status, 200);

  const second = await fetch(`${baseUrl}${urlFor(member.id)}`, { method: "POST" });
  assert.equal(second.status, 200);
  const body = (await second.json()) as { member: { status: string } };
  assert.equal(body.member.status, "disabled");
});

test("MEMBER_DISABLE route: 404 when the member does not exist", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("does-not-exist")}`, { method: "POST" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /'does-not-exist' was not found/);
});

test("MEMBER_DISABLE route: 500 internal error when an unexpected error is thrown", async (t) => {
  const throwingRepo = {
    findById: async () => {
      throw new Error("unexpected db failure");
    },
    list: async () => [],
    save: async () => {},
  };
  const { app } = await buildApp({ memberRepo: throwingRepo as unknown as MembersRouteDeps["memberRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${urlFor("any-id")}`, { method: "POST" });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

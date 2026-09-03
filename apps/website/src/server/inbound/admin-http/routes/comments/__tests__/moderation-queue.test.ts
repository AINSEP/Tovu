import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryCommentRepo } from "#src/features/comments/repo.memory";
import type { CommentRecord } from "#src/features/comments/index";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminCommentsModerationQueueRoute, type AdminCommentsModerationQueueDeps } from "../moderation-queue.js";

/**
 * @file Unit-tier branch coverage for `GET .../comments/queue` (ADR-031 §6, SPEC-033). The
 * "unexpected error -> 500" branch is already covered by `server/__tests__/route-async-guards.
 * test.ts`'s `deps.authorize` throwing probe; this file covers everything else: the workspace-
 * mismatch 404, the 403-on-denial branch, and every `parseStatus`/`parseLimit`/cursor branch in
 * the success path (status omitted vs invalid vs valid; limit omitted vs non-numeric vs in-range;
 * cursor omitted vs present) — none of which any existing test exercises over real HTTP
 * (`comments-e2e.test.ts` calls `commentRepo.listModerationQueue` directly, never through this
 * route).
 */

const WORKSPACE_ID = "workspace-local";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/comments/queue`;

function makeComment(overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id: "comment-1",
    workspaceId: WORKSPACE_ID,
    entryId: "entry-1",
    parentId: null,
    threadRootId: "comment-1",
    depth: 0,
    status: "pending",
    authorPrincipalId: null,
    authorName: "Visitor",
    authorEmail: "visitor@example.com",
    authorUrl: null,
    authorIpHash: "hash-1",
    bodyText: "Hello world",
    spamScore: null,
    spamProvider: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    version: 0,
    ...overrides,
  };
}

function buildApp(depsOverrides: Partial<AdminCommentsModerationQueueDeps> = {}): {
  app: express.Express;
  commentRepo: InMemoryCommentRepo;
} {
  const commentRepo = new InMemoryCommentRepo();
  const deps: AdminCommentsModerationQueueDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    commentRepo,
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminCommentsModerationQueueRoute(app, deps);
  return { app, commentRepo };
}

test("moderation-queue: mismatched workspaceId 404s", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/comments/queue`, { headers: {} });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
});

test("moderation-queue: direct invoke fallback for nullish params.workspaceId (`req.params.workspaceId ?? \"\"`, unreachable through real HTTP since Express always populates a matched required :param)", async () => {
  const { app } = buildApp();
  const handler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/comments/queue");
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, query: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("moderation-queue: authorize denial 403s with the FORBIDDEN envelope", async (t) => {
  const { app } = buildApp({ authorize: async () => ({ allowed: false, reason: "no_grant" }) });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${PATH}`);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "comments.read");
  assert.equal(body.details.reason, "no_grant");
});

test("moderation-queue: status omitted defaults to 'pending' (typeof raw !== 'string' branch)", async (t) => {
  const { app, commentRepo } = buildApp();
  await commentRepo.create(makeComment({ id: "p-1", status: "pending" }));
  await commentRepo.create(makeComment({ id: "a-1", status: "approved" }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: CommentRecord[] };
  assert.deepEqual(body.items.map((c) => c.id), ["p-1"]);
});

test("moderation-queue: an invalid status string also defaults to 'pending' (string but not in VALID_STATUSES)", async (t) => {
  const { app, commentRepo } = buildApp();
  await commentRepo.create(makeComment({ id: "p-1", status: "pending" }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH}?status=not-a-real-status`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: CommentRecord[] };
  assert.deepEqual(body.items.map((c) => c.id), ["p-1"]);
});

test("moderation-queue: a valid status string is honored (spam)", async (t) => {
  const { app, commentRepo } = buildApp();
  await commentRepo.create(makeComment({ id: "p-1", status: "pending" }));
  await commentRepo.create(makeComment({ id: "s-1", status: "spam" }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH}?status=spam`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: CommentRecord[] };
  assert.deepEqual(body.items.map((c) => c.id), ["s-1"]);
});

test("moderation-queue: limit omitted or non-numeric both default to 20; a valid limit is honored and clamped to [1,100]", async (t) => {
  const { app, commentRepo } = buildApp();
  for (let i = 0; i < 3; i += 1) {
    await commentRepo.create(makeComment({ id: `p-${i}`, createdAt: `2026-07-16T00:0${i}:00.000Z`, updatedAt: `2026-07-16T00:0${i}:00.000Z` }));
  }
  const baseUrl = await startTestServer(app, t);

  const omitted = await fetch(`${baseUrl}${PATH}`);
  assert.equal(((await omitted.json()) as { items: unknown[] }).items.length, 3, "default limit of 20 returns all 3");

  const nonNumeric = await fetch(`${baseUrl}${PATH}?limit=not-a-number`);
  assert.equal(((await nonNumeric.json()) as { items: unknown[] }).items.length, 3, "non-numeric limit also defaults to 20");

  const clampedLow = await fetch(`${baseUrl}${PATH}?limit=0`);
  assert.equal(((await clampedLow.json()) as { items: unknown[] }).items.length, 1, "limit=0 clamps up to 1");

  const clampedHigh = await fetch(`${baseUrl}${PATH}?limit=500`);
  assert.equal(((await clampedHigh.json()) as { items: unknown[] }).items.length, 3, "limit=500 clamps down to 100, still returns all 3 available");

  const exact = await fetch(`${baseUrl}${PATH}?limit=2`);
  const exactBody = (await exact.json()) as { items: unknown[]; nextCursor: string | null };
  assert.equal(exactBody.items.length, 2);
  assert.ok(exactBody.nextCursor);
});

test("moderation-queue: cursor omitted starts from the beginning; a real cursor resumes pagination", async (t) => {
  const { app, commentRepo } = buildApp();
  for (let i = 0; i < 3; i += 1) {
    await commentRepo.create(makeComment({ id: `p-${i}`, createdAt: `2026-07-16T00:0${i}:00.000Z`, updatedAt: `2026-07-16T00:0${i}:00.000Z` }));
  }
  const baseUrl = await startTestServer(app, t);

  const page1 = await fetch(`${baseUrl}${PATH}?limit=2`);
  const page1Body = (await page1.json()) as { items: CommentRecord[]; nextCursor: string };
  assert.deepEqual(page1Body.items.map((c) => c.id), ["p-0", "p-1"]);

  const page2 = await fetch(`${baseUrl}${PATH}?limit=2&cursor=${encodeURIComponent(page1Body.nextCursor)}`);
  const page2Body = (await page2.json()) as { items: CommentRecord[] };
  assert.deepEqual(page2Body.items.map((c) => c.id), ["p-2"]);
});

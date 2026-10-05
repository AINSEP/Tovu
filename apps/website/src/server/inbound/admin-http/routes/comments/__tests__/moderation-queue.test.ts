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
 * mismatch 404, the 403-on-denial branch, and every status/limit/cursor branch (status omitted vs
 * off-enum 400 vs valid; limit omitted vs malformed 400 vs in-range vs capped; cursor omitted vs
 * resuming vs unknown 400) — none of which any existing test exercises over real HTTP
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

test("moderation-queue: an off-enum status is a 400 naming the values, not a silent 'pending' page", async (t) => {
  const { app, commentRepo } = buildApp();
  await commentRepo.create(makeComment({ id: "p-1", status: "pending" }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH}?status=not-a-real-status`);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "'status' must be one of: pending, approved, spam, trash", code: "VALIDATION_ERROR" });
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

test("moderation-queue: limit omitted defaults to 20; a valid limit is honored and capped at 100", async (t) => {
  const { app, commentRepo } = buildApp();
  const orderedIds = Array.from({ length: 105 }, (_, i) => `p-${i}`);
  for (const [i, id] of orderedIds.entries()) {
    const timestamp = new Date(Date.UTC(2026, 6, 16, 0, i)).toISOString();
    await commentRepo.create(makeComment({ id, createdAt: timestamp, updatedAt: timestamp }));
  }
  const baseUrl = await startTestServer(app, t);

  const omitted = await fetch(`${baseUrl}${PATH}`);
  assert.equal(omitted.status, 200);
  assert.deepEqual(((await omitted.json()) as { items: CommentRecord[] }).items.map(row => row.id), orderedIds.slice(0, 20));

  const clampedHigh = await fetch(`${baseUrl}${PATH}?limit=500`);
  assert.equal(clampedHigh.status, 200);
  const highBody = await clampedHigh.json() as { items: CommentRecord[]; nextCursor: string | null };
  assert.deepEqual(highBody.items.map(row => row.id), orderedIds.slice(0, 100));
  assert.equal(typeof highBody.nextCursor, "string");
  const last = await fetch(`${baseUrl}${PATH}?limit=500&cursor=${encodeURIComponent(highBody.nextCursor!)}`);
  assert.equal(last.status, 200);
  const lastBody = await last.json() as { items: CommentRecord[]; nextCursor: string | null };
  assert.deepEqual(lastBody.items.map(row => row.id), orderedIds.slice(100));
  assert.equal(lastBody.nextCursor, null);

  const exact = await fetch(`${baseUrl}${PATH}?limit=2`);
  assert.equal(exact.status, 200);
  const exactBody = (await exact.json()) as { items: CommentRecord[]; nextCursor: string | null };
  assert.equal(exactBody.items.length, 2);
  assert.deepEqual(exactBody.items.map(row => row.id), ["p-0", "p-1"]);
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
  assert.equal(page2.status, 200);
  const page2Body = (await page2.json()) as { items: CommentRecord[]; nextCursor: string | null };
  assert.deepEqual(page2Body.items.map((c) => c.id), ["p-2"]);
  assert.equal(page2Body.nextCursor, null);
});

test("moderation-queue: a limit that is not an integer >= 1 is a 400, not a silently clamped page", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  for (const limit of ["not-a-number", "0", "-5", "2.5", ""]) {
    const res = await fetch(`${baseUrl}${PATH}?limit=${limit}`);
    assert.equal(res.status, 400, `limit=${limit}`);
    assert.deepEqual(await res.json(), { error: "'limit' must be an integer between 1 and 100", code: "VALIDATION_ERROR" });
  }
});

test("moderation-queue: Load more still works after another moderator purged the comment the cursor ended on", async (t) => {
  const { app, commentRepo } = buildApp();
  for (let i = 0; i < 3; i += 1) {
    await commentRepo.create(makeComment({ id: `p-${i}`, createdAt: `2026-07-16T00:0${i}:00.000Z`, updatedAt: `2026-07-16T00:0${i}:00.000Z` }));
  }
  const baseUrl = await startTestServer(app, t);

  const page1Body = (await (await fetch(`${baseUrl}${PATH}?limit=2`)).json()) as { items: CommentRecord[]; nextCursor: string };
  assert.deepEqual(page1Body.items.map((c) => c.id), ["p-0", "p-1"]);
  assert.equal((await commentRepo.purge({ workspaceId: WORKSPACE_ID, id: "p-1", actorPrincipalId: "other-moderator", note: null, at: "2026-07-16T01:00:00.000Z" })).ok, true);

  const page2 = await fetch(`${baseUrl}${PATH}?limit=2&cursor=${encodeURIComponent(page1Body.nextCursor)}`);
  assert.equal(page2.status, 200);
  assert.deepEqual(((await page2.json()) as { items: CommentRecord[] }).items.map((c) => c.id), ["p-2"]);
});

// A bare comment id was the cursor format before 2026-10-05; it is malformed now.
test("moderation-queue: a malformed cursor is a 400 VALIDATION_ERROR, not a silent page 1", async (t) => {
  const { app, commentRepo } = buildApp();
  await commentRepo.create(makeComment({ id: "p-0" }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH}?cursor=no-such-comment`);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid cursor", code: "VALIDATION_ERROR" });
});

// A repeated `cursor` parses as an array; it used to read as "no cursor" and silently restart at page 1.
test("moderation-queue: a non-string cursor is a 400 VALIDATION_ERROR, not a silent page 1", async (t) => {
  const { app, commentRepo } = buildApp();
  await commentRepo.create(makeComment({ id: "p-0" }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH}?cursor=a&cursor=b`);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "'cursor' must be a string", code: "VALIDATION_ERROR" });
});

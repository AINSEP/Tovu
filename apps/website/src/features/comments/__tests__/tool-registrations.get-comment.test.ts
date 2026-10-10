import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { deriveContentReadRegistrations } from "#src/assistant/content-read-tool";
import { buildCommentsRegistrations, type CommentsToolDeps } from "../tool-registrations.js";

test("comment card reads an approved comment directly, scopes the lookup and omits internal fields", async () => {
  const calls: unknown[] = [];
  const deps = {
    workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }), commentsReady: Promise.resolve(),
    commentRepo: { findById: async (input: unknown) => {
      calls.push(input);
      return { id: "c", entryId: "p", parentId: null, status: "approved", authorName: "Ada", authorEmail: null,
        bodyText: "Hello", spamScore: null, createdAt: "2026-10-09T00:00:00.000Z", version: 2, authorIpHash: "internal" };
    } },
  } as unknown as CommentsToolDeps;
  const card = deriveContentReadRegistrations(buildCommentsRegistrations(deps)).find(r => r.descriptor.id === "content_read.comment");
  assert.ok(card);
  const result = await card.handler({ input: { commentId: "c" }, principal: { id: "owner" } } as ToolExecutionContext);
  assert.deepEqual(calls, [{ workspaceId: "ws", id: "c" }]);
  assert.deepEqual(result, { comment: { id: "c", entryId: "p", parentId: null, status: "approved", authorName: "Ada", authorEmail: null,
    bodyText: "Hello", spamScore: null, createdAt: "2026-10-09T00:00:00.000Z", version: 2 } });
});

test("comment reader reports absence and denies before touching the repository", async () => {
  let reads = 0;
  const deps = { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }), commentsReady: Promise.resolve(),
    commentRepo: { findById: async () => { reads++; return null; } } } as unknown as CommentsToolDeps;
  const read = () => buildCommentsRegistrations(deps).find(r => r.descriptor.id === "comments_get_comment")!.handler;
  const ctx = { input: { commentId: "missing" }, principal: { id: "owner" } } as ToolExecutionContext;
  await assert.rejects(read()(ctx), { message: "COMMENTS_NOT_FOUND: comment 'missing' was not found" });
  deps.authorize = async () => ({ allowed: false, reason: "denied" });
  await assert.rejects(read()(ctx), ToolInputError);
  assert.equal(reads, 1);
});

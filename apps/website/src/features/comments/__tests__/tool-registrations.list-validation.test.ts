/**
 * @file REGRESSION (fix-plan C6b) for `comments_list_moderation_queue`'s input reads. `status` was cast
 * straight to `CommentStatus`, so an off-enum value like "bogus" queried a status no comment has and
 * came back as an empty queue; `limit` went to the repo unchecked (0 or -5 read an empty page). The
 * model saw "nothing to moderate" instead of the reason.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";

import { buildCommentsRegistrations, type CommentsToolDeps } from "../tool-registrations.js";

type QueueQuery = { status: string; limit: number; cursor: string | null };

function ctxWithInput(input: unknown): ToolExecutionContext {
  return { executionId: "e1", principal: { id: "p1" }, run: { id: "r1" }, input, signal: new AbortController().signal };
}

function harness() {
  const queries: QueueQuery[] = [];
  const deps = {
    workspaceId: "ws-comments-list",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    commentsReady: Promise.resolve(),
    commentsSettingsReady: Promise.resolve(),
    commentRepo: {
      listModerationQueue: async ({ status, limit, cursor }: QueueQuery) => {
        queries.push({ status, limit, cursor });
        return { items: [], nextCursor: null };
      },
    },
  } as unknown as CommentsToolDeps;
  const registration = buildCommentsRegistrations(deps).find((r) => r.descriptor.id === "comments_list_moderation_queue");
  assert.ok(registration);
  return { queries, list: (input: unknown) => registration.handler(ctxWithInput(input)) };
}

async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}: ${(err as Error)?.message}`);
    return err.message;
  }
  assert.fail("expected the handler to reject");
}

test("an off-enum status is refused naming every allowed value, before the repo is read", async () => {
  const h = harness();
  assert.equal(await rejectionMessage(h.list({ status: "bogus" })), "'status' must be one of: pending, approved, spam, trash");
  assert.deepEqual(h.queries, []);
});

test("a non-positive or fractional limit is refused with the schema's range", async () => {
  const h = harness();
  for (const limit of [-5, 0, 2.5]) {
    assert.equal(await rejectionMessage(h.list({ limit })), "'limit' must be an integer between 1 and 100");
  }
  assert.deepEqual(h.queries, []);
});

test("defaults stay pending/20, a listed status passes through and an over-cap limit is capped at 100", async () => {
  const h = harness();
  await h.list({});
  await h.list({ status: "spam", limit: 500, cursor: "c-9" });
  assert.deepEqual(h.queries, [
    { status: "pending", limit: 20, cursor: null },
    { status: "spam", limit: 100, cursor: "c-9" },
  ]);
});

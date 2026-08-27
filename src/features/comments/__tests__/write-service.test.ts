import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "../../../core/events/index.js";
import { createCommentHookRegistry } from "../hooks.js";
import { InMemoryCommentRepo } from "../repo.memory.js";
import { createCommentWriteService } from "../write-service.js";
import type { CommentRecord } from "../types.js";

/** @file SPEC-033 — the moderation write-service: outbox events + statusChanged hook firing. */

const WORKSPACE_ID = "workspace-1";

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
    authorEmail: null,
    authorUrl: null,
    authorIpHash: null,
    bodyText: "hello",
    spamScore: null,
    spamProvider: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    version: 0,
    ...overrides,
  };
}

function makeService() {
  const repo = new InMemoryCommentRepo();
  const outbox = new InMemoryOutbox();
  const hooks = createCommentHookRegistry();
  const service = createCommentWriteService({
    repo,
    outbox,
    hooks,
    clock: { nowIso: () => "2026-07-16T01:00:00.000Z" },
    idGen: { newId: () => "event-1" },
  });
  return { repo, outbox, hooks, service };
}

test("approving a comment enqueues comments.approved and fires the statusChanged hook", async () => {
  const { repo, outbox, hooks, service } = makeService();
  await repo.create(makeComment());
  let hookFired: { fromStatus: string | null; toStatus: string } | null = null;
  hooks.registerStatusChangedHook(async (payload) => {
    hookFired = { fromStatus: payload.fromStatus, toStatus: payload.toStatus };
  });

  const result = await service.applyModeration({
    workspaceId: WORKSPACE_ID,
    id: "comment-1",
    expectedVersion: 0,
    action: "approve",
    toStatus: "approved",
    actorPrincipalId: "principal-1",
    note: null,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(hookFired, { fromStatus: "pending", toStatus: "approved" });

  const claimed = await outbox.claimPending(10, "2026-07-16T01:00:00.000Z");
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].event.name, "comments.approved");
});

test("a conflict returns without enqueueing an event or firing the hook", async () => {
  const { repo, outbox, hooks, service } = makeService();
  await repo.create(makeComment());
  let hookFired = false;
  hooks.registerStatusChangedHook(async () => {
    hookFired = true;
  });

  const result = await service.applyModeration({
    workspaceId: WORKSPACE_ID,
    id: "comment-1",
    expectedVersion: 99,
    action: "approve",
    toStatus: "approved",
    actorPrincipalId: "principal-1",
    note: null,
  });

  assert.equal(result.ok, false);
  assert.equal(hookFired, false);
  const claimed = await outbox.claimPending(10, "2026-07-16T01:00:00.000Z");
  assert.equal(claimed.length, 0);
});

test("purge enqueues comments.purged", async () => {
  const { repo, outbox, service } = makeService();
  await repo.create(makeComment());

  const result = await service.purge({ workspaceId: WORKSPACE_ID, id: "comment-1", actorPrincipalId: "principal-1", note: "abuse" });
  assert.equal(result.ok, true);

  const claimed = await outbox.claimPending(10, "2026-07-16T01:00:00.000Z");
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].event.name, "comments.purged");
  assert.equal(await repo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" }), null);
});

test("a 'trash' action (no explicit event mapping needed beyond comments.trashed) enqueues the right event", async () => {
  const { outbox, repo, service } = makeService();
  await repo.create(makeComment({ status: "approved" }));

  await service.applyModeration({
    workspaceId: WORKSPACE_ID,
    id: "comment-1",
    expectedVersion: 0,
    action: "trash",
    toStatus: "trash",
    actorPrincipalId: "principal-1",
    note: null,
  });

  const claimed = await outbox.claimPending(10, "2026-07-16T01:00:00.000Z");
  assert.equal(claimed[0].event.name, "comments.trashed");
});

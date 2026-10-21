import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import { InMemoryPostRepo } from "../repo.memory.js";
import { createPostReverters, type PostReverterDeps } from "../reverters.js";
import { buildPostRecord } from "./post-record.fixture.js";

const WS = "workspace-1";

function depsFor(repo: InMemoryPostRepo): PostReverterDeps {
  const outbox = { enqueue: async () => {}, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} } as unknown as OutboxPort;
  return { postRepo: repo, clock: { nowMs: () => Date.parse("2026-10-01T00:00:00.000Z") }, outbox, forgetRemoved: async () => {} };
}

test("both post reverters report the stored version of an existing post, and none for a post that does not exist", async () => {
  const reverters = createPostReverters(depsFor(new InMemoryPostRepo([buildPostRecord({ id: "post-1", workspaceId: WS, version: 4 })])));
  assert.equal(await reverters.update.currentVersion({ workspaceId: WS, entityId: "post-1" }), 4);
  assert.equal(await reverters.delete.currentVersion({ workspaceId: WS, entityId: "post-1" }), 4);
  assert.equal(await reverters.update.currentVersion({ workspaceId: WS, entityId: "missing" }), null);
  assert.equal(await reverters.delete.currentVersion({ workspaceId: WS, entityId: "missing" }), null);
});

test("currentActor names the actor of the revision matching the post's current version, else null", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord({ id: "post-1", workspaceId: WS, version: 2 })]);
  const reverters = createPostReverters(depsFor(repo));
  assert.equal(await reverters.update.currentActor!({ workspaceId: WS, entityId: "post-1" }), null, "a post that predates the ledger has no actor");
  assert.equal(await reverters.delete.currentActor!({ workspaceId: WS, entityId: "missing" }), null);

  const state = buildPostRecord({ id: "post-1", workspaceId: WS, version: 1 });
  await repo.appendRevision({ postId: "post-1", workspaceId: WS, seq: 1, op: "create", stateJson: state, actorId: "author-1", recordedAt: "2026-10-01T00:00:00.000Z" });
  assert.equal(await reverters.update.currentActor!({ workspaceId: WS, entityId: "post-1" }), null, "only the revision for the CURRENT version counts");
  await repo.appendRevision({ postId: "post-1", workspaceId: WS, seq: 2, op: "update", stateJson: { ...state, version: 2 }, actorId: "editor-2", recordedAt: "2026-10-01T00:01:00.000Z" });
  assert.equal(await reverters.update.currentActor!({ workspaceId: WS, entityId: "post-1" }), "editor-2");
  assert.equal(await reverters.delete.currentActor!({ workspaceId: WS, entityId: "post-1" }), "editor-2");
});

test("reverting a delete of a post that no longer exists fails loudly, naming the post", async () => {
  const reverters = createPostReverters(depsFor(new InMemoryPostRepo()));
  const item = { entityType: "post", entityId: "gone-post", op: "delete", inversePayload: { deletedAt: null } } as unknown as Parameters<typeof reverters.delete.applyInverse>[0]["item"];
  await assert.rejects(reverters.delete.applyInverse({ workspaceId: WS, item } as Parameters<typeof reverters.delete.applyInverse>[0]), { message: "post 'gone-post' was not found" });
});

import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import { InMemoryPostRepo } from "../repo.memory.js";
import { createPostReverters, type PostReverterDeps } from "../reverters.js";
import { buildPostRecord } from "./post-record.fixture.js";
import { PostVersionConflictError, type PostRecord } from "../post.js";

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

test("T34: reverts record their new revision and preserve an edit committed after their read", async (t) => {
  for (const operation of ["update", "delete"] as const) {
    const existing = buildPostRecord({
      id: "post-1", workspaceId: WS, title: "Current title", version: 4,
      deletedAt: operation === "delete" ? "2026-09-30T00:00:00.000Z" : null,
    });
    type Item = Parameters<ReturnType<typeof createPostReverters>["update"]["applyInverse"]>[0]["item"];
    const inversePayload: Item["inversePayload"] = operation === "delete" ? { deletedAt: null } : {
      title: "Prior title", slug: existing.slug, bodyJson: existing.bodyJson, status: existing.status,
    };
    const item = {
      id: "item-1", workspaceId: WS, changeSetId: "change-1", position: 0,
      entityType: "post", entityId: existing.id, operation, entityVersion: existing.version,
      inversePayload,
    } as Item;

    await t.test(`${operation}: new revision is present in history`, async () => {
      const repo = new InMemoryPostRepo([existing]);
      const reverter = createPostReverters(depsFor(repo))[operation];
      await reverter.applyInverse({ workspaceId: WS, item });
      const saved = await repo.findById({ workspaceId: WS, id: existing.id });
      assert.equal(saved?.version, 5);
      const revisions = await repo.listRevisions({ workspaceId: WS, postId: existing.id });
      // Expected RED: both reverters save version 5 without appending its revision.
      assert.ok(revisions.find((revision) => revision.seq === 5), "the reverted state must appear in post history");
      assert.deepEqual(revisions.find((revision) => revision.seq === 5)?.stateJson, saved);
      assert.notEqual(await reverter.currentActor!({ workspaceId: WS, entityId: existing.id }), null);
    });

    await t.test(`${operation}: a concurrent edit survives`, async () => {
      const repo = new InMemoryPostRepo([existing]);
      const read = repo.findById.bind(repo);
      const concurrent: PostRecord = { ...existing, title: "Human's edit", version: 5, updatedAt: "2026-10-01T00:00:01.000Z" };
      let injectEdit = true;
      repo.findById = async (input) => {
        const snapshot = await read(input);
        if (injectEdit) {
          injectEdit = false;
          // Commit after the reverter's snapshot, before its transaction/save. No timing or timers.
          await repo.save(concurrent);
        }
        return snapshot;
      };
      const reverter = createPostReverters(depsFor(repo))[operation];
      const error = await reverter.applyInverse({ workspaceId: WS, item }).then(() => null, (failure: unknown) => failure);

      // Expected RED: unconditional save overwrites the intervening edit with the stale pre-image.
      assert.deepEqual(await read({ workspaceId: WS, id: existing.id }), concurrent);
      assert.ok(error instanceof PostVersionConflictError, "a stale revert must report a version conflict");
    });
  }
});

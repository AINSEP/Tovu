import assert from "node:assert/strict";
import test from "node:test";
import type Database from "better-sqlite3";

import type { DomainEvent, OutboxPort } from "@jini-ai/cms/core";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import {
  createPost,
  createPostReverters,
  deletePost,
  restorePostForward,
  SqlitePostRepo,
  type PostRecord,
} from "#src/features/post/index";

import { createPostTrashAdapter, POST_ENTITY_TYPE } from "../adapters/post.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { bindForgetRemovedEntity, bindRemoveEntity, createTrashService } from "../write-service.js";
import type { TrashAdapter, TrashItem } from "../ports.js";

/**
 * @file The Trash index row's fate when a post delete is UNDONE.
 *
 * `deletePost` writes the `posts.deleted_at` marker and the `trashed_items` index row as one
 * transaction. Two paths then undo that delete after it has committed, and neither is inside that
 * transaction:
 *
 *  1. `CommandMutation.rollback` — the change-set record failed to persist after `execute()`
 *     applied, so the gateway compensates through `restorePostForward`.
 *  2. `post/delete`'s `EntityReverter.applyInverse` — an operator reverting the recorded change set
 *     from the admin UI, long after the fact.
 *
 * Either one that clears the marker without dropping the index row leaves a **live, published post
 * listed in the Trash screen and selectable for permanent deletion** — the exact stranded-index-row
 * failure `ForgetRemovedEntity` exists to prevent (`features/comments/write-service.ts` already
 * uses it for moderation-out-of-trash).
 *
 * Run against real SQLite and the real trash service, per `post/__tests__/remove-post-double.ts`'s
 * rule: tests that care about the index half do not use the double.
 */

const WS = "workspace-1";
const AT = "2026-09-20T12:00:00.000Z";
const clock = { nowIso: () => AT };

function recordingOutbox(): OutboxPort & { events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  return {
    events,
    enqueue: async (event: DomainEvent) => void events.push(event),
    claimPending: async () => [],
    markDelivered: async () => {},
    markFailed: async () => {},
  };
}

interface Harness {
  client: Database.Database;
  postRepo: SqlitePostRepo;
  trashRepo: SqliteTrashRepo;
  outbox: OutboxPort & { events: DomainEvent[] };
  removePost: ReturnType<typeof bindRemoveEntity>;
  forgetRemovedPost: ReturnType<typeof bindForgetRemovedEntity>;
}

function harness(): Harness {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");

  const trashRepo = new SqliteTrashRepo(client);
  let seq = 0;
  const adapters = new Map<string, TrashAdapter>([[POST_ENTITY_TYPE, createPostTrashAdapter(client)]]);
  const trash = createTrashService({
    repo: trashRepo,
    adapters,
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction: createContentDbTransactionRunner(client),
  });

  return {
    client,
    postRepo: new SqlitePostRepo(db),
    trashRepo,
    outbox: recordingOutbox(),
    removePost: bindRemoveEntity(trash, POST_ENTITY_TYPE),
    forgetRemovedPost: bindForgetRemovedEntity(trashRepo, POST_ENTITY_TYPE),
  };
}

/** Creates a published post, then trashes it through the real `remove` port. */
async function seedTrashedPost(h: Harness): Promise<PostRecord> {
  await createPost({
    deps: { repo: h.postRepo, clock, outbox: h.outbox },
    input: { workspaceId: WS, id: "post-1", title: "Original Title", status: "published" },
  });
  const prior = await h.postRepo.findById({ workspaceId: WS, id: "post-1" });
  assert.ok(prior, "the fixture post must have been created");

  await deletePost({
    deps: { repo: h.postRepo, clock, outbox: h.outbox, remove: h.removePost },
    input: { workspaceId: WS, id: prior.id },
  });
  return prior;
}

async function indexRow(h: Harness): Promise<TrashItem | null> {
  return h.trashRepo.findByEntity({ workspaceId: WS, entityType: POST_ENTITY_TYPE, entityId: "post-1" });
}

test("rollback of a delete drops the Trash index row, so the Trash cannot list a live post", async () => {
  const h = harness();
  const prior = await seedTrashedPost(h);
  assert.ok(await indexRow(h), "the delete must have indexed the post — otherwise this proves nothing");

  const restored = await restorePostForward({
    deps: { repo: h.postRepo, clock, outbox: h.outbox, forgetRemoved: h.forgetRemovedPost },
    input: { prior },
  });

  assert.ok(restored, "a landed trash must be compensable");
  assert.equal(restored.post.deletedAt, null, "the post row must be live again");
  assert.equal(
    await indexRow(h),
    null,
    "a live post must not still be listed in the Trash, selectable for permanent deletion"
  );
});

test("reverting the recorded delete change set drops the Trash index row too", async () => {
  const h = harness();
  const prior = await seedTrashedPost(h);
  assert.ok(await indexRow(h), "the delete must have indexed the post — otherwise this proves nothing");

  const { delete: deleteReverter } = createPostReverters({
    postRepo: h.postRepo,
    clock,
    outbox: h.outbox,
    forgetRemoved: h.forgetRemovedPost,
  });
  await deleteReverter.applyInverse({
    workspaceId: WS,
    item: { entityId: prior.id, entityType: "post", operation: "delete", inversePayload: { deletedAt: null } },
  } as Parameters<typeof deleteReverter.applyInverse>[0]);

  const current = await h.postRepo.findById({ workspaceId: WS, id: prior.id });
  assert.equal(current?.deletedAt, null, "the revert must have cleared the marker");
  assert.equal(
    await indexRow(h),
    null,
    "a reverted delete must not leave the post listed in the Trash"
  );
});

test("an update rollback never touches the Trash index — the write it undoes was not a trash", async () => {
  const h = harness();
  const prior = await seedTrashedPost(h);
  const before = await indexRow(h);
  assert.ok(before, "fixture: the post is trashed and indexed");

  // `prior` here is the trashed state, so restoring it forward is a no-op restore of a trashed row.
  const noop = await restorePostForward({
    deps: { repo: h.postRepo, clock, outbox: h.outbox, forgetRemoved: h.forgetRemovedPost },
    input: { prior: (await h.postRepo.findById({ workspaceId: WS, id: prior.id }))! },
  });

  assert.equal(noop, null, "nothing has moved past the trashed state, so there is nothing to compensate");
  assert.deepEqual(await indexRow(h), before, "the index row must survive — the post is still trashed");
});

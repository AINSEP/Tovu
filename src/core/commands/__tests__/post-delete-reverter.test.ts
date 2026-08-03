import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, deletePost, isTrashed, type PostRecord } from "#src/features/post/index";
import type { OutboxPort, ChangeSetItemRecord } from "@jini-ai/cms/core";
import { defaultRevertRegistry, postDeleteReverter, type ReverterDeps } from "../appliers";

/**
 * @file Certification of `postDeleteReverter` — the restore that makes the soft delete genuinely
 * reversible, which is the whole reason `deletePost` marks a row instead of removing it.
 *
 * The end-to-end proof (a real HTTP DELETE followed by a real change-set revert) lives in
 * `server/__tests__/admin-post-page-delete-routes.test.ts`. This file pins the two things that
 * test cannot see from outside: that the reverter is REGISTERED for `("post", "delete")` so a
 * revert routes here rather than to `postUpdateReverter`, and that the restore re-emits the
 * lifecycle event symmetrically to the delete's own.
 */

const WS = "workspace-1";
const clock = { nowIso: () => "2026-07-30T12:00:00.000Z" };

interface CapturedEvent {
  id: string;
  name: string;
}

function recordingOutbox(): { outbox: OutboxPort; events: CapturedEvent[] } {
  const events: CapturedEvent[] = [];
  return {
    events,
    outbox: {
      enqueue: async (event: { id: string; name: string }) => {
        events.push({ id: event.id, name: event.name });
      },
      claimPending: async () => [],
      markDelivered: async () => {},
      markFailed: async () => {},
    } as unknown as OutboxPort,
  };
}

function seed(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WS,
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    updatedAt: "2026-04-06T00:00:00.000Z",
    version: 3,
    ...overrides,
  };
}

const deleteItem: ChangeSetItemRecord = {
  entityId: "post-1",
  inversePayload: { deletedAt: null },
} as unknown as ChangeSetItemRecord;

test("the registry routes ('post','delete') to postDeleteReverter, not postUpdateReverter", () => {
  const registry = defaultRevertRegistry();
  assert.equal(registry.resolve("post", "delete"), postDeleteReverter);
  assert.notEqual(registry.resolve("post", "update"), postDeleteReverter);
});

test("applyInverse clears the trash marker, restoring the row losslessly", async () => {
  const postRepo = new InMemoryPostRepo([seed()]);
  const { outbox } = recordingOutbox();
  await deletePost({ deps: { repo: postRepo, clock, outbox }, input: { workspaceId: WS, id: "post-1" } });

  const deps = { postRepo, clock, outbox } as unknown as ReverterDeps;
  await postDeleteReverter.applyInverse({ workspaceId: WS, item: deleteItem, deps });

  const restored = await postRepo.findById({ workspaceId: WS, id: "post-1" });
  assert.ok(restored);
  assert.equal(isTrashed(restored), false, "the marker must be cleared");
  assert.equal(restored.deletedAt, null);
  assert.equal(restored.title, "Hello World", "every field survives the round trip");
  assert.equal(restored.slug, "hello-world");
  assert.equal(restored.status, "published");
  assert.equal(restored.version, 5, "INV-04: the restore bumps the version, never restores the old number");
  assert.equal(restored.updatedAt, "2026-07-30T12:00:00.000Z");
});

test("restoring a PUBLISHED row re-emits entry.published — symmetric to the delete's entry.unpublished", async () => {
  const postRepo = new InMemoryPostRepo([seed({ status: "published" })]);
  const { outbox, events } = recordingOutbox();

  await deletePost({ deps: { repo: postRepo, clock, outbox }, input: { workspaceId: WS, id: "post-1" } });
  assert.deepEqual(events.map((e) => e.name), ["entry.unpublished"]);

  await postDeleteReverter.applyInverse({
    workspaceId: WS,
    item: deleteItem,
    deps: { postRepo, clock, outbox } as unknown as ReverterDeps,
  });

  assert.deepEqual(
    events.map((e) => e.name),
    ["entry.unpublished", "entry.published"],
    "SEO's sitemap cache must be told the entry is back",
  );
  assert.equal(events[1].id, "post-1-entry.published-5", "the event id carries the post-restore version");
});

test("restoring a DRAFT row emits nothing — it never re-entered the public site", async () => {
  const postRepo = new InMemoryPostRepo([seed({ status: "draft" })]);
  const { outbox, events } = recordingOutbox();

  await deletePost({ deps: { repo: postRepo, clock, outbox }, input: { workspaceId: WS, id: "post-1" } });
  await postDeleteReverter.applyInverse({
    workspaceId: WS,
    item: deleteItem,
    deps: { postRepo, clock, outbox } as unknown as ReverterDeps,
  });

  assert.deepEqual(events, []);
});

test("currentVersion reads the trashed row's version — the revert guard must see through the trash", async () => {
  const postRepo = new InMemoryPostRepo([seed()]);
  const { outbox } = recordingOutbox();
  await deletePost({ deps: { repo: postRepo, clock, outbox }, input: { workspaceId: WS, id: "post-1" } });

  const deps = { postRepo, clock, outbox } as unknown as ReverterDeps;
  assert.equal(await postDeleteReverter.currentVersion({ workspaceId: WS, entityId: "post-1", deps }), 4);
  assert.equal(await postDeleteReverter.currentVersion({ workspaceId: WS, entityId: "gone", deps }), null);
});

test("applyInverse on a row that no longer exists throws rather than silently succeeding", async () => {
  const postRepo = new InMemoryPostRepo();
  const { outbox } = recordingOutbox();

  await assert.rejects(
    () =>
      postDeleteReverter.applyInverse({
        workspaceId: WS,
        item: deleteItem,
        deps: { postRepo, clock, outbox } as unknown as ReverterDeps,
      }),
    /post 'post-1' was not found/,
  );
});

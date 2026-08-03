import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "../../../core/ports";
import { openContentDb } from "../../../db/sqlite/content-db";
import {
  createPost,
  deletePost,
  getAdminPostById,
  getPublishedPostBySlug,
  isTrashed,
  listAdminPages,
  listAdminPosts,
  listPublishedPosts,
  updatePost,
  PostConflictError,
  PostNotFoundError,
  type PostRecord,
  type PostRepoPort,
} from "../post";
import { InMemoryPostRepo } from "../repo.memory";
import { SqlitePostRepo } from "../repo.sqlite";

/**
 * @file Certification of the soft delete: the `deletePost` domain function, the trash-awareness it
 * adds to every read, and `PostRepoPort.softDelete` on BOTH adapters (the rule-of-two contract
 * discipline `repo.memory.ts`/`repo.sqlite.ts` already follow elsewhere).
 *
 * ADDITIVE ONLY. `post.test.ts` and `post.transition-events.test.ts` are untouched by this feature
 * and must keep passing byte-for-byte: every row they build carries no `deletedAt`, and `isTrashed`
 * reads an absent marker as "live", so every pre-existing assertion holds unchanged.
 */

const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

interface CapturedEvent {
  id: string;
  name: string;
  aggregateId: string;
  payload: unknown;
}

function recordingOutbox(): { outbox: OutboxPort; events: CapturedEvent[] } {
  const events: CapturedEvent[] = [];
  return {
    events,
    outbox: {
      enqueue: async (event: { id: string; name: string; aggregateId: string; payload: unknown }) => {
        events.push({ id: event.id, name: event.name, aggregateId: event.aggregateId, payload: event.payload });
      },
      claimPending: async () => [],
      markDelivered: async () => {},
      markFailed: async () => {},
    } as unknown as OutboxPort,
  };
}

const clock = { nowIso: () => "2026-07-30T12:00:00.000Z" };
const WS = "workspace-1";

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

// ---------------------------------------------------------------------------
// 1. deletePost — the marker, the version bump, the not-found rules
// ---------------------------------------------------------------------------

test("deletePost stamps a trash marker and keeps the row (soft, not hard)", async () => {
  const repo = new InMemoryPostRepo([seed()]);

  const { post } = await deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "post-1" } });

  assert.equal(post.deletedAt, "2026-07-30T12:00:00.000Z");
  assert.equal(post.version, 4, "a trash is a state change — the version must advance");
  assert.equal(post.updatedAt, "2026-07-30T12:00:00.000Z");

  // The row is STILL THERE at the port layer — this is the whole point of a soft delete, and what
  // postDeleteReverter depends on.
  const stillThere = await repo.findById({ workspaceId: WS, id: "post-1" });
  assert.ok(stillThere, "softDelete must never remove the row");
  assert.equal(stillThere.title, "Hello World", "every field survives, so a restore is lossless");
  assert.equal(stillThere.bodyJson && typeof stillThere.bodyJson, "object");
  assert.equal(isTrashed(stillThere), true);
});

test("deletePost rejects an unknown id", async () => {
  const repo = new InMemoryPostRepo([seed()]);
  await assert.rejects(
    () => deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "nope" } }),
    PostNotFoundError,
  );
});

test("deletePost rejects an already-trashed row rather than bumping the version a second time", async () => {
  const repo = new InMemoryPostRepo([seed()]);
  await deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "post-1" } });

  await assert.rejects(
    () => deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "post-1" } }),
    PostNotFoundError,
  );

  const row = await repo.findById({ workspaceId: WS, id: "post-1" });
  assert.equal(row?.version, 4, "the refused second delete must not have advanced the version again");
});

test("deletePost is workspace-scoped — another workspace's id is not found", async () => {
  const repo = new InMemoryPostRepo([seed()]);
  await assert.rejects(
    () => deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: "other-ws", id: "post-1" } }),
    PostNotFoundError,
  );
});

test("deletePost is kind-blind, exactly like updatePost — the kind guard belongs to the route/tool", async () => {
  const repo = new InMemoryPostRepo([seed({ id: "pg1", kind: "page", slug: "about" })]);
  const { post } = await deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "pg1" } });
  assert.equal(post.kind, "page");
});

// ---------------------------------------------------------------------------
// 2. Lifecycle event — reuses classifyStatusTransition rather than a new event name
// ---------------------------------------------------------------------------

test("deleting a PUBLISHED row emits entry.unpublished (SEO's sitemap-cache invalidation signal)", async () => {
  const repo = new InMemoryPostRepo([seed({ status: "published" })]);
  const { outbox, events } = recordingOutbox();

  await deletePost({ deps: { repo, clock, outbox }, input: { workspaceId: WS, id: "post-1" } });

  assert.equal(events.length, 1);
  assert.equal(events[0].name, "entry.unpublished");
  assert.equal(events[0].aggregateId, "post-1");
  assert.equal(events[0].id, "post-1-entry.unpublished-4", "the event id must carry the POST-delete version");
  assert.deepEqual(events[0].payload, { entryId: "post-1", contentType: "post" });
});

test("deleting a DRAFT row emits nothing — it was never on the public site", async () => {
  const repo = new InMemoryPostRepo([seed({ status: "draft" })]);
  const { outbox, events } = recordingOutbox();

  await deletePost({ deps: { repo, clock, outbox }, input: { workspaceId: WS, id: "post-1" } });

  assert.deepEqual(events, []);
});

// ---------------------------------------------------------------------------
// 3. Trash-aware reads — a trashed row is invisible everywhere
// ---------------------------------------------------------------------------

test("a trashed row disappears from listAdminPosts, listAdminPages, and listPublishedPosts", async () => {
  const repo = new InMemoryPostRepo([
    seed({ id: "p1", slug: "p1", kind: "post", status: "published" }),
    seed({ id: "p2", slug: "p2", kind: "post", status: "published" }),
    seed({ id: "g1", slug: "g1", kind: "page", status: "published" }),
  ]);

  await deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "p1" } });
  await deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "g1" } });

  const posts = await listAdminPosts({ deps: { repo }, input: { workspaceId: WS } });
  assert.deepEqual(posts.posts.map((p) => p.id), ["p2"]);

  const pages = await listAdminPages({ deps: { repo }, input: { workspaceId: WS } });
  assert.deepEqual(pages.posts.map((p) => p.id), []);

  const published = await listPublishedPosts({ deps: { repo }, input: { workspaceId: WS } });
  assert.deepEqual(published.posts.map((p) => p.id), ["p2"]);
});

test("a trashed row 404s from getAdminPostById, indistinguishably from a missing id", async () => {
  const repo = new InMemoryPostRepo([seed()]);
  await deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "post-1" } });

  const trashed = await getAdminPostById({ deps: { repo }, input: { workspaceId: WS, id: "post-1" } }).then(
    () => null,
    (e: Error) => e,
  );
  const missing = await getAdminPostById({ deps: { repo }, input: { workspaceId: WS, id: "never-existed" } }).then(
    () => null,
    (e: Error) => e,
  );

  assert.ok(trashed instanceof PostNotFoundError);
  assert.ok(missing instanceof PostNotFoundError);
  assert.equal(
    trashed.message.replace("post-1", "X"),
    missing.message.replace("never-existed", "X"),
    "identical shape — a trashed row must not be distinguishable from a missing one",
  );
});

test("a trashed PUBLISHED row vanishes from the public site (getPublishedPostBySlug)", async () => {
  const repo = new InMemoryPostRepo([seed({ status: "published" })]);
  const before = await getPublishedPostBySlug({ deps: { repo }, input: { workspaceId: WS, slug: "hello-world" } });
  assert.equal(before.post.id, "post-1");

  await deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "post-1" } });

  await assert.rejects(
    () => getPublishedPostBySlug({ deps: { repo }, input: { workspaceId: WS, slug: "hello-world" } }),
    PostNotFoundError,
  );
});

test("updatePost refuses to edit a trashed row — there is no edit-through-the-trash path", async () => {
  const repo = new InMemoryPostRepo([seed()]);
  await deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "post-1" } });

  await assert.rejects(
    () =>
      updatePost({
        deps: { repo, clock, outbox: noopOutbox },
        input: { workspaceId: WS, id: "post-1", title: "Resurrect", slug: "hello-world", bodyJson: { type: "doc", content: [] }, status: "draft" },
      }),
    PostNotFoundError,
  );
});

// ---------------------------------------------------------------------------
// 4. The slug stays reserved — the invariant that keeps createPost agreeing with the unique index
// ---------------------------------------------------------------------------

test("a trashed row KEEPS its slug: creating a new post with that explicit slug conflicts cleanly", async () => {
  const repo = new InMemoryPostRepo([seed({ slug: "hello-world" })]);
  await deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "post-1" } });

  // Must be a domain-level PostConflictError, NOT a pass-through that later dies on the SQLite
  // posts_workspace_slug_unique index — that is the whole reason findBySlug stays trash-blind.
  await assert.rejects(
    () => createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "new-1", title: "Hello World", slug: "hello-world" } }),
    PostConflictError,
  );
});

test("a DERIVED slug suffixes past a trashed row's slug instead of colliding with it", async () => {
  const repo = new InMemoryPostRepo([seed({ slug: "hello-world" })]);
  await deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "post-1" } });

  const { post } = await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "new-1", title: "Hello World" } });
  assert.equal(post.slug, "hello-world-2");
});

// ---------------------------------------------------------------------------
// 5. PostRepoPort.softDelete — the SAME contract on both adapters (rule of two)
// ---------------------------------------------------------------------------

const ADAPTERS: Array<{ name: string; make: () => PostRepoPort }> = [
  { name: "InMemoryPostRepo", make: () => new InMemoryPostRepo() },
  { name: "SqlitePostRepo", make: () => new SqlitePostRepo(openContentDb(":memory:")) },
];

for (const adapter of ADAPTERS) {
  test(`${adapter.name}: softDelete marks the row without removing it, and save() can clear the marker again`, async () => {
    const repo = adapter.make();
    await repo.save(seed({ status: "published" }));

    await repo.softDelete({ workspaceId: WS, id: "post-1", deletedAt: "2026-07-30T12:00:00.000Z", updatedAt: "2026-07-30T12:00:00.000Z", version: 4 });

    const trashed = await repo.findById({ workspaceId: WS, id: "post-1" });
    assert.ok(trashed, "the row must survive a softDelete");
    assert.equal(trashed.deletedAt, "2026-07-30T12:00:00.000Z");
    assert.equal(trashed.version, 4);
    assert.equal(trashed.updatedAt, "2026-07-30T12:00:00.000Z");
    assert.equal(trashed.title, "Hello World", "no field is lost");

    // Trash-blind at the port layer, by design — the domain functions do the filtering.
    assert.equal((await repo.list({ workspaceId: WS })).length, 1);
    assert.ok(await repo.findBySlug({ workspaceId: WS, slug: "hello-world" }), "a trashed row keeps reserving its slug");

    // The restore path postDeleteReverter uses: a plain save() with the marker cleared.
    await repo.save({ ...trashed, deletedAt: null, version: 5 });
    const restored = await repo.findById({ workspaceId: WS, id: "post-1" });
    assert.equal(restored?.deletedAt, null);
    assert.equal(restored?.version, 5);
  });

  test(`${adapter.name}: softDelete on an unknown id is a no-op, not a throw`, async () => {
    const repo = adapter.make();
    await repo.save(seed());
    await repo.softDelete({ workspaceId: WS, id: "does-not-exist", deletedAt: "X", updatedAt: "X", version: 99 });

    const untouched = await repo.findById({ workspaceId: WS, id: "post-1" });
    assert.equal(untouched?.version, 3, "an unrelated row must be untouched");
    assert.equal(untouched?.deletedAt ?? null, null);
  });

  test(`${adapter.name}: softDelete is workspace-scoped`, async () => {
    const repo = adapter.make();
    await repo.save(seed({ id: "shared-id", workspaceId: WS }));
    await repo.softDelete({ workspaceId: "other-ws", id: "shared-id", deletedAt: "X", updatedAt: "X", version: 99 });

    const untouched = await repo.findById({ workspaceId: WS, id: "shared-id" });
    assert.equal(untouched?.deletedAt ?? null, null, "another workspace's softDelete must not reach this row");
  });

  test(`${adapter.name}: a freshly saved row reads back as live (deletedAt null/absent), no backfill needed`, async () => {
    const repo = adapter.make();
    await repo.save(seed());
    const row = await repo.findById({ workspaceId: WS, id: "post-1" });
    assert.ok(row);
    assert.equal(isTrashed(row), false);
  });
}

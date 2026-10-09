import assert from "node:assert/strict";
import test from "node:test";
import type Database from "better-sqlite3";

import type { OutboxPort } from "@jini-ai/cms/core";
import { bindRemoveEntity, createTrashService, type TrashAdapter } from "@jini-ai/cms/trash";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createPostTrashAdapter, POST_ENTITY_TYPE } from "#src/features/trash/adapters/post";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "#src/features/trash/repo.sqlite";
import { removeEntityWithoutBlocker } from "#src/features/trash/remove-without-blocker";
import {
  createPost,
  deletePost,
  retirePostForReplacement,
  updatePost,
  PostConflictError,
  ROOT_SLUG,
  type PostRecord,
  type PostRepoPort,
} from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { SqlitePostRepo } from "../repo.sqlite.js";
import { removeVia } from "./remove-post-double.js";
import { buildPostRecord } from "./post-record.fixture.js";

/**
 * @file Owner order 2026-10-08: an item in the Trash never blocks a slug for new content.
 *
 * A write that claims a slug only a TRASHED row holds moves that row aside (`<slug>-trashed`,
 * `/` -> `home-trashed`, suffixed on collision) in the same transaction, without touching its
 * version or trash marker — so the Trash's own version check still matches and Restore brings the
 * row back, at the renamed address. A LIVE holder still conflicts exactly as before.
 */

const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};
const AT = "2026-10-08T12:00:00.000Z";
const clock = { nowMs: () => Date.parse(AT), nowIso: () => AT };
const WS = "workspace-1";

function trashed(fields: Partial<PostRecord>): PostRecord {
  return buildPostRecord({ workspaceId: WS, version: 4, deletedAt: "2026-10-01T00:00:00.000Z", ...fields });
}

const ADAPTERS: Array<{ name: string; make: (rows: PostRecord[]) => Promise<PostRepoPort> }> = [
  { name: "InMemoryPostRepo", make: async (rows) => new InMemoryPostRepo(rows) },
  {
    name: "SqlitePostRepo",
    make: async (rows) => {
      const db = openContentDb(":memory:");
      (db as unknown as { $client: Database.Database }).$client
        .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
        .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");
      const repo = new SqlitePostRepo(db);
      for (const row of rows) await repo.save(row);
      return repo;
    },
  },
];

for (const adapter of ADAPTERS) {
  test(`${adapter.name}: an explicit slug held only by a trashed row is taken, and the trashed row moves aside untouched otherwise`, async () => {
    const repo = await adapter.make([trashed({ id: "old-about", slug: "about", kind: "page" })]);

    const { post } = await createPost({
      deps: { repo, clock },
      input: { workspaceId: WS, id: "new-about", title: "About", slug: "about", kind: "page" },
    });

    assert.equal(post.slug, "about");
    assert.equal((await repo.findBySlug({ workspaceId: WS, slug: "about" }))?.id, "new-about");
    const moved = await repo.findById({ workspaceId: WS, id: "old-about" });
    assert.equal(moved?.slug, "about-trashed");
    assert.equal(moved?.deletedAt, "2026-10-01T00:00:00.000Z", "it stays in the Trash");
    assert.equal(moved?.version, 4, "the version the Trash index recorded must still match, or Restore refuses");
  });

  test(`${adapter.name}: a page in the Trash at "/" never stops a new homepage from taking "/"`, async () => {
    const repo = await adapter.make([trashed({ id: "old-home", slug: ROOT_SLUG, kind: "page" })]);

    const { post } = await createPost({
      deps: { repo, clock },
      input: { workspaceId: WS, id: "new-home", title: "Home", slug: ROOT_SLUG, kind: "page" },
    });

    assert.equal(post.slug, ROOT_SLUG);
    assert.equal((await repo.findById({ workspaceId: WS, id: "old-home" }))?.slug, "home-trashed");
  });
}

test("the moved-aside slug suffixes past one an earlier release already used", async () => {
  const repo = new InMemoryPostRepo([
    trashed({ id: "first", slug: "about-trashed" }),
    trashed({ id: "second", slug: "about" }),
  ]);

  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "third", title: "About", slug: "about" } });

  assert.equal((await repo.findById({ workspaceId: WS, id: "second" }))?.slug, "about-trashed-2");
  assert.equal((await repo.findById({ workspaceId: WS, id: "first" }))?.slug, "about-trashed");
});

test("a DERIVED slug takes the base a trashed row held instead of suffixing past it", async () => {
  const repo = new InMemoryPostRepo([trashed({ id: "old", slug: "hello-world" })]);

  const { post } = await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "new", title: "Hello World" } });

  assert.equal(post.slug, "hello-world");
  assert.equal((await repo.findById({ workspaceId: WS, id: "old" }))?.slug, "hello-world-trashed");
});

test("a DERIVED slug still suffixes past a LIVE holder, and takes a trashed holder's slug further down the chain", async () => {
  const repo = new InMemoryPostRepo([
    buildPostRecord({ id: "live", workspaceId: WS, slug: "hello-world" }),
    trashed({ id: "old", slug: "hello-world-2" }),
  ]);

  const { post } = await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "new", title: "Hello World" } });

  assert.equal(post.slug, "hello-world-2");
  assert.equal((await repo.findById({ workspaceId: WS, id: "live" }))?.slug, "hello-world", "a live row is never moved");
});

test("a LIVE holder still conflicts, and nothing is renamed", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord({ id: "live", workspaceId: WS, slug: "about" })]);

  await assert.rejects(
    () => createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "new", title: "About", slug: "about" } }),
    new PostConflictError("slug 'about' already exists")
  );
  assert.equal((await repo.findById({ workspaceId: WS, id: "live" }))?.slug, "about");
});

test("updatePost renaming onto a slug only a trashed row holds succeeds and moves that row aside", async () => {
  const repo = new InMemoryPostRepo([
    buildPostRecord({ id: "start", workspaceId: WS, slug: "start", kind: "page", version: 2 }),
    trashed({ id: "old-home", slug: ROOT_SLUG, kind: "page" }),
  ]);

  const { post } = await updatePost({
    deps: { repo, clock, outbox: noopOutbox },
    input: { workspaceId: WS, id: "start", title: "Home", slug: ROOT_SLUG, bodyJson: { type: "doc", content: [] }, status: "published" },
  });

  assert.equal(post.slug, ROOT_SLUG);
  assert.equal((await repo.findById({ workspaceId: WS, id: "old-home" }))?.slug, "home-trashed");
});

test("updatePost onto a LIVE holder's slug still conflicts", async () => {
  const repo = new InMemoryPostRepo([
    buildPostRecord({ id: "a", workspaceId: WS, slug: "a" }),
    buildPostRecord({ id: "b", workspaceId: WS, slug: "b" }),
  ]);

  await assert.rejects(
    () =>
      updatePost({
        deps: { repo, clock, outbox: noopOutbox },
        input: { workspaceId: WS, id: "a", title: "A", slug: "b", bodyJson: { type: "doc", content: [] }, status: "draft" },
      }),
    new PostConflictError("slug 'b' already exists")
  );
});

/** A SQLite post repo wired to the REAL Trash service (its stored-version check is what a version
 * bump would break), plus the `remove` port `deletePost`/`retirePostForReplacement` are handed. */
function openRealTrash() {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");
  const repo = new SqlitePostRepo(db);
  const adapters = new Map<string, TrashAdapter>([[POST_ENTITY_TYPE, createPostTrashAdapter(client)]]);
  let seq = 0;
  const trash = createTrashService({
    repo: new SqliteTrashRepo(client),
    adapters,
    idGen: { newId: () => `trash-${(seq += 1)}` },
    transaction: ({ work }) => createContentDbTransactionRunner(client)(work),
    entityPolicy: ({ entityType }) => adapters.has(entityType),
  });
  const remove = removeEntityWithoutBlocker({ remove: bindRemoveEntity({ trash, entityType: POST_ENTITY_TYPE }) });
  return { client, repo, trash, remove };
}

test("a row trashed through deletePost and then moved aside is still restorable through the real Trash", async () => {
  const { client, repo, trash, remove } = openRealTrash();

  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "old-about", title: "About", slug: "about", kind: "page" } });
  await deletePost({ deps: { repo, clock, outbox: noopOutbox, remove }, input: { workspaceId: WS, id: "old-about" } });
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "new-about", title: "About", slug: "about", kind: "page" } });

  const outcome = await trash.restore({ workspaceId: WS, entityType: POST_ENTITY_TYPE, entityId: "old-about", at: AT });

  assert.equal(outcome, "restored");
  const restored = await repo.findById({ workspaceId: WS, id: "old-about" });
  assert.equal(restored?.deletedAt, null);
  assert.equal(restored?.slug, "about-trashed", "it comes back at the address it was moved to");
  assert.equal((await repo.findBySlug({ workspaceId: WS, slug: "about" }))?.id, "new-about", "the new page keeps its address");
  client.close();
});

test("publish retiring a holder that is ALREADY in the Trash leaves it restorable through the real Trash", async () => {
  const { client, repo, trash, remove } = openRealTrash();

  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "old-about", title: "About", slug: "about", kind: "page" } });
  const { post: inTrash } = await deletePost({ deps: { repo, clock, outbox: noopOutbox, remove }, input: { workspaceId: WS, id: "old-about" } });
  const { post: retired } = await retirePostForReplacement({
    deps: { repo, clock, outbox: noopOutbox, remove },
    input: { workspaceId: WS, id: "old-about", expectedVersion: inTrash.version, today: "20261008" },
  });

  assert.equal(retired.slug, "about-trashed");
  assert.equal(retired.version, inTrash.version, "the version the Trash index recorded must still match");
  assert.equal(await repo.findBySlug({ workspaceId: WS, slug: "about" }), null, "the address is free for the incoming row");
  const outcome = await trash.restore({ workspaceId: WS, entityType: POST_ENTITY_TYPE, entityId: "old-about", at: AT });
  assert.equal(outcome, "restored");
  const restored = await repo.findById({ workspaceId: WS, id: "old-about" });
  assert.equal(restored?.deletedAt, null);
  assert.equal(restored?.slug, "about-trashed");
  client.close();
});

test("the in-memory remove double still works with a moved-aside row (deletePost after release)", async () => {
  const repo = new InMemoryPostRepo([trashed({ id: "old", slug: "about" })]);
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "new", title: "About", slug: "about" } });

  const { post } = await deletePost({ deps: { repo, clock, outbox: noopOutbox, remove: removeVia(repo) }, input: { workspaceId: WS, id: "new" } });

  assert.equal(post.slug, "about", "trashing the new row keeps its slug until something else claims it");
});

import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import {
  createPost,
  deletePost,
  updatePost,
  SYSTEM_ACTOR_ID,
  type PostRecord,
  type PostRepoPort,
} from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { SqlitePostRepo } from "../repo.sqlite.js";

/**
 * @file Certification of the `post_revisions` ledger writer — `PostRepoPort.appendRevision`/
 * `listRevisions`/`transaction` on BOTH adapters (rule-of-two, mirroring `post.delete.test.ts`),
 * and their wiring into `createPost`/`updatePost`/`deletePost`.
 *
 * Covers: a revision row on create/update/delete; the `previousId` chain across a post's history;
 * the full-snapshot payload round-tripping the five fields `postUpdateReverter`'s narrower inverse
 * is known to drop (`seoExtJson`, `memberAccessJson`, `bodyHtml`/`bodyFormat`, `kind`, `deletedAt`
 * — see `reverters.ts`); and the atomicity guarantee `PostRepoPort.transaction` exists for (a
 * failed revision append must roll back the post write it was paired with).
 */

const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

const clock = { nowIso: () => "2026-09-18T12:00:00.000Z" };
const WS = "workspace-1";

function seed(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WS,
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "post",
    updatedAt: "2026-04-06T00:00:00.000Z",
    version: 3,
    ...overrides,
  };
}

const ADAPTERS: Array<{ name: string; make: () => PostRepoPort }> = [
  { name: "InMemoryPostRepo", make: () => new InMemoryPostRepo() },
  { name: "SqlitePostRepo", make: () => new SqlitePostRepo(openContentDb(":memory:")) },
];

// ---------------------------------------------------------------------------
// 1. PostRepoPort.appendRevision/listRevisions — the raw port contract, both adapters
// ---------------------------------------------------------------------------

for (const adapter of ADAPTERS) {
  test(`${adapter.name}: appendRevision writes a readable row; previousId is null for the first revision`, async () => {
    const repo = adapter.make();
    const { id, previousId } = await repo.appendRevision({
      postId: "post-1",
      workspaceId: WS,
      seq: 1,
      op: "create",
      stateJson: seed({ version: 1 }),
      actorId: "user-1",
      recordedAt: "2026-09-18T00:00:00.000Z",
    });

    assert.equal(previousId, null, "no prior revision exists for this post yet");
    const rows = await repo.listRevisions({ workspaceId: WS, postId: "post-1" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id);
    assert.equal(rows[0].seq, 1);
    assert.equal(rows[0].op, "create");
    assert.equal(rows[0].actorId, "user-1");
    assert.ok(rows[0].contentHash.length > 0, "contentHash must be computed, not left blank");
    assert.deepEqual(rows[0].stateJson, seed({ version: 1 }));
  });

  test(`${adapter.name}: a second appendRevision for the same post chains previousId to the first row's id`, async () => {
    const repo = adapter.make();
    const first = await repo.appendRevision({
      postId: "post-1",
      workspaceId: WS,
      seq: 1,
      op: "create",
      stateJson: seed({ version: 1 }),
      actorId: "user-1",
      recordedAt: "2026-09-18T00:00:00.000Z",
    });
    const second = await repo.appendRevision({
      postId: "post-1",
      workspaceId: WS,
      seq: 2,
      op: "update",
      stateJson: seed({ version: 2, title: "Changed" }),
      actorId: "user-1",
      recordedAt: "2026-09-18T00:01:00.000Z",
    });

    assert.equal(second.previousId, first.id);
    const rows = await repo.listRevisions({ workspaceId: WS, postId: "post-1" });
    assert.deepEqual(rows.map((r) => r.seq), [1, 2], "listRevisions reads back oldest-first");
  });

  test(`${adapter.name}: appendRevision is scoped by (workspaceId, postId) — an unrelated post's history does not chain in`, async () => {
    const repo = adapter.make();
    await repo.appendRevision({
      postId: "other-post",
      workspaceId: WS,
      seq: 1,
      op: "create",
      stateJson: seed({ id: "other-post", version: 1 }),
      actorId: "user-1",
      recordedAt: "2026-09-18T00:00:00.000Z",
    });

    const { previousId } = await repo.appendRevision({
      postId: "post-1",
      workspaceId: WS,
      seq: 1,
      op: "create",
      stateJson: seed({ version: 1 }),
      actorId: "user-1",
      recordedAt: "2026-09-18T00:00:01.000Z",
    });

    assert.equal(previousId, null, "post-1 has no revisions of its own yet");
  });
}

// ---------------------------------------------------------------------------
// 2. createPost/updatePost/deletePost — the domain-layer wiring
// ---------------------------------------------------------------------------

for (const adapter of ADAPTERS) {
  test(`${adapter.name}: createPost writes a create revision and returns its id`, async () => {
    const repo = adapter.make();
    const { post, revisionId, previousRevisionId } = await createPost({
      deps: { repo, clock },
      input: { workspaceId: WS, id: "post-1", title: "Hello" },
    });

    assert.equal(previousRevisionId, null);
    const rows = await repo.listRevisions({ workspaceId: WS, postId: "post-1" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, revisionId);
    assert.equal(rows[0].op, "create");
    assert.equal(rows[0].seq, post.version, "seq must equal the post's version after the write");
    assert.equal(rows[0].actorId, SYSTEM_ACTOR_ID, "an omitted actorId defaults to the system actor");
    assert.deepEqual(rows[0].stateJson, post, "stateJson must be the exact PostRecord that was saved");
  });

  test(`${adapter.name}: createPost honors a caller-supplied actorId`, async () => {
    const repo = adapter.make();
    await createPost({
      deps: { repo, clock },
      input: { workspaceId: WS, id: "post-1", title: "Hello", actorId: "user-42" },
    });

    const rows = await repo.listRevisions({ workspaceId: WS, postId: "post-1" });
    assert.equal(rows[0].actorId, "user-42");
  });

  test(`${adapter.name}: updatePost writes an update revision chained to the create revision`, async () => {
    const repo = adapter.make();
    const { revisionId: createRevisionId } = await createPost({
      deps: { repo, clock },
      input: { workspaceId: WS, id: "post-1", title: "Hello" },
    });

    const { post, revisionId, previousRevisionId } = await updatePost({
      deps: { repo, clock, outbox: noopOutbox },
      input: {
        workspaceId: WS,
        id: "post-1",
        title: "Hello, Updated",
        slug: "hello",
        bodyJson: { type: "doc", content: [] },
        status: "draft",
      },
    });

    assert.equal(previousRevisionId, createRevisionId);
    const rows = await repo.listRevisions({ workspaceId: WS, postId: "post-1" });
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.op), ["create", "update"]);
    assert.equal(rows[1].id, revisionId);
    assert.equal(rows[1].seq, post.version);
    assert.deepEqual(rows[1].stateJson, post);
  });

  test(`${adapter.name}: deletePost writes a delete revision carrying the trashed state, chained to the prior revision`, async () => {
    const repo = adapter.make();
    const { revisionId: createRevisionId } = await createPost({
      deps: { repo, clock },
      input: { workspaceId: WS, id: "post-1", title: "Hello", status: "published" },
    });

    const { post, revisionId, previousRevisionId } = await deletePost({
      deps: { repo, clock, outbox: noopOutbox },
      input: { workspaceId: WS, id: "post-1" },
    });

    assert.equal(previousRevisionId, createRevisionId);
    assert.ok(post.deletedAt, "the trashed post record must carry a deletedAt marker");
    const rows = await repo.listRevisions({ workspaceId: WS, postId: "post-1" });
    assert.equal(rows.length, 2);
    assert.equal(rows[1].op, "delete");
    assert.equal(rows[1].id, revisionId);
    assert.equal(rows[1].stateJson.deletedAt, post.deletedAt);
    assert.deepEqual(rows[1].stateJson, post);
  });

  test(`${adapter.name}: a revision's payload round-trips fields the older captureInverse path is known to drop`, async () => {
    const repo = adapter.make();
    // Seeded directly through the repo port (bypassing createPost/updatePost, which have no input
    // fields for seoExtJson/memberAccessJson/bodyHtml — those are written by other chokepoints),
    // exactly the way `post.delete.test.ts`'s own adapter-parity tests seed a starting row.
    await repo.save(
      seed({
        kind: "page",
        bodyFormat: "html",
        bodyHtml: "<p>bespoke</p>",
        seoExtJson: JSON.stringify({ title: "SEO Title" }),
        memberAccessJson: JSON.stringify({ visibility: "members" }),
        version: 1,
      })
    );

    const { post } = await updatePost({
      deps: { repo, clock, outbox: noopOutbox },
      input: {
        workspaceId: WS,
        id: "post-1",
        title: "New Title",
        slug: "hello-world",
        bodyJson: { type: "doc", content: [] },
        status: "published",
      },
    });

    const rows = await repo.listRevisions({ workspaceId: WS, postId: "post-1" });
    const latest = rows[rows.length - 1];
    assert.equal(latest.stateJson.kind, "page");
    assert.equal(latest.stateJson.bodyFormat, "html");
    assert.equal(latest.stateJson.bodyHtml, "<p>bespoke</p>");
    assert.equal(latest.stateJson.seoExtJson, JSON.stringify({ title: "SEO Title" }));
    assert.equal(latest.stateJson.memberAccessJson, JSON.stringify({ visibility: "members" }));
    assert.deepEqual(latest.stateJson, post);
  });
}

// ---------------------------------------------------------------------------
// 3. Atomicity — the cheapest test that falsifies the whole design
// ---------------------------------------------------------------------------

/** Delegates every `PostRepoPort` method to `inner` except `appendRevision`, which always throws —
 *  used to prove the post write and the revision append share one transaction. */
function withThrowingAppendRevision(inner: PostRepoPort): PostRepoPort {
  return {
    findById: (r) => inner.findById(r),
    findBySlug: (r) => inner.findBySlug(r),
    list: (r) => inner.list(r),
    listPublishedPreviews: (r) => inner.listPublishedPreviews(r),
    save: (r) => inner.save(r),
    saveIfVersion: (r) => inner.saveIfVersion(r),
    softDelete: (r) => inner.softDelete(r),
    readAutosave: (r) => inner.readAutosave(r),
    writeAutosave: (r) => inner.writeAutosave(r),
    clearAutosave: (r) => inner.clearAutosave(r),
    appendRevision: async () => {
      throw new Error("simulated appendRevision failure");
    },
    listRevisions: (r) => inner.listRevisions(r),
    transaction: (fn) => inner.transaction(fn),
  };
}

for (const adapter of ADAPTERS) {
  test(`${adapter.name}: createPost's post write and revision append are atomic — a throwing appendRevision leaves no post row behind`, async () => {
    const inner = adapter.make();
    const repo = withThrowingAppendRevision(inner);

    await assert.rejects(
      () => createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "post-1", title: "Hello" } }),
      /simulated appendRevision failure/
    );

    const row = await inner.findById({ workspaceId: WS, id: "post-1" });
    assert.equal(row, null, "the post write must have been rolled back along with the failed revision append");
  });

  test(`${adapter.name}: updatePost's post write and revision append are atomic — a throwing appendRevision leaves the row unchanged`, async () => {
    const inner = adapter.make();
    const { post: seeded } = await createPost({
      deps: { repo: inner, clock },
      input: { workspaceId: WS, id: "post-1", title: "Hello" },
    });

    const repo = withThrowingAppendRevision(inner);
    await assert.rejects(
      () =>
        updatePost({
          deps: { repo, clock, outbox: noopOutbox },
          input: {
            workspaceId: WS,
            id: "post-1",
            title: "Changed",
            slug: seeded.slug,
            bodyJson: seeded.bodyJson,
            status: "draft",
          },
        }),
      /simulated appendRevision failure/
    );

    const row = await inner.findById({ workspaceId: WS, id: "post-1" });
    assert.equal(row?.title, "Hello", "the update write must have been rolled back along with the failed revision append");
    assert.equal(row?.version, seeded.version, "version must not have advanced either");
    const rows = await inner.listRevisions({ workspaceId: WS, postId: "post-1" });
    assert.equal(rows.length, 1, "only the original create revision may remain — the failed update must have written none");
  });

  test(`${adapter.name}: deletePost's softDelete write and revision append are atomic — a throwing appendRevision leaves the row live`, async () => {
    const inner = adapter.make();
    const { post: seeded } = await createPost({
      deps: { repo: inner, clock },
      input: { workspaceId: WS, id: "post-1", title: "Hello", status: "published" },
    });

    const repo = withThrowingAppendRevision(inner);
    await assert.rejects(
      () => deletePost({ deps: { repo, clock, outbox: noopOutbox }, input: { workspaceId: WS, id: "post-1" } }),
      /simulated appendRevision failure/
    );

    const row = await inner.findById({ workspaceId: WS, id: "post-1" });
    assert.equal(row?.deletedAt ?? null, null, "the trash marker must have been rolled back along with the failed revision append");
    assert.equal(row?.version, seeded.version, "version must not have advanced either");
  });
}

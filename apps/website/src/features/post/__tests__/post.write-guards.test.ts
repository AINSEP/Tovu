/**
 * @file Pins the refusal and fallback branches of `post.ts`'s write paths that the scenario suites
 * do not reach: publish-import guards, Trash write races, the derived-slug exhaustion refusal and
 * the default-clock read. Every refusal asserts its exact error class and message.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import {
  createPost,
  deletePost,
  findPublishedPostBySlug,
  importPostEntity,
  normalizeFeaturedMediaId,
  retirePostForReplacement,
  updatePost,
  PostConflictError,
  PostNotFoundError,
  PostValidationError,
  PostVersionConflictError,
  type PostRecord,
  type RemovePostFn,
} from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRecord } from "./post-record.fixture.js";

const WS = "workspace-1";
const clock = { nowMs: () => Date.parse("2026-10-20T12:00:00.000Z") };
const outbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};
const removeFails = (reason: "not-found" | "version-changed"): RemovePostFn => async () => ({ ok: false, reason });

test("import: a create over a row that already exists here is a version conflict", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord({ version: 4 })]);
  await assert.rejects(
    importPostEntity({ deps: { clock, repo, outbox }, input: { workspaceId: WS, record: buildPostRecord() } }),
    (error: unknown) => error instanceof PostVersionConflictError &&
      error.message === "post 'post-1' already exists at this destination (version 4) but was published as new",
  );
});

test("import: a trashed destination row is refused rather than resurrected", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord({ deletedAt: "2026-10-01T00:00:00.000Z" })]);
  await assert.rejects(
    importPostEntity({ deps: { clock, repo, outbox }, input: { workspaceId: WS, record: buildPostRecord(), expectedVersion: 1 } }),
    (error: unknown) => error instanceof PostConflictError &&
      error.message === "post 'post-1' is in the trash at this destination — restore it before publishing over it",
  );
});

test("import: a kind change is refused because kind is fixed at creation", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord({ kind: "page" })]);
  await assert.rejects(
    importPostEntity({ deps: { clock, repo, outbox }, input: { workspaceId: WS, record: buildPostRecord(), expectedVersion: 1 } }),
    (error: unknown) => error instanceof PostConflictError &&
      error.message === "post 'post-1' is a 'page' at this destination but a 'post' at the source — kind is fixed at creation",
  );
});

test("import: a slug held by a different destination row, even a trashed one, is a conflict", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord({ id: "other", deletedAt: "2026-10-01T00:00:00.000Z" })]);
  await assert.rejects(
    importPostEntity({ deps: { clock, repo, outbox }, input: { workspaceId: WS, record: buildPostRecord() } }),
    (error: unknown) => error instanceof PostConflictError && error.message === "slug 'hello-world' already exists",
  );
});

test("import: an actor-less create records a system-attributed create revision with the source's authorship", async () => {
  const repo = new InMemoryPostRepo([]);
  const record = buildPostRecord({ createdAt: "2026-01-01T00:00:00.000Z", createdByPrincipalId: "source-author", version: 9 });
  const { post } = await importPostEntity({ deps: { clock, repo, outbox }, input: { workspaceId: WS, record } });
  assert.equal(post.version, 1);
  assert.equal(post.createdByPrincipalId, "source-author");
  const [revision] = await repo.listRevisions({ workspaceId: WS, postId: "post-1" });
  assert.deepEqual(
    { op: revision?.op, actorId: revision?.actorId, delegatedByWorkspaceId: revision?.delegatedByWorkspaceId, delegatedById: revision?.delegatedById },
    { op: "create", actorId: "system", delegatedByWorkspaceId: null, delegatedById: null },
  );
});

test("import: an update keeps the destination row's own write-once authorship", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord({ createdAt: "2025-05-05T00:00:00.000Z", createdByPrincipalId: "local-author", version: 2 })]);
  const record = buildPostRecord({ title: "Replicated", createdAt: "2026-01-01T00:00:00.000Z", createdByPrincipalId: "source-author" });
  const { post } = await importPostEntity({ deps: { clock, repo, outbox }, input: { workspaceId: WS, record, expectedVersion: 2, actorId: "operator" } });
  assert.deepEqual({ title: post.title, version: post.version, createdAt: post.createdAt, createdBy: post.createdByPrincipalId }, { title: "Replicated", version: 3, createdAt: "2025-05-05T00:00:00.000Z", createdBy: "local-author" });
  const [revision] = await repo.listRevisions({ workspaceId: WS, postId: "post-1" });
  assert.deepEqual({ op: revision?.op, actorId: revision?.actorId }, { op: "update", actorId: "operator" });
});

test("delete: a row removed between the read and the Trash write is not-found", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord()]);
  await assert.rejects(
    deletePost({ deps: { clock, repo, outbox, remove: removeFails("not-found") }, input: { workspaceId: WS, id: "post-1" } }),
    (error: unknown) => error instanceof PostNotFoundError && error.message === "post 'post-1' was not found",
  );
});

test("delete: a row changed between the read and the Trash write is a conflict", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord()]);
  await assert.rejects(
    deletePost({ deps: { clock, repo, outbox, remove: removeFails("version-changed") }, input: { workspaceId: WS, id: "post-1" } }),
    (error: unknown) => error instanceof PostConflictError && error.message === "post 'post-1' changed while it was being deleted",
  );
});

test("retire: a missing holder is not-found", async () => {
  const repo = new InMemoryPostRepo([]);
  await assert.rejects(
    retirePostForReplacement({ deps: { clock, repo, outbox, remove: removeFails("not-found") }, input: { workspaceId: WS, id: "post-1", expectedVersion: 1, today: "2026-10-20" } }),
    (error: unknown) => error instanceof PostNotFoundError && error.message === "post 'post-1' was not found",
  );
});

test("retire: the holder vanishing during its Trash write is not-found", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord()]);
  await assert.rejects(
    retirePostForReplacement({ deps: { clock, repo, outbox, remove: removeFails("not-found") }, input: { workspaceId: WS, id: "post-1", expectedVersion: 1, today: "2026-10-20" } }),
    (error: unknown) => error instanceof PostNotFoundError && error.message === "post 'post-1' was not found",
  );
});

test("retire: the holder changing during its Trash write is a conflict", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord()]);
  await assert.rejects(
    retirePostForReplacement({ deps: { clock, repo, outbox, remove: removeFails("version-changed") }, input: { workspaceId: WS, id: "post-1", expectedVersion: 1, today: "2026-10-20" } }),
    (error: unknown) => error instanceof PostConflictError && error.message === "post 'post-1' changed while it was being retired",
  );
});

/** Loses every compare-and-set, as if another writer always moved the row first. */
class LosingCasRepo extends InMemoryPostRepo {
  override async saveIfVersion(): Promise<{ applied: boolean }> {
    return { applied: false };
  }
}

test("create: a trashed slug holder that changes while it is being moved aside is a conflict", async () => {
  const repo = new LosingCasRepo([buildPostRecord({ id: "trashed", deletedAt: "2026-10-01T00:00:00.000Z" })]);
  await assert.rejects(
    createPost({ deps: { clock, repo }, input: { workspaceId: WS, id: "new", title: "Hello World", slug: "hello-world" } }),
    (error: unknown) => error instanceof PostConflictError && error.message === "slug 'hello-world' changed while it was being taken from the Trash",
  );
});

/** Every slug is held by some other live post. */
class FullRepo extends InMemoryPostRepo {
  override async findBySlug(required: { workspaceId: string; slug: string }): Promise<PostRecord | null> {
    return buildPostRecord({ id: "holder", slug: required.slug });
  }
}

test("create: a derived slug with every candidate taken is refused after the bounded search", async () => {
  await assert.rejects(
    createPost({ deps: { clock, repo: new FullRepo([]) }, input: { workspaceId: WS, id: "new", title: "Busy" } }),
    (error: unknown) => error instanceof PostConflictError && error.message === "slug 'busy' already exists",
  );
});

test("update: an omitted slug without slugFromTitle validates as an empty slug", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord()]);
  await assert.rejects(
    updatePost({ deps: { clock, repo, outbox }, input: { workspaceId: WS, id: "post-1", title: "Hello World", bodyJson: { type: "doc", content: [] }, status: "draft" } }),
    (error: unknown) => error instanceof PostValidationError && error.message === "slug must use lowercase letters, numbers, and dashes",
  );
});

test("featured media id: blank, non-string and over-long values are refused", () => {
  for (const value of [" ", 5, "x".repeat(201)]) {
    assert.throws(() => normalizeFeaturedMediaId(value), (error: unknown) => error instanceof PostValidationError &&
      error.message === "featuredMediaId must be a media asset id (1-200 characters) or null");
  }
});

test("published-by-slug read defaults to the real clock when no instant is given", async () => {
  const repo = new InMemoryPostRepo([buildPostRecord(), buildPostRecord({ id: "later", slug: "later", publishAt: "2999-01-01T00:00:00.000Z" })]);
  assert.equal((await findPublishedPostBySlug({ deps: { repo }, input: { workspaceId: WS, slug: "hello-world" } }))?.id, "post-1");
  assert.equal(await findPublishedPostBySlug({ deps: { repo }, input: { workspaceId: WS, slug: "later" } }), null);
});

const doc = { type: "doc", content: [] };
const unchangedInput = (post: PostRecord) => ({ workspaceId: WS, id: post.id, title: post.title, slug: post.slug, bodyJson: doc, status: post.status });

test("update: an unchanged save whose row is trashed during the plugin hook is not-found", async () => {
  const stored = buildPostRecord();
  const repo = new InMemoryPostRepo([stored]);
  const beforeSaveHook = async () => { await repo.save({ ...stored, deletedAt: "2026-10-20T00:00:00.000Z" }); return {}; };
  await assert.rejects(
    updatePost({ deps: { clock, repo, outbox, beforeSaveHook }, input: unchangedInput(stored) }),
    (error: unknown) => error instanceof PostNotFoundError && error.message === "post 'post-1' was not found",
  );
});

test("update: an unchanged save whose row another writer edits during the hook is written, not skipped", async () => {
  const stored = buildPostRecord();
  const repo = new InMemoryPostRepo([stored]);
  const beforeSaveHook = async () => { await repo.save({ ...stored, title: "Edited elsewhere" }); return {}; };
  const result = await updatePost({ deps: { clock, repo, outbox, beforeSaveHook }, input: unchangedInput(stored) });
  assert.equal(result.post.title, "Hello World");
  assert.notEqual(result.revisionId, null);
});

test("update: hideCoverImageInBody starts the presentation namespace on a post with no ext", async () => {
  const stored = buildPostRecord();
  const repo = new InMemoryPostRepo([stored]);
  const { post } = await updatePost({ deps: { clock, repo, outbox }, input: { ...unchangedInput(stored), hideCoverImageInBody: false } });
  assert.deepEqual(post.ext, { "post-presentation": { hideCoverImageInBody: false } });
});

test("update: hideCoverImageInBody keeps the presentation namespace's other keys", async () => {
  const stored = buildPostRecord({ ext: { "post-presentation": { layout: "wide" }, other: { a: 1 } } });
  const repo = new InMemoryPostRepo([stored]);
  const { post } = await updatePost({ deps: { clock, repo, outbox }, input: { ...unchangedInput(stored), hideCoverImageInBody: true } });
  assert.deepEqual(post.ext, { "post-presentation": { layout: "wide", hideCoverImageInBody: true }, other: { a: 1 } });
});

test("update: a non-boolean slugFromTitle or hideCoverImageInBody is refused by name", async () => {
  const stored = buildPostRecord();
  const repo = new InMemoryPostRepo([stored]);
  for (const name of ["slugFromTitle", "hideCoverImageInBody"]) {
    await assert.rejects(
      updatePost({ deps: { clock, repo, outbox }, input: { ...unchangedInput(stored), [name]: "yes" } as Parameters<typeof updatePost>[0]["input"] }),
      (error: unknown) => error instanceof PostValidationError && error.message === `${name} must be a boolean`,
    );
  }
});

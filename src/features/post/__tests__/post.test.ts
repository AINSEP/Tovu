import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "../../../core/ports";
import {
  createPost,
  getPublishedPostBySlug,
  listAdminPages,
  listAdminPosts,
  PostConflictError,
  PostNotFoundError,
  PostValidationError,
  updatePost,
} from "../post";
import { InMemoryPostRepo } from "../repo.memory";

/**
 * `updatePost`'s `deps` gained a required `outbox` (ADR-PIPE-008 Decision §5,
 * T010) — this file's pre-existing assertions are about title/slug/status/
 * version behavior, not event emission, so a no-op stub is enough here.
 * `post.transition-events.test.ts` is the dedicated certification of the
 * outbox-emission behavior itself.
 */
const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

const seedPost = {
  id: "post-1",
  workspaceId: "workspace-1",
  title: "Hello World",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [] },
  status: "published" as const,
  kind: "post" as const,
  updatedAt: "2026-04-06T00:00:00.000Z",
  version: 1,
};

test("updatePost stores edits and increments version", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await updatePost({
    deps: { repo, clock, outbox: noopOutbox },
    input: {
      workspaceId: "workspace-1",
      id: "post-1",
      title: "Updated Post",
      slug: "updated-post",
      bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
      status: "draft",
    },
  });

  assert.equal(result.post.version, 2);
  assert.equal(result.post.updatedAt, "2026-04-06T01:00:00.000Z");
  assert.equal(result.post.slug, "updated-post");
  assert.equal(result.post.status, "draft");
});

test("updatePost rejects duplicate slug", async () => {
  const repo = new InMemoryPostRepo([
    seedPost,
    {
      ...seedPost,
      id: "post-2",
      slug: "another-post",
    },
  ]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      updatePost({
        deps: { repo, clock, outbox: noopOutbox },
        input: {
          workspaceId: "workspace-1",
          id: "post-1",
          title: "Updated Post",
          slug: "another-post",
          bodyJson: { type: "doc", content: [] },
          status: "published",
        },
      }),
    PostConflictError
  );
});

test("updatePost rejects invalid title", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      updatePost({
        deps: { repo, clock, outbox: noopOutbox },
        input: {
          workspaceId: "workspace-1",
          id: "post-1",
          title: "   ",
          slug: "updated-post",
          bodyJson: { type: "doc", content: [] },
          status: "published",
        },
      }),
    PostValidationError
  );
});

test("createPost stores a blank draft with a title-derived slug", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post" },
  });

  assert.equal(result.post.id, "post-new");
  assert.equal(result.post.slug, "my-new-post");
  assert.equal(result.post.status, "draft");
  assert.deepEqual(result.post.bodyJson, {});
  assert.equal(result.post.version, 1);

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "post-new" });
  assert.ok(stored);
});

test("createPost disambiguates a slug collision", async () => {
  const repo = new InMemoryPostRepo([seedPost]); // seedPost.slug === "hello-world"
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "post-new", title: "Hello World" },
  });

  assert.equal(result.post.slug, "hello-world-2");
});

test("createPost defaults an empty title to 'Untitled'", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "post-new", title: "   " },
  });

  assert.equal(result.post.title, "Untitled");
  assert.equal(result.post.slug, "untitled");
});

test("getPublishedPostBySlug hides drafts", async () => {
  const repo = new InMemoryPostRepo([{ ...seedPost, status: "draft" }]);

  await assert.rejects(
    () =>
      getPublishedPostBySlug({
        deps: { repo },
        input: { workspaceId: "workspace-1", slug: "hello-world" },
      }),
    PostNotFoundError
  );
});

test("createPost defaults kind to 'post' when not given", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post" },
  });

  assert.equal(result.post.kind, "post");
});

test("createPost sets kind to 'page' when explicitly requested", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "page-new", title: "About Us", kind: "page" },
  });

  assert.equal(result.post.kind, "page");

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "page-new" });
  assert.equal(stored?.kind, "page");
});

test("updatePost preserves the existing record's kind (not editable after creation)", async () => {
  const repo = new InMemoryPostRepo([{ ...seedPost, id: "page-1", kind: "page" }]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await updatePost({
    deps: { repo, clock, outbox: noopOutbox },
    input: {
      workspaceId: "workspace-1",
      id: "page-1",
      title: "Updated Page",
      slug: "updated-page",
      bodyJson: { type: "doc", content: [] },
      status: "published",
    },
  });

  assert.equal(result.post.kind, "page");
});

test("listAdminPosts and listAdminPages are disjoint lenses over the same table", async () => {
  const repo = new InMemoryPostRepo([
    seedPost, // kind: "post"
    { ...seedPost, id: "post-2", slug: "second-post", kind: "post" },
    { ...seedPost, id: "page-1", slug: "about", kind: "page" },
    { ...seedPost, id: "page-2", slug: "contact", kind: "page" },
  ]);

  const { posts: postsOnly } = await listAdminPosts({
    deps: { repo },
    input: { workspaceId: "workspace-1" },
  });
  assert.deepEqual(
    postsOnly.map((p) => p.id).sort(),
    ["post-1", "post-2"]
  );

  const { posts: pagesOnly } = await listAdminPages({
    deps: { repo },
    input: { workspaceId: "workspace-1" },
  });
  assert.deepEqual(
    pagesOnly.map((p) => p.id).sort(),
    ["page-1", "page-2"]
  );
});

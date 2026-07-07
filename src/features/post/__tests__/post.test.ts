import assert from "node:assert/strict";
import test from "node:test";

import { getPublishedPostBySlug, PostConflictError, PostNotFoundError, PostValidationError, updatePost } from "../post";
import { InMemoryPostRepo } from "../repo.memory";

const seedPost = {
  id: "post-1",
  workspaceId: "workspace-1",
  title: "Hello World",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [] },
  status: "published" as const,
  updatedAt: "2026-04-06T00:00:00.000Z",
  version: 1,
};

test("updatePost stores edits and increments version", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await updatePost({
    deps: { repo, clock },
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
        deps: { repo, clock },
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
        deps: { repo, clock },
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

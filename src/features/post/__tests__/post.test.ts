import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
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
  // SPEC-002 api.spec.md §4 documents the create default as `{type:"doc",content:[]}`,
  // not `{}` — this assertion was previously wrong (asserting the bug's own symptom).
  assert.deepEqual(result.post.bodyJson, { type: "doc", content: [] });
  assert.equal(result.post.version, 1);

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "post-new" });
  assert.ok(stored);
});

test("createPost uses the caller-supplied slug instead of deriving one from the title", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post", slug: "custom-slug" },
  });

  assert.equal(result.post.slug, "custom-slug");
});

test("createPost normalizes a caller-supplied slug to lowercase and trims it", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post", slug: "  Custom-Slug  " },
  });

  assert.equal(result.post.slug, "custom-slug");
});

test("createPost rejects a caller-supplied slug with an invalid format", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      createPost({
        deps: { repo, clock },
        input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post", slug: "Not A Slug!" },
      }),
    PostValidationError
  );

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "post-new" });
  assert.equal(stored, null);
});

test("createPost rejects a caller-supplied slug already used in the workspace (SLUG_CONFLICT)", async () => {
  const repo = new InMemoryPostRepo([seedPost]); // seedPost.slug === "hello-world"
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      createPost({
        deps: { repo, clock },
        input: { workspaceId: "workspace-1", id: "post-new", title: "Another Title", slug: "hello-world" },
      }),
    PostConflictError
  );

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "post-new" });
  assert.equal(stored, null);
});

test("createPost allows the same explicit slug in a different workspace (uniqueness is per-workspace)", async () => {
  const repo = new InMemoryPostRepo([seedPost]); // workspace-1, slug "hello-world"
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-2", id: "post-new", title: "Another Title", slug: "hello-world" },
  });

  assert.equal(result.post.slug, "hello-world");
});

test("createPost uses the caller-supplied bodyJson instead of the default empty doc", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };
  const bodyJson = { type: "doc", content: [{ type: "paragraph" }] };

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post", bodyJson },
  });

  assert.deepEqual(result.post.bodyJson, bodyJson);
});

test("createPost rejects a non-object caller-supplied bodyJson", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      createPost({
        deps: { repo, clock },
        input: {
          workspaceId: "workspace-1",
          id: "post-new",
          title: "My New Post",
          bodyJson: [] as unknown as { type: string },
        },
      }),
    PostValidationError
  );

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "post-new" });
  assert.equal(stored, null);
});

test("createPost uses the caller-supplied status instead of always defaulting to draft", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post", status: "published" },
  });

  assert.equal(result.post.status, "published");
});

test("createPost rejects an invalid caller-supplied status", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      createPost({
        deps: { repo, clock },
        input: {
          workspaceId: "workspace-1",
          id: "post-new",
          title: "My New Post",
          status: "archived" as unknown as "draft",
        },
      }),
    PostValidationError
  );

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "post-new" });
  assert.equal(stored, null);
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

// SPEC-002 REQ-04/AC-04 [P1] — feature.spec.md: "Given a create request with slug `admin`, when
// it is handled, then the response is HTTP 400 VALIDATION_ERROR and nothing is written."
// errors.spec.md's documented VALIDATION_ERROR message for this case is `slug 'admin' is reserved`.
test("createPost rejects a caller-supplied slug equal to the reserved word 'admin' (AC-04)", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      createPost({
        deps: { repo, clock },
        input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post", slug: "admin" },
      }),
    (err: unknown) => {
      assert.ok(err instanceof PostValidationError);
      assert.equal((err as Error).message, "slug 'admin' is reserved");
      return true;
    }
  );

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "post-new" });
  assert.equal(stored, null);
});

// behavior.spec.md BR-02/BR-03 name both reserved slugs explicitly (`admin`, `api`) — not just one.
test("createPost rejects a caller-supplied slug equal to the reserved word 'api'", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      createPost({
        deps: { repo, clock },
        input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post", slug: "api" },
      }),
    (err: unknown) => {
      assert.ok(err instanceof PostValidationError);
      assert.equal((err as Error).message, "slug 'api' is reserved");
      return true;
    }
  );

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "post-new" });
  assert.equal(stored, null);
});

// api.spec.md §4 / behavior.spec.md §4: caller-supplied slug maxLength is 120 chars.
test("createPost rejects a caller-supplied slug longer than 120 characters", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };
  const overLongSlug = "a".repeat(121);

  await assert.rejects(
    () =>
      createPost({
        deps: { repo, clock },
        input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post", slug: overLongSlug },
      }),
    PostValidationError
  );

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "post-new" });
  assert.equal(stored, null);
});

// Boundary check (RT-004 in behavior.spec.md): exactly 120 chars must still succeed.
test("createPost accepts a caller-supplied slug exactly 120 characters long", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };
  const boundarySlug = "a".repeat(120);

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post", slug: boundarySlug },
  });

  assert.equal(result.post.slug, boundarySlug);
});

// api.spec.md §4 / behavior.spec.md §4: title maxLength is 200 chars.
test("createPost rejects a title longer than 200 characters", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };
  const overLongTitle = "a".repeat(201);

  await assert.rejects(
    () =>
      createPost({
        deps: { repo, clock },
        input: { workspaceId: "workspace-1", id: "post-new", title: overLongTitle },
      }),
    PostValidationError
  );

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "post-new" });
  assert.equal(stored, null);
});

// Boundary check: exactly 200 chars must still succeed.
test("createPost accepts a title exactly 200 characters long", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };
  const boundaryTitle = "a".repeat(200);

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "post-new", title: boundaryTitle },
  });

  assert.equal(result.post.title, boundaryTitle);
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

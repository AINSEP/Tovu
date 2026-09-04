import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import type { BeforeSaveHookPort } from "../post.js";
import {
  createPost,
  findPublishedPostById,
  getAdminPostById,
  getAdminPostByIdOrSlug,
  getPublishedPostBySlug,
  listAdminPages,
  listAdminPosts,
  PostConflictError,
  PostNotFoundError,
  PostValidationError,
  updatePost,
} from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";

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

// Content-owned homepage (SPEC-0XX) — the root slug is claimable ONLY by a Page. `kind` defaults to
// `"post"` when omitted, so the rejection must fire on that default too, not only on an explicit
// `kind: "post"`.
test("createPost rejects a caller-supplied slug of '/' for a post (kind defaults to 'post')", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      createPost({
        deps: { repo, clock },
        input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post", slug: "/" },
      }),
    (err: unknown) => {
      assert.ok(err instanceof PostValidationError);
      assert.equal((err as Error).message, "slug must use lowercase letters, numbers, and dashes");
      return true;
    }
  );

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "post-new" });
  assert.equal(stored, null);
});

test("createPost rejects a caller-supplied slug of '/' for an explicit kind: 'post'", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      createPost({
        deps: { repo, clock },
        input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post", slug: "/", kind: "post" },
      }),
    (err: unknown) => {
      assert.ok(err instanceof PostValidationError);
      assert.equal((err as Error).message, "slug must use lowercase letters, numbers, and dashes");
      return true;
    }
  );
});

test("createPost accepts a caller-supplied slug of '/' for kind: 'page'", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "page-new", title: "Home", slug: "/", kind: "page" },
  });

  assert.equal(result.post.slug, "/");
  assert.equal(result.post.kind, "page");
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

/**
 * {@link findPublishedPostById} — the non-throwing, id-based counterpart to `getPublishedPostBySlug`
 * (2026-08-11, guard 2 of the unified-content-marker design). This is the seam the `content`/`post`
 * embed resolvers (`widgets/resolver-service.ts`) and the recursive `"html"`-format pre-splice
 * (`server/routes/site/pages.ts`) consult before letting an author- or auto-filled id reach a public
 * page — see that function's own doc for the hazard an id-driven lookup introduces that a slug-driven
 * route lookup never had.
 */
test("findPublishedPostById returns the row for a published id", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  const found = await findPublishedPostById({ deps: { repo }, input: { workspaceId: "workspace-1", id: "post-1" } });
  assert.equal(found?.id, "post-1");
});

test("GUARD 2: findPublishedPostById returns null for a draft row — never leaks it by id", async () => {
  const repo = new InMemoryPostRepo([{ ...seedPost, status: "draft" }]);
  const found = await findPublishedPostById({ deps: { repo }, input: { workspaceId: "workspace-1", id: "post-1" } });
  assert.equal(found, null, "a draft must not be returned even when its exact id is known");
});

test("GUARD 2: findPublishedPostById returns null for a trashed row, even if published", async () => {
  const repo = new InMemoryPostRepo([{ ...seedPost, status: "published", deletedAt: "2026-08-11T00:00:00.000Z" }]);
  const found = await findPublishedPostById({ deps: { repo }, input: { workspaceId: "workspace-1", id: "post-1" } });
  assert.equal(found, null);
});

test("findPublishedPostById returns null for a nonexistent id — same shape as \"not visible\", never throws", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  const found = await findPublishedPostById({ deps: { repo }, input: { workspaceId: "workspace-1", id: "does-not-exist" } });
  assert.equal(found, null);
});

test("findPublishedPostById is workspace-scoped — a published row in a DIFFERENT workspace is invisible", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  const found = await findPublishedPostById({ deps: { repo }, input: { workspaceId: "workspace-2", id: "post-1" } });
  assert.equal(found, null);
});

test("GUARD 2 NEGATIVE VERIFICATION: stubbing out the status/trash filter would let a draft through — proves the guard is load-bearing, not vestigial", async () => {
  // Same discipline the design doc's guard 2 calls for: don't just assert the guarded behavior,
  // prove the guard is the reason it holds. A bare `repo.findById` call (what this function replaced)
  // WOULD return the draft below — that is the exact hole this function exists to close.
  const repo = new InMemoryPostRepo([{ ...seedPost, status: "draft" }]);
  const unguarded = await repo.findById({ workspaceId: "workspace-1", id: "post-1" });
  assert.ok(unguarded, "sanity check: the raw, unfiltered repo call DOES return the draft");
  const guarded = await findPublishedPostById({ deps: { repo }, input: { workspaceId: "workspace-1", id: "post-1" } });
  assert.equal(guarded, null, "the guarded lookup must refuse what the raw repo call allows");
});

test("getAdminPostByIdOrSlug resolves by real id", async () => {
  const repo = new InMemoryPostRepo([seedPost]);

  const { post } = await getAdminPostByIdOrSlug({
    deps: { repo },
    input: { workspaceId: "workspace-1", idOrSlug: "post-1" },
  });

  assert.equal(post.id, "post-1");
});

test("getAdminPostByIdOrSlug falls back to slug when the value is not a known id", async () => {
  const repo = new InMemoryPostRepo([seedPost]);

  const { post } = await getAdminPostByIdOrSlug({
    deps: { repo },
    input: { workspaceId: "workspace-1", idOrSlug: "hello-world" },
  });

  assert.equal(post.id, "post-1");
});

test("getAdminPostByIdOrSlug normalizes the slug fallback the same way getPublishedPostBySlug does", async () => {
  const repo = new InMemoryPostRepo([seedPost]);

  const { post } = await getAdminPostByIdOrSlug({
    deps: { repo },
    input: { workspaceId: "workspace-1", idOrSlug: "  HELLO-WORLD  " },
  });

  assert.equal(post.id, "post-1");
});

test("getAdminPostByIdOrSlug 404s, trash-blind, for a value that matches neither an id nor a slug", async () => {
  const repo = new InMemoryPostRepo([seedPost]);

  await assert.rejects(
    () =>
      getAdminPostByIdOrSlug({
        deps: { repo },
        input: { workspaceId: "workspace-1", idOrSlug: "does-not-exist" },
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

test("getAdminPostById returns the post for a valid, non-trashed id", async () => {
  const repo = new InMemoryPostRepo([seedPost]);

  const { post } = await getAdminPostById({
    deps: { repo },
    input: { workspaceId: "workspace-1", id: "post-1" },
  });

  assert.equal(post.id, "post-1");
  assert.equal(post.title, "Hello World");
});

// SPEC-005 CIC U-004-B1/F1 — the optional `content.entry.beforeSave` hook, run before the record
// is built and before `repo.save()`. `post.test.ts`'s other create/update tests never wire one up
// (the zero-plugin path), so this is the only place the hook is actually invoked and its patch
// merged into `ext`.
test("createPost runs the beforeSaveHook and merges its returned patch into ext", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };
  let receivedDraft: unknown;
  const beforeSaveHook: BeforeSaveHookPort = async (draft) => {
    receivedDraft = draft;
    return { "plugin-a": { flagged: true } };
  };

  const result = await createPost({
    deps: { repo, clock, beforeSaveHook },
    input: { workspaceId: "workspace-1", id: "post-new", title: "My New Post" },
  });

  assert.deepEqual(result.post.ext, { "plugin-a": { flagged: true } });
  // A new entry has no prior ext, so the draft the hook sees starts empty (REQ-05).
  assert.deepEqual((receivedDraft as { ext: unknown }).ext, {});
});

test("updatePost runs the beforeSaveHook and merges its patch onto the entry's existing ext", async () => {
  const repo = new InMemoryPostRepo([{ ...seedPost, ext: { "plugin-a": { seen: 1 } } }]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };
  let receivedDraft: unknown;
  const beforeSaveHook: BeforeSaveHookPort = async (draft) => {
    receivedDraft = draft;
    return { "plugin-b": { added: true } };
  };

  const result = await updatePost({
    deps: { repo, clock, outbox: noopOutbox, beforeSaveHook },
    input: {
      workspaceId: "workspace-1",
      id: "post-1",
      title: "Updated Post",
      slug: "updated-post",
      bodyJson: { type: "doc", content: [] },
      status: "published",
    },
  });

  // Merging (not replacing) keeps a disabled/uninstalled plugin's namespace intact (INV-03).
  assert.deepEqual(result.post.ext, { "plugin-a": { seen: 1 }, "plugin-b": { added: true } });
  // The draft the filter sees carries the entry's already-written ext, per REQ-05.
  assert.deepEqual((receivedDraft as { ext: unknown }).ext, { "plugin-a": { seen: 1 } });
});

// The `slugify(title) || "untitled"` fallback: a title that survives the empty-title default
// (it is not blank) but has no a-z0-9 characters at all still slugifies to "".
test("createPost falls back to 'untitled' when the title has no alphanumeric characters to slugify", async () => {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "workspace-1", id: "post-new", title: "!!!" },
  });

  assert.equal(result.post.title, "!!!");
  assert.equal(result.post.slug, "untitled");
});

test("updatePost rejects an invalid slug format", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      updatePost({
        deps: { repo, clock, outbox: noopOutbox },
        input: {
          workspaceId: "workspace-1",
          id: "post-1",
          title: "Updated Post",
          slug: "Not A Slug!",
          bodyJson: { type: "doc", content: [] },
          status: "published",
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof PostValidationError);
      assert.equal((err as Error).message, "slug must use lowercase letters, numbers, and dashes");
      return true;
    }
  );
});

// Content-owned homepage (SPEC-0XX) — same root-slug exception `createPost`'s explicit-slug path
// enforces, gated here on `existing.kind` (immutable, so this is the only kind that can matter).
test("updatePost rejects a slug of '/' when the existing row's kind is 'post'", async () => {
  const repo = new InMemoryPostRepo([seedPost]); // seedPost.kind === "post"
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      updatePost({
        deps: { repo, clock, outbox: noopOutbox },
        input: {
          workspaceId: "workspace-1",
          id: "post-1",
          title: "Updated Post",
          slug: "/",
          bodyJson: { type: "doc", content: [] },
          status: "published",
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof PostValidationError);
      assert.equal((err as Error).message, "slug must use lowercase letters, numbers, and dashes");
      return true;
    }
  );
});

test("updatePost accepts a slug of '/' when the existing row's kind is 'page'", async () => {
  const seedPage = { ...seedPost, id: "page-1", kind: "page" as const, slug: "about" };
  const repo = new InMemoryPostRepo([seedPage]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await updatePost({
    deps: { repo, clock, outbox: noopOutbox },
    input: {
      workspaceId: "workspace-1",
      id: "page-1",
      title: "Home",
      slug: "/",
      bodyJson: { type: "doc", content: [] },
      status: "published",
    },
  });

  assert.equal(result.post.slug, "/");
});

test("updatePost rejects a non-object bodyJson on a doc-format row", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      updatePost({
        deps: { repo, clock, outbox: noopOutbox },
        input: {
          workspaceId: "workspace-1",
          id: "post-1",
          title: "Updated Post",
          slug: "updated-post",
          bodyJson: [] as unknown as { type: string; content: unknown[] },
          status: "published",
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof PostValidationError);
      assert.equal((err as Error).message, "bodyJson must be a JSON object");
      return true;
    }
  );
});

test("updatePost rejects an invalid status", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  await assert.rejects(
    () =>
      updatePost({
        deps: { repo, clock, outbox: noopOutbox },
        input: {
          workspaceId: "workspace-1",
          id: "post-1",
          title: "Updated Post",
          slug: "updated-post",
          bodyJson: { type: "doc", content: [] },
          status: "archived" as unknown as "draft",
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof PostValidationError);
      assert.equal((err as Error).message, "status must be 'draft' or 'published'");
      return true;
    }
  );
});

// Post-template-picker feature (2026-08-10) — both fields follow the same "omit to leave
// unchanged, explicit value to set" contract, exercised together since they're independent
// conditional spreads in the same record-assembly step.
test("updatePost sets templateChoice and overridesThemePage when the caller provides them", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  const clock = { nowIso: () => "2026-04-06T01:00:00.000Z" };

  const result = await updatePost({
    deps: { repo, clock, outbox: noopOutbox },
    input: {
      workspaceId: "workspace-1",
      id: "post-1",
      title: "Updated Post",
      slug: "updated-post",
      bodyJson: { type: "doc", content: [] },
      status: "published",
      templateChoice: "blog-post.html",
      overridesThemePage: true,
    },
  });

  assert.equal(result.post.templateChoice, "blog-post.html");
  assert.equal(result.post.overridesThemePage, true);
});

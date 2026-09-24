import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import {
  isTrashed,
  retirePostForReplacement,
  PostConflictError,
  PostVersionConflictError,
  ROOT_SLUG,
  type PostRecord,
} from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { removeVia } from "./remove-post-double.js";

/**
 * @file Certification of `retirePostForReplacement` — publish's "overwrite on live, address clash"
 * primitive (`publish-overwrite-live-plan-2026-09-24.md` §5 S3). Frees a slug and moves its holder
 * to the Trash under a renamed slug so a different row can take the address; never overwrites the
 * holder in place.
 */

const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

const clock = { nowIso: () => "2026-09-24T12:00:00.000Z" };
const WS = "workspace-1";

function seed(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WS,
    title: "About Tovu",
    slug: "about",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "page",
    updatedAt: "2026-04-06T00:00:00.000Z",
    version: 3,
    ...overrides,
  };
}

test("retirePostForReplacement frees the slug and trashes the row under a renamed slug", async () => {
  const repo = new InMemoryPostRepo([seed()]);

  const { post } = await retirePostForReplacement({
    deps: { repo, clock, outbox: noopOutbox, remove: removeVia(repo) },
    input: { workspaceId: WS, id: "post-1", expectedVersion: 3, today: "20260924" },
  });

  assert.equal(post.slug, "about-replaced-20260924");
  assert.equal(isTrashed(post), true);

  assert.equal(
    await repo.findBySlug({ workspaceId: WS, slug: "about" }),
    null,
    "the address must be freed for a different row to take"
  );

  const stored = await repo.findById({ workspaceId: WS, id: "post-1" });
  assert.equal(stored?.slug, "about-replaced-20260924");
  assert.equal(isTrashed(stored!), true);
});

test("a second retire on the same day gets -2 rather than colliding with the first retirement's renamed slug", async () => {
  const repo = new InMemoryPostRepo([seed({ id: "post-1", slug: "about", version: 3 })]);

  await retirePostForReplacement({
    deps: { repo, clock, outbox: noopOutbox, remove: removeVia(repo) },
    input: { workspaceId: WS, id: "post-1", expectedVersion: 3, today: "20260924" },
  });

  // The local row is created under the now-freed "about" slug (what publish does next), then is
  // itself retired again the same day — its renamed slug collides with the first retirement's.
  await repo.save(seed({ id: "post-2", slug: "about", version: 1 }));

  const { post } = await retirePostForReplacement({
    deps: { repo, clock, outbox: noopOutbox, remove: removeVia(repo) },
    input: { workspaceId: WS, id: "post-2", expectedVersion: 1, today: "20260924" },
  });

  assert.equal(post.slug, "about-replaced-20260924-2");
});

test("retiring the root slug is refused with the exact reason", async () => {
  const repo = new InMemoryPostRepo([seed({ id: "home", slug: ROOT_SLUG, kind: "page", version: 1 })]);

  await assert.rejects(
    () =>
      retirePostForReplacement({
        deps: { repo, clock, outbox: noopOutbox, remove: removeVia(repo) },
        input: { workspaceId: WS, id: "home", expectedVersion: 1, today: "20260924" },
      }),
    (err: unknown) =>
      err instanceof PostConflictError && err.message === "the home page cannot be replaced by publishing"
  );
});

test("a stale expectedVersion is refused and nothing is renamed", async () => {
  const repo = new InMemoryPostRepo([seed({ id: "post-1", slug: "about", version: 3 })]);

  await assert.rejects(
    () =>
      retirePostForReplacement({
        deps: { repo, clock, outbox: noopOutbox, remove: removeVia(repo) },
        input: { workspaceId: WS, id: "post-1", expectedVersion: 2, today: "20260924" },
      }),
    PostVersionConflictError
  );

  const row = await repo.findById({ workspaceId: WS, id: "post-1" });
  assert.equal(row?.slug, "about", "a refused retire must not have renamed anything");
  assert.equal(isTrashed(row!), false, "a refused retire must not have trashed anything");
});

test("restoring from Trash brings the row back at its renamed slug, not the original", async () => {
  const repo = new InMemoryPostRepo([seed({ id: "post-1", slug: "about", version: 3 })]);

  const { post } = await retirePostForReplacement({
    deps: { repo, clock, outbox: noopOutbox, remove: removeVia(repo) },
    input: { workspaceId: WS, id: "post-1", expectedVersion: 3, today: "20260924" },
  });

  // A Trash restore only clears `deletedAt` (`routes/pages/delete.ts`'s inverse, `{deletedAt:null}`)
  // — it never touches the slug.
  await repo.save({ ...post, deletedAt: null, version: post.version + 1 });

  const restored = await repo.findById({ workspaceId: WS, id: "post-1" });
  assert.equal(isTrashed(restored!), false);
  assert.equal(restored?.slug, "about-replaced-20260924");
});

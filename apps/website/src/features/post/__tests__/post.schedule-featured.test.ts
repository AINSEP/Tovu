import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { isLiveAt, isScheduledAt } from "#src/contracts/core/scheduled-publish";
import {
  createPost,
  findPublishedPostById,
  findPublishedPostBySlug,
  getPublishedPostBySlug,
  listPublishedPostPreviews,
  listPublishedPosts,
  normalizePublishAt,
  PostNotFoundError,
  PostValidationError,
  updatePost,
  type PostRepoPort,
} from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { postRepoFor } from "../repo.js";

/**
 * @file Scheduled publishing + featured image (2026-10-05). A scheduled post is a `published` row
 * whose `publishAt` is still ahead; every public read hides it until then. Proven on the in-memory
 * repo and on every SQL dialect (the bounded preview query pushes the rule into SQL).
 */

const WS = "ws-schedule";
const BEFORE = "2026-10-12T15:59:59.000Z";
const GO_LIVE = "2026-10-12T16:00:00.000Z";
const AFTER = "2026-10-12T16:00:01.000Z";
const clock = { nowMs: () => Date.parse("2026-10-05T00:00:00.000Z") };

async function scheduledPost(repo: PostRepoPort, extra: { featuredMediaId?: string } = {}) {
  const { post } = await createPost({
    deps: { repo, clock },
    input: { workspaceId: WS, id: "p1", title: "Coffee tips", status: "published", publishAt: "2026-10-12T09:00:00-07:00", ...extra },
  });
  return post;
}

function runContract(name: string, withRepo: () => Promise<{ repo: PostRepoPort; teardown: () => Promise<void> | void }>) {
  test(`a scheduled post is hidden from every public read until publishAt, then live (${name})`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const created = await scheduledPost(repo);
      assert.equal(created.publishAt, GO_LIVE, "offset input is normalized to ISO UTC");
      assert.equal((await repo.findById({ workspaceId: WS, id: "p1" }))?.publishAt, GO_LIVE);

      const read = (nowIso: string) => Promise.all([
        listPublishedPosts({ deps: { repo }, input: { workspaceId: WS } }, { nowIso }).then((r) => r.posts.length),
        listPublishedPostPreviews({ deps: { repo }, input: { workspaceId: WS, limit: 5 } }, { nowIso }).then((r) => r.posts.length),
        findPublishedPostById({ deps: { repo }, input: { workspaceId: WS, id: "p1" } }, { nowIso }).then((p) => (p ? 1 : 0)),
        findPublishedPostBySlug({ deps: { repo }, input: { workspaceId: WS, slug: "coffee-tips" } }, { nowIso }).then((p) => (p ? 1 : 0)),
      ]);
      assert.deepEqual(await read(BEFORE), [0, 0, 0, 0]);
      await assert.rejects(
        getPublishedPostBySlug({ deps: { repo }, input: { workspaceId: WS, slug: "coffee-tips" } }, { nowIso: BEFORE }),
        PostNotFoundError
      );
      assert.deepEqual(await read(GO_LIVE), [1, 1, 1, 1]);
      assert.deepEqual(await read(AFTER), [1, 1, 1, 1]);
    } finally {
      await teardown();
    }
  });

  test(`updatePost keeps, sets and clears publishAt/featuredMediaId tri-state (${name})`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const created = await scheduledPost(repo, { featuredMediaId: "media-1" });
      assert.equal(created.featuredMediaId, "media-1");
      const deps = { repo, clock, outbox: { enqueue: async () => {} } as never };
      const base = { workspaceId: WS, id: "p1", title: created.title, slug: created.slug, bodyJson: created.bodyJson, status: created.status };

      const kept = (await updatePost({ deps, input: { ...base, title: "Renamed" } })).post;
      assert.equal(kept.publishAt, GO_LIVE);
      assert.equal(kept.featuredMediaId, "media-1");

      const cleared = (await updatePost({ deps, input: { ...base, publishAt: null, featuredMediaId: null } })).post;
      assert.equal("publishAt" in cleared, false);
      assert.equal("featuredMediaId" in cleared, false);
      const stored = await repo.findById({ workspaceId: WS, id: "p1" });
      assert.equal(stored?.publishAt, undefined);
      assert.equal(stored?.featuredMediaId, undefined);
      assert.equal((await listPublishedPosts({ deps: { repo }, input: { workspaceId: WS } }, { nowIso: BEFORE })).posts.length, 1, "cleared ⇒ live now");

      const set = (await updatePost({ deps, input: { ...base, publishAt: "2026-12-01T00:00:00Z", featuredMediaId: "media-2" } })).post;
      assert.equal(set.publishAt, "2026-12-01T00:00:00.000Z");
      assert.equal((await repo.findById({ workspaceId: WS, id: "p1" }))?.featuredMediaId, "media-2");
    } finally {
      await teardown();
    }
  });
}

runContract("memory", async () => ({ repo: new InMemoryPostRepo(), teardown: () => {} }));

describeEachDialect<PostRepoPort>("post schedule/featured", { tables: ["posts", "post_revisions"], make: postRepoFor }, (makeRepo) => {
  runContract("sql", async () => ({ repo: makeRepo(), teardown: () => {} }));
});

test("publishAt must carry a timezone offset; a bad value writes nothing", async () => {
  assert.throws(() => normalizePublishAt("2026-10-12T09:00"), PostValidationError);
  assert.throws(() => normalizePublishAt("next monday"), PostValidationError);
  assert.throws(() => normalizePublishAt(1760284800000), PostValidationError);
  assert.equal(normalizePublishAt(undefined), undefined);
  assert.equal(normalizePublishAt(null), null);
  assert.equal(normalizePublishAt(""), null);
  const repo = new InMemoryPostRepo();
  await assert.rejects(
    createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "p1", title: "x", publishAt: "tomorrow 9am" } }),
    /publishAt must be an ISO 8601 date-time with a timezone offset/
  );
  assert.equal(await repo.findById({ workspaceId: WS, id: "p1" }), null);
});

test("isScheduledAt/isLiveAt: a draft is never scheduled; trash is never live", () => {
  assert.equal(isScheduledAt({ status: "draft", publishAt: AFTER }, BEFORE), false);
  assert.equal(isScheduledAt({ status: "published", publishAt: AFTER }, BEFORE), true);
  assert.equal(isLiveAt({ status: "published", publishAt: null }, BEFORE), true);
  assert.equal(isLiveAt({ status: "published", deletedAt: BEFORE }, AFTER), false);
});

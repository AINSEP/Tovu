import assert from "node:assert/strict";
import test from "node:test";

import type { ClockPort, JsonObject, OutboxPort } from "@jini-ai/cms/core";
import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import { createPost, deletePost, updatePost, type PostRecord } from "../post.js";
import { SqlitePostRepo } from "../repo.sqlite.js";
import { searchAdminPosts, type PostSearchHit } from "../search.js";
import { backfillPostSearchIndex, postSearchIndexFor } from "../search-index.js";
import { contentKernel } from "#src/platform/db/content-kernel";
import { SqlitePostSearchIndex } from "../search-index.sqlite.js";
import { removeVia } from "./remove-post-double.js";

/**
 * @file Certification of the DURABLE search adapter: the FTS5 index migration 0022 installs, the
 * sync obligation `SqlitePostRepo.save()` carries, the boot backfill, and the visibility filters
 * that are deliberately applied to the live `posts` row rather than to indexed copies.
 *
 * Real `content.db` (`:memory:`, full migration stream) and the real domain functions throughout —
 * `createPost`/`updatePost`/`deletePost`, not hand-built records pushed past them — per Constitution
 * Article V, and because the claim being certified is precisely that an ORDINARY write keeps the
 * index correct. A test that indexed by hand would prove nothing about that.
 *
 * The domain half (text extraction, tokenization, input rules) is certified without a database in
 * `search.test.ts`; the tool wiring is certified in
 * `assistant/__tests__/tool-registrations.post.test.ts`.
 */

const WS = "ws-search";
const OTHER_WS = "ws-other";

const clock: ClockPort = { nowIso: () => "2026-07-30T00:00:00.000Z" };

const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

function body(text: string): JsonObject {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } as unknown as JsonObject;
}

interface Harness {
  db: ContentDb;
  repo: SqlitePostRepo;
  search: SqlitePostSearchIndex;
  add: (spec: { id: string; title: string; text: string; kind?: "post" | "page"; status?: "draft" | "published"; workspaceId?: string }) => Promise<PostRecord>;
  find: (query: string, filters?: { kind?: "post" | "page"; status?: "draft" | "published"; limit?: number; workspaceId?: string }) => Promise<PostSearchHit[]>;
}

function harness(): Harness {
  const db = openContentDb(":memory:");
  const repo = new SqlitePostRepo(db);
  const search = new SqlitePostSearchIndex(db);

  return {
    db,
    repo,
    search,
    async add(spec) {
      const { post } = await createPost({
        deps: { repo, clock },
        input: {
          workspaceId: spec.workspaceId ?? WS,
          id: spec.id,
          title: spec.title,
          kind: spec.kind ?? "post",
          bodyJson: body(spec.text),
          status: spec.status ?? "published",
        },
      });
      return post;
    },
    async find(query, filters = {}) {
      const { hits } = await searchAdminPosts({
        deps: { search },
        input: { workspaceId: filters.workspaceId ?? WS, query, ...filters },
      });
      return hits;
    },
  };
}

const ids = (hits: readonly PostSearchHit[]) => hits.map((hit) => hit.id);

// ---------------------------------------------------------------------------
// 1. Ranking sanity
// ---------------------------------------------------------------------------

test("a title match outranks a slug-only match, which outranks a body-only mention", async () => {
  const h = harness();
  await h.add({ id: "title-hit", title: "Pricing and plans", text: "Nothing else of note." });
  await h.add({ id: "slug-hit", title: "How we charge", text: "Nothing else of note." });
  // The slug is the only place "pricing" appears for this row — `createPost` derives slugs from the
  // title, so it has to be set explicitly to isolate the slug column's weight.
  const slugOnly = await h.repo.findById({ workspaceId: WS, id: "slug-hit" });
  assert.ok(slugOnly);
  await h.repo.save({ ...slugOnly, slug: "pricing-details" });
  await h.add({ id: "body-hit", title: "Company blog", text: "We touch on pricing once, in passing, near the end." });

  assert.deepEqual(ids(await h.find("pricing")), ["title-hit", "slug-hit", "body-hit"]);
});

test("scores are reported highest-is-best, inverting bm25()'s cost convention", async () => {
  const h = harness();
  await h.add({ id: "strong", title: "Pricing", text: "pricing pricing pricing" });
  await h.add({ id: "weak", title: "Unrelated", text: "One passing mention of pricing." });

  const hits = await h.find("pricing");
  assert.equal(hits.length, 2);
  assert.deepEqual(ids(hits), ["strong", "weak"]);
  assert.ok(hits.every((hit) => Number.isFinite(hit.score) && hit.score > 0), "BM25 costs are inverted into positive finite scores");
  assert.ok(hits[0].score > hits[1].score, "the stronger title/body hit must strictly outrank the weak body hit");
});

test("multi-word queries are OR'd — a post matching only one term still surfaces", async () => {
  const h = harness();
  await h.add({ id: "both", title: "Pricing plans", text: "Both words appear in the title." });
  await h.add({ id: "one", title: "Our plans for next year", text: "Only the second word." });

  const hits = await h.find("pricing plans");
  assert.deepEqual(ids(hits), ["both", "one"], "an AND would have dropped 'one' entirely");
});

test("the Porter stemmer makes a word form findable by its stem", async () => {
  const h = harness();
  await h.add({ id: "p1", title: "How we price the product", text: "Nothing else." });

  assert.deepEqual(ids(await h.find("pricing")), ["p1"]);
});

test("a query with no match returns nothing rather than everything", async () => {
  const h = harness();
  await h.add({ id: "p1", title: "Pricing", text: "Ten dollars." });

  assert.deepEqual(await h.find("zebra"), []);
});

test("hits carry a body snippet and never the body document itself", async () => {
  const h = harness();
  await h.add({ id: "p1", title: "Pricing", text: "Every plan is billed monthly with no setup fee." });

  const [hit] = await h.find("pricing");
  assert.deepEqual(Object.keys(hit).sort(), ["id", "kind", "score", "slug", "snippet", "status", "title", "updatedAt"]);
  assert.match(hit.snippet, /billed monthly/);
});

// ---------------------------------------------------------------------------
// 2. Filters, applied to the live row rather than to the index
// ---------------------------------------------------------------------------

test("kind narrows to posts or pages", async () => {
  const h = harness();
  await h.add({ id: "post-1", title: "Pricing post", text: "x", kind: "post" });
  await h.add({ id: "page-1", title: "Pricing page", text: "x", kind: "page" });

  assert.deepEqual(ids(await h.find("pricing", { kind: "post" })), ["post-1"]);
  assert.deepEqual(ids(await h.find("pricing", { kind: "page" })), ["page-1"]);
  assert.deepEqual(ids(await h.find("pricing")).sort(), ["page-1", "post-1"]);
});

test("status narrows to drafts or published, and drafts are included by default", async () => {
  const h = harness();
  await h.add({ id: "live", title: "Pricing live", text: "x", status: "published" });
  await h.add({ id: "wip", title: "Pricing wip", text: "x", status: "draft" });

  assert.deepEqual(ids(await h.find("pricing", { status: "published" })), ["live"]);
  assert.deepEqual(ids(await h.find("pricing", { status: "draft" })), ["wip"]);
  assert.deepEqual(ids(await h.find("pricing")).sort(), ["live", "wip"]);
});

test("publishing a draft changes what a status-filtered search returns, with no index write", async () => {
  const h = harness();
  await h.add({ id: "p1", title: "Pricing", text: "x", status: "draft" });
  assert.deepEqual(await h.find("pricing", { status: "published" }), []);

  // Straight through `softDelete`'s sibling path — an UPDATE of `posts.status` only. The searchable
  // text is untouched, which is exactly why this must take effect anyway.
  h.db.$client.prepare("UPDATE posts SET status = 'published' WHERE id = 'p1'").run();

  assert.deepEqual(ids(await h.find("pricing", { status: "published" })), ["p1"]);
});

test("limit caps the page, and the cap is applied AFTER the visibility filters", async () => {
  const h = harness();
  for (let i = 0; i < 5; i += 1) await h.add({ id: `post-${i}`, title: `Pricing pricing pricing ${i}`, text: "pricing", kind: "post" });
  await h.add({ id: "page-1", title: "Pricing page", text: "details", kind: "page" });
  await h.add({ id: "page-2", title: "Other page", text: "pricing", kind: "page" });
  const all = ids(await h.find("pricing"));
  assert.deepEqual([...all].sort(), ["page-1", "page-2", "post-0", "post-1", "post-2", "post-3", "post-4"]);
  assert.ok(all.indexOf("post-0") < all.indexOf("page-1"), "ineligible posts outrank the best eligible page");

  assert.equal((await h.find("pricing", { limit: 2 })).length, 2);
  // The 5 posts would fill any page of size 1 if LIMIT ran before the kind filter; it must not.
  assert.deepEqual(ids(await h.find("pricing", { kind: "page", limit: 1 })), ["page-1"]);
});

// ---------------------------------------------------------------------------
// 3. Workspace isolation
// ---------------------------------------------------------------------------

test("a search never crosses a workspace boundary, even for an identical title", async () => {
  const h = harness();
  await h.add({ id: "mine", title: "Pricing", text: "Same title, my workspace." });
  await h.add({ id: "theirs", title: "Pricing", text: "Same title, another workspace.", workspaceId: OTHER_WS });

  assert.deepEqual(ids(await h.find("pricing")), ["mine"]);
  assert.deepEqual(ids(await h.find("pricing", { workspaceId: OTHER_WS })), ["theirs"]);
});

// ---------------------------------------------------------------------------
// 4. The index stays correct across create / update / delete / restore
// ---------------------------------------------------------------------------

test("a newly created post is findable immediately — no reindex step", async () => {
  const h = harness();
  await h.add({ id: "p1", title: "Sponsorship tiers", text: "Bronze, silver, gold." });

  assert.deepEqual(ids(await h.find("sponsorship")), ["p1"]);
  assert.deepEqual(ids(await h.find("silver")), ["p1"]);
});

test("an update replaces the indexed text — the old wording stops matching", async () => {
  const h = harness();
  const post = await h.add({ id: "p1", title: "Pricing and plans", text: "Ten dollars a month." });

  await updatePost({
    deps: { repo: h.repo, clock, outbox: noopOutbox, remove: removeVia(h.repo) },
    input: { workspaceId: WS, id: post.id, title: "Sponsorship tiers", slug: "sponsorship", bodyJson: body("Bronze, silver, gold."), status: "published" },
  });

  assert.deepEqual(ids(await h.find("sponsorship")), ["p1"], "the new title must be findable");
  assert.deepEqual(ids(await h.find("silver")), ["p1"], "the new body must be findable");
  assert.deepEqual(await h.find("dollars"), [], "the replaced body text must be GONE, not merely outranked");
  assert.deepEqual(await h.find("plans"), [], "the replaced title must be gone too");
});

test("a soft-deleted post disappears from search, and a restore brings it back", async () => {
  const h = harness();
  const post = await h.add({ id: "p1", title: "Pricing", text: "Ten dollars." });
  await h.add({ id: "p2", title: "Pricing elsewhere", text: "Also ten dollars." });

  await deletePost({ deps: { repo: h.repo, clock, outbox: noopOutbox, remove: removeVia(h.repo) }, input: { workspaceId: WS, id: post.id } });
  assert.deepEqual(ids(await h.find("pricing")), ["p2"], "the trashed row must vanish, the sibling must not");

  // Exactly what `core/commands/appliers.ts`'s `postDeleteReverter` does: clear the marker and
  // `save()`. Nothing in that path knows the search index exists, which is the point.
  const trashed = await h.repo.findById({ workspaceId: WS, id: post.id });
  assert.ok(trashed);
  await h.repo.save({ ...trashed, deletedAt: null, version: trashed.version + 1 });

  assert.deepEqual(ids(await h.find("pricing")).sort(), ["p1", "p2"], "a restored post must be findable again");
});

test("a trashed post is excluded without its index row being removed — the filter is on the live row", async () => {
  const h = harness();
  const post = await h.add({ id: "p1", title: "Pricing", text: "Ten dollars." });
  await deletePost({ deps: { repo: h.repo, clock, outbox: noopOutbox, remove: removeVia(h.repo) }, input: { workspaceId: WS, id: post.id } });

  const indexed = h.db.$client.prepare("SELECT COUNT(*) AS n FROM post_search_document WHERE post_id = 'p1'").get() as { n: number };
  assert.equal(indexed.n, 1, "the projection is deliberately retained so a restore needs no reindex");
  assert.deepEqual(await h.find("pricing"), [], "and yet the post must not be returned");
});

test("a HARD-deleted post takes its projection with it — nothing is left pointing at a row that is gone", async () => {
  const h = harness();
  await h.add({ id: "p1", title: "Pricing", text: "Ten dollars." });
  await h.add({ id: "p2", title: "Pricing addendum", text: "Also ten dollars." });

  await h.repo.hardDelete({ workspaceId: WS, id: "p1" });

  const orphan = h.db.$client.prepare("SELECT COUNT(*) AS n FROM post_search_document WHERE post_id = 'p1'").get() as { n: number };
  assert.equal(orphan.n, 0, "the opposite of a trash: there is no row left to restore, so the projection must go too");
  assert.deepEqual(ids(await h.find("pricing")), ["p2"], "the surviving post is still findable");
});

test("re-saving the same post does not duplicate it in the results", async () => {
  const h = harness();
  const post = await h.add({ id: "p1", title: "Pricing", text: "Ten dollars." });
  for (let i = 0; i < 3; i += 1) await h.repo.save({ ...post, version: post.version + i });

  assert.deepEqual(ids(await h.find("pricing")), ["p1"]);
});

// ---------------------------------------------------------------------------
// 5. Backfill — existing posts become searchable without an edit
// ---------------------------------------------------------------------------

/** Writes straight into `posts`, bypassing `SqlitePostRepo` entirely — the shape both a
 * pre-0022 database and `seedContentDb`'s own first-run demo insert leave behind. */
function insertUnindexedPost(db: ContentDb, spec: { id: string; title: string; slug: string; bodyJson: unknown }): void {
  db.$client
    .prepare(
      `INSERT INTO posts (id, workspace_id, title, slug, body_json, status, kind, updated_at, version, ext)
       VALUES (?, ?, ?, ?, ?, 'published', 'post', ?, 1, '{}')`
    )
    .run(spec.id, WS, spec.title, spec.slug, JSON.stringify(spec.bodyJson), clock.nowIso());
}

test("backfill indexes posts written without going through the repo", async () => {
  const h = harness();
  insertUnindexedPost(h.db, { id: "legacy", title: "Pricing", slug: "pricing", bodyJson: body("Ten dollars a month.") });

  assert.deepEqual(await h.find("pricing"), [], "precondition: the row exists but is unindexed");

  assert.equal(await backfillPostSearchIndex(h.db), 1);
  assert.deepEqual(ids(await h.find("pricing")), ["legacy"]);
  assert.deepEqual(ids(await h.find("dollars")), ["legacy"], "the body text must be indexed too, not just the title");
});

test("backfill is a no-op on a warm database and is safe to run repeatedly", async () => {
  const h = harness();
  await h.add({ id: "p1", title: "Pricing", text: "Ten dollars." });
  insertUnindexedPost(h.db, { id: "legacy", title: "Sponsorship", slug: "sponsorship", bodyJson: body("Bronze.") });

  assert.equal(await backfillPostSearchIndex(h.db), 1, "only the missing row is written");
  assert.equal(await backfillPostSearchIndex(h.db), 0, "a second run writes nothing");
  assert.equal(await backfillPostSearchIndex(h.db), 0);

  assert.deepEqual(ids(await h.find("pricing")), ["p1"], "the already-indexed row is untouched and still findable");
  assert.deepEqual(ids(await h.find("sponsorship")), ["legacy"]);
});

test("backfill survives an unparseable legacy body — title and slug are still indexed", async () => {
  const h = harness();
  h.db.$client
    .prepare(
      `INSERT INTO posts (id, workspace_id, title, slug, body_json, status, kind, updated_at, version, ext)
       VALUES ('corrupt', ?, 'Pricing', 'pricing', 'not json at all', 'published', 'post', ?, 1, '{}')`
    )
    .run(WS, clock.nowIso());

  await assert.doesNotReject(backfillPostSearchIndex(h.db), "one bad row must not stop the server booting");
  assert.deepEqual(ids(await h.find("pricing")), ["corrupt"]);
});

test("backfill indexes a whole legacy corpus in one pass", async () => {
  const h = harness();
  for (let i = 0; i < 25; i += 1) {
    insertUnindexedPost(h.db, { id: `legacy-${i}`, title: `Legacy entry ${i}`, slug: `legacy-${i}`, bodyJson: body(`Body of entry ${i}.`) });
  }

  assert.equal(await backfillPostSearchIndex(h.db, { batchSize: 7 }), 25);
  assert.equal((await h.find("legacy", { limit: 50 })).length, 25);
  assert.deepEqual(ids(await h.find("legacy", { limit: 50 })).sort(), Array.from({ length: 25 }, (_, i) => `legacy-${i}`).sort());
  assert.equal(await backfillPostSearchIndex(h.db, { batchSize: 7 }), 0, "a repeat after all four batches writes nothing");
});


test("a long post returns a bounded contextual snippet rather than the entire extracted body", async () => {
  const h = harness();
  const text = `DISTANT_START ${"unrelated opening words ".repeat(80)} needlecontext is the relevant passage ${"unrelated ending words ".repeat(80)} DISTANT_END`;
  await h.add({ id: "long", title: "Long document", text });
  const hits = await h.find("needlecontext");
  assert.deepEqual(ids(hits), ["long"]);
  const snippet = hits[0].snippet;
  assert.match(snippet, /needlecontext is the relevant passage/);
  assert.ok(snippet.length < 400, "twenty-token excerpt stays bounded on a very long post");
  assert.equal(snippet.includes("DISTANT_START"), false);
  assert.equal(snippet.includes("DISTANT_END"), false);
});

test("the production search factory waits for legacy backfill readiness before querying", { timeout: 5000 }, async () => {
  const h = harness();
  insertUnindexedPost(h.db, { id: "legacy-ready", title: "Readiness", slug: "readiness", bodyJson: body("legacy body") });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const ready = gate.then(() => backfillPostSearchIndex(h.db));
  const search = postSearchIndexFor(contentKernel(h.db), { ready });
  let settled = false;
  const pending = search.search({ workspaceId: WS, terms: ["readiness"], limit: 10 }).then((hits) => { settled = true; return hits; });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(settled, false, "a query cannot return the pre-backfill empty result");
  } finally { release(); }
  assert.deepEqual(ids(await pending), ["legacy-ready"]);
  assert.equal(await ready, 1);
});

test("the production search factory propagates a deferred readiness failure", { timeout: 5000 }, async () => {
  const h = harness();
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((_, reject) => { rejectReady = reject; });
  const failure = new Error("legacy backfill failed");
  const search = postSearchIndexFor(contentKernel(h.db), { ready });
  const pending = assert.rejects(search.search({ workspaceId: WS, terms: ["pricing"], limit: 10 }), failure);
  rejectReady(failure);
  await pending;
});

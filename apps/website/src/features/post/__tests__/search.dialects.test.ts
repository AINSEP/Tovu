import assert from "node:assert/strict";
import { before, test } from "node:test";

import type { Clock as ClockPort, JsonObject, UUID } from "@jini-ai/core/primitives";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { createPost, updatePost, deletePost } from "../post.js";
import { postRepoFor } from "../repo.js";
import { searchAdminPosts } from "../search.js";
import { backfillPostSearchIndex, PostSearchIndex } from "../search-index.js";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { removeVia } from "./remove-post-double.js";
import { EVAL_POSTS, EVAL_QUERIES, evalGateFailures, SQLITE_BASELINE } from "./search.eval.js";

/**
 * @file Post search on every dialect (storage-adapter plan F1): the eval set (`search.eval.ts`) on
 * SQLite FTS5 and on PGlite `tsvector`, through the real repo writes and the real search port.
 *
 * SQLite must reproduce its recorded baseline exactly. PGlite must pass the gate: top 3 contains
 * SQLite's top 1 wherever SQLite finds anything, and nothing wherever SQLite finds nothing. Every
 * per-query difference is printed as a test diagnostic. `RECORD_SEARCH_EVAL=1` prints the SQLite
 * results as a baseline literal instead of asserting them.
 */

const WS = "ws-search-eval" as UUID;
const clock: ClockPort & { nowIso(): string } = { nowMs() { return Date.parse(this.nowIso()); }, nowIso: () => "2026-09-28T00:00:00.000Z" };
const RECORD = process.env.RECORD_SEARCH_EVAL === "1";

function body(text: string): JsonObject {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } as unknown as JsonObject;
}

async function run(kernel: ContentKernel, query: string, limit = 10): Promise<string[]> {
  const { hits } = await searchAdminPosts({ deps: { search: new PostSearchIndex(kernel) }, input: { workspaceId: WS, query, limit } });
  return hits.map((hit) => hit.id);
}

describeEachDialect<ContentKernel>("post search eval", { tables: ["posts", "post_revisions"], make: (kernel) => kernel }, (make, dialect) => {
  let kernel: ContentKernel;
  const results = new Map<string, string[]>();

  before(async () => {
    kernel = make();
    const repo = postRepoFor(kernel);
    for (const post of EVAL_POSTS) {
      await createPost({
        deps: { repo, clock },
        input: { workspaceId: WS, id: post.id as UUID, title: post.title, kind: "post", bodyJson: body(post.text), status: "published" },
      });
    }
    for (const q of EVAL_QUERIES) results.set(q.id, await run(kernel, q.query));
  });

  if (dialect === "sqlite") {
    test("SQLite FTS5 reproduces the recorded baseline", { skip: RECORD ? "recording mode explicitly skips baseline verification" : false }, () => {
      for (const q of EVAL_QUERIES) assert.deepEqual(results.get(q.id), SQLITE_BASELINE[q.id], `${q.id} ${q.class}: "${q.query}"`);
    });
    test("record SQLite search baseline diagnostics", { skip: !RECORD }, (t) => {
      t.diagnostic(JSON.stringify(Object.fromEntries(results)));
    });
  } else {
    test("PGlite tsvector passes the gate on every query", (t) => {
      assert.deepEqual(evalGateFailures(results, (line) => t.diagnostic(line)), []);
    });
  }

  test("a saved post is findable at once; the backfill indexes nothing on a warm database", async () => {
    assert.equal(await backfillPostSearchIndex(kernel), 0);
    assert.deepEqual((await run(kernel, "pricing")).slice(0, 1), ["p01"]);
  });

  test("search filters workspace, trash, kind and status independently on every dialect", async () => {
    const repo = postRepoFor(kernel);
    const search = new PostSearchIndex(kernel);
    for (const [id, workspaceId, kind, status] of [
      ["visibility-live", WS, "page", "published"], ["visibility-foreign", "foreign-ws", "page", "published"],
      ["visibility-trash", WS, "page", "published"], ["visibility-draft", WS, "page", "draft"], ["visibility-post", WS, "post", "published"],
    ] as const) {
      await createPost({ deps: { repo, clock }, input: { workspaceId, id, title: "Visibilitytoken", kind, status, bodyJson: body("Visibilitytoken") } });
    }
    await repo.softDelete({ workspaceId: WS, id: "visibility-trash", deletedAt: clock.nowIso(), updatedAt: clock.nowIso(), version: 2 });
    const find = async (filters: { workspaceId?: string; kind?: "page" | "post"; status?: "draft" | "published"; limit?: number } = {}) =>
      (await searchAdminPosts({ deps: { search }, input: { workspaceId: WS, query: "visibilitytoken", ...filters } })).hits.map((hit) => hit.id).sort();
    assert.deepEqual(await find({ kind: "page", status: "published", limit: 1 }), ["visibility-live"]);
    assert.deepEqual(await find({ kind: "page", status: "draft" }), ["visibility-draft"]);
    assert.deepEqual(await find({ kind: "post", status: "published" }), ["visibility-post"]);
    assert.deepEqual(await find({ workspaceId: "foreign-ws", kind: "page", status: "published" }), ["visibility-foreign"]);
    assert.deepEqual(await find(), ["visibility-draft", "visibility-live", "visibility-post"]);
  });

  test("indexed text updates, trash, restore and hard deletion stay correct on every dialect", async () => {
    const repo = postRepoFor(kernel);
    const outbox = new InMemoryOutbox();
    const deps = { repo, clock, outbox, remove: removeVia(repo) };
    const { post } = await createPost({ deps, input: { workspaceId: WS, id: "lifecycle", title: "Oldword", bodyJson: body("Oldbody"), status: "published" } });
    assert.deepEqual(await run(kernel, "oldbody"), ["lifecycle"]);
    await updatePost({ deps, input: { workspaceId: WS, id: post.id, title: "Newword", slug: "newword", bodyJson: body("Newbody"), status: "published", expectedVersion: post.version } });
    assert.deepEqual(await run(kernel, "newword"), ["lifecycle"]);
    assert.deepEqual(await run(kernel, "newbody"), ["lifecycle"]);
    assert.deepEqual(await run(kernel, "oldword"), []);
    assert.deepEqual(await run(kernel, "oldbody"), []);
    await deletePost({ deps, input: { workspaceId: WS, id: post.id } });
    assert.deepEqual(await run(kernel, "newbody"), []);
    const trashed = await repo.findById({ workspaceId: WS, id: post.id });
    assert.ok(trashed);
    await repo.save({ ...trashed, deletedAt: null, version: trashed.version + 1 });
    assert.deepEqual(await run(kernel, "newbody"), ["lifecycle"]);
    await repo.hardDelete({ workspaceId: WS, id: post.id });
    assert.deepEqual(await run(kernel, "newbody"), []);
    assert.equal(await repo.findById({ workspaceId: WS, id: post.id }), null);
    const { sql } = await import("kysely");
    assert.deepEqual(await kernel.query(sql`SELECT post_id FROM post_search_document WHERE post_id = 'lifecycle'`), []);
  });
});

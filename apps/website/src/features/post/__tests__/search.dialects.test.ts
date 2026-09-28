import assert from "node:assert/strict";
import { before, test } from "node:test";

import type { ClockPort, JsonObject, UUID } from "@jini-ai/cms/core";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { createPost } from "../post.js";
import { postRepoFor } from "../repo.js";
import { searchAdminPosts } from "../search.js";
import { backfillPostSearchIndex, PostSearchIndex } from "../search-index.js";
import { EVAL_POSTS, EVAL_QUERIES, SQLITE_BASELINE } from "./search.eval.js";

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
const clock: ClockPort = { nowIso: () => "2026-09-28T00:00:00.000Z" };
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
    test("SQLite FTS5 reproduces the recorded baseline", (t) => {
      if (RECORD) {
        t.diagnostic(JSON.stringify(Object.fromEntries(results)));
        return;
      }
      for (const q of EVAL_QUERIES) assert.deepEqual(results.get(q.id), SQLITE_BASELINE[q.id], `${q.id} ${q.class}: "${q.query}"`);
    });
  } else {
    test("PGlite tsvector passes the gate on every query", (t) => {
      const failures: string[] = [];
      for (const q of EVAL_QUERIES) {
        const expected = SQLITE_BASELINE[q.id] ?? [];
        const got = results.get(q.id) ?? [];
        const pass = expected.length === 0 ? got.length === 0 : got.slice(0, 3).includes(expected[0]);
        if (JSON.stringify(got) !== JSON.stringify(expected)) {
          t.diagnostic(`${pass ? "differs" : "FAILS"} ${q.id} ${q.class} "${q.query}": sqlite=${expected.join(",")} pg=${got.join(",")}`);
        }
        if (!pass) failures.push(q.id);
      }
      assert.deepEqual(failures, []);
    });
  }

  test("a saved post is findable at once; the backfill indexes nothing on a warm database", async () => {
    assert.equal(await backfillPostSearchIndex(kernel), 0);
    assert.deepEqual((await run(kernel, "pricing")).slice(0, 1), ["p01"]);
  });
});

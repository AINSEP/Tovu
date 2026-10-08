import assert from "node:assert/strict";
import test from "node:test";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";

/**
 * @file Search-ranking evidence for `fs_list_files`/`fs_read_file` (SPEC-053). The owner dropped
 * `/Users/la/Desktop/fake` onto the admin chat and asked "whats in this folder?"; the custom root was
 * set correctly, but the model — which only sees the `search_tools` meta-tool surface — answered
 * that it had "no general-purpose local filesystem browsing tool" and never called either tool.
 * Both had no entry in `TOOL_SEARCH_KEYWORDS` or the doc2query map, so the operator's words
 * ("folder", "directory", "my computer") were never indexed.
 *
 * Same harness as `tool-search-keywords.backfill-ranking.test.ts`: the real catalog, built the way
 * both boot paths build it.
 */

interface RankingCase {
  /** How an operator actually phrases the request. */
  readonly query: string;
  readonly expect: string;
}

const CASES: readonly RankingCase[] = [
  { query: "/Users/la/Desktop/fake - whats in this folder?", expect: "fs_list_files" },
  { query: "list the files in a folder on my computer", expect: "fs_list_files" },
  { query: "look inside this directory I dropped", expect: "fs_list_files" },
  { query: "read a file from a local folder on my machine", expect: "fs_read_file" },
];

const SEARCH_LIMIT = 10;
const TOP_N = 3;

test("an operator asking about a dropped or local folder finds the fs-files tools in the top 3", async () => {
  const { catalog } = await realToolCatalog();
  const misses = CASES.flatMap((c) => {
    const hits = catalog.search({ query: c.query }, { limit: SEARCH_LIMIT });
    const index = hits.findIndex((hit) => hit.id === c.expect);
    const rank = index === -1 ? null : index + 1;
    return rank !== null && rank <= TOP_N
      ? []
      : [`"${c.query}" -> ${c.expect} rank ${rank ?? "MISS"} (top hit: ${hits[0]?.id ?? "(none)"})`];
  });
  assert.deepEqual(misses, []);
});

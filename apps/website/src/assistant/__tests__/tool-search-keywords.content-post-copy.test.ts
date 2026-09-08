import assert from "node:assert/strict";
import test from "node:test";

import { TOOL_SEARCH_KEYWORDS } from "../tool-search-keywords.js";

/**
 * @file Regression coverage for the page-tool-gap dispatch's confirmed-by-grep finding
 * (`ADS-memory/reports/2026-09-07-page-tool-gap.md` §5): every `content_post_*` entry had ZERO
 * "copy"/"duplicate" search vocabulary, so a correctly-wired copy capability could still never
 * reach the model on a "copy this page" request if `search_tools`/`byok-tool-surface.ts` gates
 * reachability on this file (this file's own header). Pins that the vocabulary now exists on the
 * entries an operator's "copy this page" request would plausibly search first, plus the
 * cross-resource `content_duplicate` tool's own entry.
 *
 * The last two tests also pin the KEY itself against a live tool id: the entry was originally keyed
 * `content_post_duplicate`, and when that bespoke tool was folded into `content_duplicate` a stale
 * key would have left the real tool with no search vocabulary at all while this file still looked
 * fully populated — the exact silent-failure mode this file exists to catch.
 */

const COPY_OR_DUPLICATE = /\b(copy|duplicate)\b/;

test("content_post_search, content_post_list, content_post_get, and content_post_create all carry copy/duplicate vocabulary", () => {
  for (const toolId of ["content_post_search", "content_post_list", "content_post_get", "content_post_create"]) {
    const keywords = TOOL_SEARCH_KEYWORDS[toolId];
    assert.ok(keywords, `expected ${toolId} to have a TOOL_SEARCH_KEYWORDS entry at all`);
    assert.match(keywords!, COPY_OR_DUPLICATE, `expected ${toolId}'s keywords to mention copy/duplicate`);
  }
});

test("content_duplicate has its own search-keyword entry, phrased from the failing production request", () => {
  const keywords = TOOL_SEARCH_KEYWORDS["content_duplicate"];
  assert.ok(keywords, "expected content_duplicate to have a TOOL_SEARCH_KEYWORDS entry");
  assert.match(keywords!, COPY_OR_DUPLICATE);
  assert.match(keywords!, /\bclone\b/);
});

test("the retired content_post_duplicate key is gone — a keyword entry for a tool that no longer exists is unreachable vocabulary", () => {
  assert.equal(
    TOOL_SEARCH_KEYWORDS["content_post_duplicate"],
    undefined,
    "content_post_duplicate was folded into content_duplicate; its keyword entry must not linger",
  );
});

test("content_duplicate's keywords name every resource it actually supports, so 'copy that form' reaches it", () => {
  const keywords = TOOL_SEARCH_KEYWORDS["content_duplicate"]!;
  for (const resource of ["post", "page", "form", "media"]) {
    assert.match(keywords, new RegExp(`\\b${resource}\\b`), `expected content_duplicate's keywords to mention '${resource}'`);
  }
});

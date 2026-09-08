import assert from "node:assert/strict";
import test from "node:test";

import { TOOL_SEARCH_KEYWORDS } from "../tool-search-keywords.js";

/**
 * @file Regression coverage for the page-tool-gap dispatch's confirmed-by-grep finding
 * (`ADS-memory/reports/2026-09-07-page-tool-gap.md` §5): every `content_post_*` entry had ZERO
 * "copy"/"duplicate" search vocabulary, so a correctly-wired copy capability could still never
 * reach the model on a "copy this page" request if `search_tools`/`byok-tool-surface.ts` gates
 * reachability on this file (this file's own header). Pins that the vocabulary now exists on the
 * entries an operator's "copy this page" request would plausibly search first, plus the new
 * `content_post_duplicate` tool's own entry.
 */

const COPY_OR_DUPLICATE = /\b(copy|duplicate)\b/;

test("content_post_search, content_post_list, content_post_get, and content_post_create all carry copy/duplicate vocabulary", () => {
  for (const toolId of ["content_post_search", "content_post_list", "content_post_get", "content_post_create"]) {
    const keywords = TOOL_SEARCH_KEYWORDS[toolId];
    assert.ok(keywords, `expected ${toolId} to have a TOOL_SEARCH_KEYWORDS entry at all`);
    assert.match(keywords!, COPY_OR_DUPLICATE, `expected ${toolId}'s keywords to mention copy/duplicate`);
  }
});

test("content_post_duplicate has its own search-keyword entry, phrased from the failing production request", () => {
  const keywords = TOOL_SEARCH_KEYWORDS["content_post_duplicate"];
  assert.ok(keywords, "expected content_post_duplicate to have a TOOL_SEARCH_KEYWORDS entry");
  assert.match(keywords!, COPY_OR_DUPLICATE);
  assert.match(keywords!, /\bclone\b/);
});

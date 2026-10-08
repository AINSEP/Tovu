import assert from "node:assert/strict";
import test from "node:test";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";

import { TOOL_SEARCH_KEYWORDS } from "../tool-search-keywords.js";

/**
 * @file Historical regression rationale (literal vocabulary pins now replaced by the real copy query).
 * Regression coverage for the page-tool-gap dispatch's confirmed-by-grep finding
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

// F1.4/F2.4: pin a live registered id and execute production search against its competitors.
test("'copy this page' ranks the actual content_duplicate tool first in the full catalog", async () => {
  const { registry, catalog } = await realToolCatalog();
  assert.ok(registry.has({ toolId: 'content_duplicate' }));
  const hits = catalog.search({ query: 'copy this page' }, { limit: 10 });
  assert.equal(hits[0]?.id, 'content_duplicate', `got ${hits.map(hit => hit.id).join(', ')}`);
});

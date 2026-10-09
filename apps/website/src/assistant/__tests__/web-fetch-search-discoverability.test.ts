import assert from "node:assert/strict";
import test from "node:test";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";

/**
 * @file `web_fetch_page` is reachable the way every non-Claude-Code assistant reaches a tool: through
 * search_tools' FTS5/BM25 ranking over the REAL first-party catalog (production contributors over
 * in-memory route deps). BYOK publishes only search_tools/describe_tool/execute_delegated_tool, so a
 * tool that does not rank is a tool that does not exist (2026-10-08: "turn this site into tovu pages").
 * The sibling page readers, fetch_published_page and fetch_live_url, read only THIS site, so they are
 * the ranking this must beat.
 */

const OPERATOR_PHRASINGS = [
  "fetch a web page",
  "read a website",
  "open this URL and read it",
  "turn this existing website into pages and posts",
  "read the sitemap.xml of another site",
];

test("web_fetch_page is registered in the real catalog and ranks top-3 for operator phrasings", async () => {
  const { registry, catalog } = await realToolCatalog();
  assert.ok(registry.list({}).some(tool => tool.id === "web_fetch_page"), "web_fetch_page must be in the real assistant registry");
  for (const query of OPERATOR_PHRASINGS) {
    const hits = catalog.search({ query }, { limit: 3 }).map(hit => hit.id);
    assert.ok(hits.includes("web_fetch_page"), `'${query}': expected web_fetch_page in top-3; got ${hits.join(", ") || "(none)"}`);
  }
});

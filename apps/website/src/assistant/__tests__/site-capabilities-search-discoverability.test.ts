import assert from "node:assert/strict";
import test from "node:test";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";

/**
 * @file Either name finds `site_describe_capabilities` through the real `search_tools` ranking: the
 * owner asked for "describe_site_capabilities", while the id follows `<domain>_<verb>` so
 * `tool-catalog-query.ts`'s `sourceForToolId` files it under `site`. Run against the real catalog
 * built the way both boot paths build it, so a pass means the right id actually ranks, not merely
 * that a keyword string exists.
 */

test("the owner's name for it, 'describe_site_capabilities', ranks site_describe_capabilities first", async () => {
  const hits = (await realToolCatalog()).catalog.search({ query: "describe_site_capabilities" }, { limit: 5 }).map((hit) => hit.id);
  assert.equal(hits[0], "site_describe_capabilities", `got ${hits.join(", ") || "(none)"}`);
});

test("the tool id itself ranks site_describe_capabilities first", async () => {
  const hits = (await realToolCatalog()).catalog.search({ query: "site_describe_capabilities" }, { limit: 5 }).map((hit) => hit.id);
  assert.equal(hits[0], "site_describe_capabilities", `got ${hits.join(", ") || "(none)"}`);
});

test("'what can this site do' ranks site_describe_capabilities in the top 3", async () => {
  const hits = (await realToolCatalog()).catalog.search({ query: "what can this site do" }, { limit: 3 }).map((hit) => hit.id);
  assert.ok(hits.includes("site_describe_capabilities"), `expected it in the top 3; got ${hits.join(", ") || "(none)"}`);
});

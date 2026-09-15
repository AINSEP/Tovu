import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";

import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

/**
 * @file Either name finds `site_describe_capabilities` through the real `search_tools` ranking: the
 * owner asked for "describe_site_capabilities", while the id follows `<domain>_<verb>` so
 * `tool-catalog-query.ts`'s `sourceForToolId` files it under `site`. Run against the real catalog
 * built the way both boot paths build it, so a pass means the right id actually ranks, not merely
 * that a keyword string exists.
 */

async function realCatalog() {
  resetToolContributorsForTests();
  installFirstPartyToolContributors();
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;

  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations(routeDeps)) registry.register(registration);
  return buildToolCatalogQuery(registry);
}

test("the owner's name for it, 'describe_site_capabilities', ranks site_describe_capabilities first", async () => {
  const hits = (await realCatalog()).search("describe_site_capabilities", 5).map((hit) => hit.id);
  assert.equal(hits[0], "site_describe_capabilities", `got ${hits.join(", ") || "(none)"}`);
});

test("the tool id itself ranks site_describe_capabilities first", async () => {
  const hits = (await realCatalog()).search("site_describe_capabilities", 5).map((hit) => hit.id);
  assert.equal(hits[0], "site_describe_capabilities", `got ${hits.join(", ") || "(none)"}`);
});

test("'what can this site do' ranks site_describe_capabilities in the top 3", async () => {
  const hits = (await realCatalog()).search("what can this site do", 3).map((hit) => hit.id);
  assert.ok(hits.includes("site_describe_capabilities"), `expected it in the top 3; got ${hits.join(", ") || "(none)"}`);
});

import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

/**
 * @file Pins the incident `media_view_image` exists for: asked to write alt text, the
 * assistant searched, found no way to open an image, and refused to guess. Runs the REAL production
 * catalog (every first-party contributor, the real FTS5/BM25 ranking) rather than a hand-picked set of
 * distractors, so the competition is every other media tool — `media_update_metadata` mentions alt
 * text too, and a fake catalog would hide that.
 *
 * Top 3 rather than top 10 (`search_tools`' default limit): a model reads the first few hits, and a
 * tool it has to scroll for is a tool it will not call.
 */

const TOOL_ID = "media_view_image";

async function realCatalog() {
  resetToolContributorsForTests();
  installFirstPartyToolContributors();
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations({ ...routeDeps, magicLinkPerEmailLimiter })) {
    registry.register(registration);
  }
  return buildToolCatalogQuery(registry);
}

const QUERIES = [
  "write alt text for this image",
  "look at the image and describe it",
  "see picture",
  "view image",
  "what does this photo show",
  "look at media",
];

test("every way an operator asks to look at an image ranks media_view_image in the top 3 of the real catalog", async () => {
  const catalog = await realCatalog();
  const misses: string[] = [];
  for (const query of QUERIES) {
    const hits = catalog.search(query, 3).map((hit) => hit.id);
    if (!hits.includes(TOOL_ID)) misses.push(`"${query}" -> ${hits.join(", ") || "(none)"}`);
  }
  assert.deepEqual(misses, [], `queries that missed the top 3:\n${misses.join("\n")}`);
});

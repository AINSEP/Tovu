import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";

import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

/**
 * @file Pins `web_screenshot_page`'s discoverability against the REAL production catalog (every
 * first-party contributor, the real FTS5/BM25 ranking), so its competition is every other page tool
 * — `web_fetch_page`, `fetch_published_page`, `site_collect_page_evidence` and `media_view_image` all
 * share words with it. Top 3: a model reads the first few hits.
 */

const TOOL_ID = "web_screenshot_page";

async function realCatalog() {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const registry = createToolRegistry({});
  for (const registration of buildAssistantToolRegistrations({ ...routeDeps, magicLinkPerEmailLimiter }, undefined, { contributions })) {
    registry.register(registration);
  }
  return buildToolCatalogQuery(registry);
}

const QUERIES = [
  "screenshot a web page",
  "see how a page looks",
  "take a screenshot of this website",
  "what does this site look like",
  "how does this website look on mobile",
  "what does our site look like on desktop",
  "compare our page with the original site visually",
  "visual parity with the imported site",
];

test("every way an operator asks to see a page ranks web_screenshot_page in the top 3 of the real catalog", async () => {
  const catalog = await realCatalog();
  const misses: string[] = [];
  for (const query of QUERIES) {
    const hits = catalog.search({ query: query }, { limit: 3 }).map((hit) => hit.id);
    if (!hits.includes(TOOL_ID)) misses.push(`"${query}" -> ${hits.join(", ") || "(none)"}`);
  }
  assert.deepEqual(misses, [], `queries that missed the top 3:\n${misses.join("\n")}`);
});

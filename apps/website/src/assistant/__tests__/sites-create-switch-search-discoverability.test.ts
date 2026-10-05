import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
/**
 * `sites_create_site` / `sites_switch_site` (2026-10-05) rank in the top 3 of the real FTS5 catalog
 * for plain owner phrasings. In-sample discoverability checks (same shape as
 * `admin-parity-search-discoverability.test.ts`), not a blind eval.
 */
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

const CASES: Record<string, string[]> = {
  sites_create_site: ["create a new site", "make a new website for another client", "start a blank site", "add another site"],
  sites_switch_site: ["switch to my other site", "switch site", "activate a different site", "change which site is being served"],
};
test("sites create/switch tools rank in the top 3 of the real catalog", async () => {
  const catalog = await realCatalog();
  const misses: string[] = [];
  for (const [id, queries] of Object.entries(CASES)) {
    for (const query of queries) {
      const hits = catalog.search({ query }, { limit: 3 }).map(hit => hit.id);
      if (!hits.includes(id)) misses.push(`${id}: "${query}" -> ${hits.join(", ")}`);
    }
  }
  assert.deepEqual(misses, [], `queries that missed the top 3:\n${misses.join("\n")}`);
});

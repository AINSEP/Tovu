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

/** t11: search the complete production catalog through real SQLite FTS5/BM25. */

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

const QUERIES: Record<string, string[]> = {
  marketplace_list_themes: ["browse theme marketplace", "find a new theme", "available theme templates", "theme gallery designs", "show marketplace themes"],
  theme_install_from_marketplace: ["theme install", "install theme from marketplace", "download theme", "add a marketplace theme", "get a new theme", "use a different design"],
  theme_rescan: ["rescan themes", "refresh themes", "new theme folder not showing", "reload themes", "pick up my new theme folder"],
};

for (const [toolId, queries] of Object.entries(QUERIES)) {
  test(`${toolId} ranks in the top 3 for owner requests`, async () => {
    const catalog = await realCatalog();
    const misses = queries.flatMap((query) => {
      const hits = catalog.search({ query: query }, { limit: 3 }).map((hit) => hit.id);
      return hits.includes(toolId) ? [] : [`"${query}" -> ${hits.join(", ") || "(none)"}`];
    });
    assert.deepEqual(misses, [], `queries that missed the top 3:\n${misses.join("\n")}`);
  });
}

test("switch my site to theme X still ranks theme_set_active first", async () => {
  const catalog = await realCatalog();
  assert.equal(catalog.search({ query: "switch my site to theme X" }, { limit: 3 })[0]?.id, "theme_set_active");
});

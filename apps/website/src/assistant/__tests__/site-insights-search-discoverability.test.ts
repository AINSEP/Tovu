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

test("four site-insight tools rank top three through the full production FTS catalog", async () => {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps();
  await deps.identityReady;
  const registry = createToolRegistry({});
  for (const registration of buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock }) }, undefined, { contributions })) registry.register(registration);
  const catalog = buildToolCatalogQuery(registry);
  const questions: Record<string, string[]> = {
    content_stats: ["how many posts do I have", "posts vs pages pie chart", "word count of my articles", "content statistics breakdown"],
    analytics_list_recent_hits: ["show recent traffic", "which pages are getting visits", "recent page views and referrers", "who visited my site"],
    system_get_mail_status: ["email not arriving", "didn't get email", "is mail sending configured", "why didn't my magic link arrive"],
    taxonomy_get_assigned_terms: ["which tags does this post have", "show assigned categories for this page", "read assigned taxonomy terms", "what categories are on this post"],
  };
  const misses: string[] = [];
  for (const [id, queries] of Object.entries(questions)) {
    assert.equal(registry.has({ toolId: id }), true, `missing production tool ${id}`);
    for (const query of queries) {
      const hits = catalog.search(query, 3).map((hit) => hit.id);
      if (!hits.includes(id)) misses.push(`${id}: '${query}' -> ${hits.join(", ")}`);
    }
  }
  assert.deepEqual(misses, [], `site-insight discoverability misses:\n${misses.join("\n")}`);
});

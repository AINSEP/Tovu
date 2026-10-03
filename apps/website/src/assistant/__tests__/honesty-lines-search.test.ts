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

/** Uses every production contributor and the real FTS ranking, including lookalike distractors. */
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

test("reset my password ranks the honest identity tool above theme_reset_file", async () => {
  const catalog = await realCatalog();
  const hits = catalog.search("reset my password", 1000).map((hit) => hit.id);
  const identityRank = hits.indexOf("identity_user_update_email");
  const themeRank = hits.indexOf("theme_reset_file");
  assert.ok(identityRank >= 0, `identity_user_update_email must be found: ${hits.join(", ")}`);
  assert.ok(themeRank >= 0, `theme_reset_file distractor must be found: ${hits.join(", ")}`);
  assert.ok(identityRank < themeRank, `identity_user_update_email must outrank theme_reset_file: ${hits.join(", ")}`);
});

for (const [query, toolId] of [
  ["remove the editor role from Sam", "identity_role_assign"],
  ["delete the footer menu", "trash_item"],
  ["empty the trash", "trash_list_items"],
] as const) {
  test(`${query} ranks ${toolId} in the top 3 of the real catalog`, async () => {
    const catalog = await realCatalog();
    const hits = catalog.search(query, 3).map((hit) => hit.id);
    assert.ok(hits.includes(toolId), `${toolId} must rank in the top 3 for "${query}": ${hits.join(", ")}`);
  });
}

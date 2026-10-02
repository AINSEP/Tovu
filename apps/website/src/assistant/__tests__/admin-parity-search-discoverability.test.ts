/**
 * n07 admin-parity acceptance checks against the real first-party FTS5 catalog.
 * These task-derived phrasings are in-sample discoverability checks, not a blind eval.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

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

const CASES: Record<string, string[]> = {
  identity_policy_list_permissions: ["what permissions does this policy grant", "show policy permission rows", "what can this role do", "list policy permissions"],
  sites_list: ["list local sites", "which client sites are on this computer", "which site is serving and which is queued", "show sites registry"],
  publish_content_disconnect: ["disconnect from the live site", "stop this computer publishing to the destination", "disconnect publishing", "forget my connected publish destination"],
  theme_set_page_published: ["publish the theme about page", "unpublish a standalone theme page", "hide the theme pricing page", "set theme page published state"],
  commerce_get_status: ["check store setup status", "which payment providers are available", "commerce status", "is checkout supported yet"],
};
test("admin parity tools rank in the top 3 of the real catalog", async () => {
  const catalog = await realCatalog();
  const misses: string[] = [];
  for (const [id, queries] of Object.entries(CASES)) {
    for (const query of queries) {
      const hits = catalog.search(query, 3).map(hit => hit.id);
      if (!hits.includes(id)) misses.push(`${id}: "${query}" -> ${hits.join(", ")}`);
    }
  }
  assert.deepEqual(misses, [], `queries that missed the top 3:\n${misses.join("\n")}`);
});

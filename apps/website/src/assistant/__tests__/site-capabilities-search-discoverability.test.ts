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
 * @file Either name finds `site_describe_capabilities` through the real `search_tools` ranking: the
 * owner asked for "describe_site_capabilities", while the id follows `<domain>_<verb>` so
 * `tool-catalog-query.ts`'s `sourceForToolId` files it under `site`. Run against the real catalog
 * built the way both boot paths build it, so a pass means the right id actually ranks, not merely
 * that a keyword string exists.
 */

async function realCatalog() {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;

  // Both boot paths build the limiter themselves and add it to `routeDeps`; `AssistantToolRegistryDeps`
  // requires it, so passing bare `routeDeps` does not type-check.
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const registry = createToolRegistry({});
  for (const registration of buildAssistantToolRegistrations({ ...routeDeps, magicLinkPerEmailLimiter }, undefined, { contributions })) {
    registry.register(registration);
  }
  return buildToolCatalogQuery(registry);
}

test("the owner's name for it, 'describe_site_capabilities', ranks site_describe_capabilities first", async () => {
  const hits = (await realCatalog()).search({ query: "describe_site_capabilities" }, { limit: 5 }).map((hit) => hit.id);
  assert.equal(hits[0], "site_describe_capabilities", `got ${hits.join(", ") || "(none)"}`);
});

test("the tool id itself ranks site_describe_capabilities first", async () => {
  const hits = (await realCatalog()).search({ query: "site_describe_capabilities" }, { limit: 5 }).map((hit) => hit.id);
  assert.equal(hits[0], "site_describe_capabilities", `got ${hits.join(", ") || "(none)"}`);
});

test("'what can this site do' ranks site_describe_capabilities in the top 3", async () => {
  const hits = (await realCatalog()).search({ query: "what can this site do" }, { limit: 3 }).map((hit) => hit.id);
  assert.ok(hits.includes("site_describe_capabilities"), `expected it in the top 3; got ${hits.join(", ") || "(none)"}`);
});

import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
/** t09: real production catalog and FTS ranking, including the publishing-readiness competitor. */
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
async function catalog() {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps();
  await deps.identityReady;
  const registry = createToolRegistry({});
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock });
  for (const r of buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter }, undefined, { contributions })) registry.register(r);
  return buildToolCatalogQuery(registry);
}
test("plan and execute pulls are reachable through the real catalog and rank in the top three", async () => {
  const c = await catalog();
  for (const [id, queries] of [
    ["publish_content_plan_pull", ["Pull the live site's content down to my computer.", "Sync my local site with what's live.", "download live content", "bring back changes from live site"]],
    ["publish_content_execute_pull", ["apply pull", "overwrite local with live", "confirm sync", "apply planned pull"]],
  ] as const) {
    assert.notEqual(c.describe(id), null, `${id} must be wired`);
    for (const query of queries) assert.equal(c.search(query, 3).some(h => h.id === id), true, `${query}: ${c.search(query, 3).map(h => h.id).join(", ")}`);
  }
});
test("publishing setup still ranks status first", async () => {
  const c = await catalog();
  assert.equal(c.search("is my site set up to publish", 3)[0]?.id, "publish_content_status");
});

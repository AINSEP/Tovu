import { createContributionRegistry, createToolRegistry } from "@jini-ai/core";
import type { ToolContributor, DerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test from "node:test";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

/** `system_read_server_logs` (gap A-04) is in the production catalog and ranks for operator phrasings. */
test("system_read_server_logs is registered and found for recent-error questions", async () => {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const registry = createToolRegistry({});
  for (const registration of buildAssistantToolRegistrations({ ...routeDeps, magicLinkPerEmailLimiter }, undefined, { contributions })) registry.register(registration);
  const catalog = buildToolCatalogQuery(registry);
  for (const query of ["show me recent server errors", "what went wrong on the server", "server logs", "show the server console output"]) {
    const top = catalog.search({ query }, { limit: 3 }).map(hit => hit.id);
    assert.ok(top.includes("system_read_server_logs"), `"${query}" top 3: ${top.join(", ")}`);
  }
});

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
import { isMcpUiToolCallPermitted } from "../mcp-ui-tool-calls.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

test("both protected settings card callbacks are accepted by the human reply route", () => {
  assert.equal(isMcpUiToolCallPermitted("settings_set_value", true), true);
  assert.equal(isMcpUiToolCallPermitted("settings_clear_value", true), true);
});

test("settings writes and reads rank in the real catalog for owner questions", async () => {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps();
  await deps.identityReady;
  const registry = createToolRegistry({});
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock });
  for (const registration of buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter }, undefined, { contributions })) registry.register(registration);
  const catalog = buildToolCatalogQuery(registry);
  for (const [toolId, queries] of [
    ["settings_set_value", ["Change the site's timezone to Pacific.", "change the site timezone", "Turn off comments on new posts.", "Set the date format to day-month-year.", "Change a site setting", "Update configuration option"]],
    ["settings_clear_value", ["Put that setting back to its default.", "Clear a setting override", "Undo that setting", "Reset one setting to default"]],
  ] as const) {
    for (const query of queries) assert.equal(catalog.search({ query: query }, { limit: 3 }).some((hit) => hit.id === toolId), true, `${query}: ${catalog.search({ query: query }, { limit: 3 }).map((hit) => hit.id).join(", ")}`);
  }
  assert.equal(catalog.search({ query: "Change the site's timezone to Pacific." }, { limit: 1 })[0]?.id, "settings_set_value");
  assert.equal(catalog.search({ query: "what are my site settings" }, { limit: 1 })[0]?.id, "settings_get_effective");
});

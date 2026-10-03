import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const requests: Record<string, string[]> = {
  newsletter_send_test: ["send a test newsletter to myself", "test this email campaign", "email a newsletter preview to the site owner", "send test newsletter"],
  newsletter_send_campaign: ["send this newsletter now", "launch this newsletter to subscribers", "send the newsletter issue", "email this newsletter to my mailing list"],
  newsletter_schedule_campaign: ["schedule this newsletter for tomorrow", "set a send date for this email campaign", "schedule newsletter issue", "schedule a subscriber newsletter send"],
  newsletter_resume_campaign: ["resume this paused newsletter", "continue sending the newsletter", "restart paused newsletter delivery", "resume email campaign"],
  newsletter_pause_campaign: ["pause this newsletter", "hold newsletter delivery", "pause email campaign", "stop sending this newsletter temporarily"],
};

test("adding newsletter delivery does not worsen supported operator requests", async () => {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps();
  await deps.identityReady;
  const fullRegistry = createToolRegistry({});
  const baselineRegistry = createToolRegistry({});
  const newIds = new Set(["newsletter_send_test", "newsletter_send_campaign", "newsletter_schedule_campaign", "newsletter_resume_campaign"]);
  for (const registration of buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock }) }, undefined, { contributions })) {
    fullRegistry.register(registration);
    if (!newIds.has(registration.descriptor.id)) baselineRegistry.register(registration);
  }
  const full = buildToolCatalogQuery(fullRegistry);
  const baseline = buildToolCatalogQuery(baselineRegistry);
  const operatorRequests = JSON.parse(readFileSync(new URL("./fixtures/tool-search-operator-requests.json", import.meta.url), "utf8")) as { id: string; query: string; expect: string[] }[];
  const regressions: string[] = [];
  const compared = new Set<string>();
  for (const request of operatorRequests) {
    const baselineHits = baseline.search(request.query, 3).map((hit) => hit.id);
    if (!request.expect.some((id) => baselineHits.includes(id))) continue;
    compared.add(request.id);
    const hits = full.search(request.query, 3).map((hit) => hit.id);
    if (!request.expect.some((id) => hits.includes(id))) regressions.push(`${request.id}: ${hits.join(", ")}`);
  }
  // Controls keep a broken or empty baseline from making the regression comparison vacuous.
  for (const id of ["pg-01", "nl-01", "nl-04"]) assert.equal(compared.has(id), true, `${id} must be compared`);
  assert.deepEqual(regressions, []);
});

test("newsletter delivery requests rank the action in the top three of the real catalog", async () => {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps();
  await deps.identityReady;
  const registry = createToolRegistry({});
  for (const registration of buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock }) }, undefined, { contributions })) registry.register(registration);
  const catalog = buildToolCatalogQuery(registry);
  const misses: string[] = [];
  for (const [id, queries] of Object.entries(requests)) for (const query of queries) {
    const hits = catalog.search(query, 3).map((hit) => hit.id);
    if (!hits.includes(id)) misses.push(`${query}: ${id} absent from ${hits.join(", ")}`);
  }
  assert.deepEqual(misses, []);
});

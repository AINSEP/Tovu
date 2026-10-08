import { readFileSync } from "node:fs";
import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
/** t10: setup tools must be reachable through the real production FTS catalog. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry } from '@jini-ai/core';
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from '../../contracts/core/rate-limit/rate-limit.js';
import { createRouteDeps } from '../../server/runtime/composition/app.js';
import { installFirstPartyToolContributors } from '../../server/runtime/composition/tool-catalog-manifest.js';

import { buildAssistantToolRegistrations } from '../tool-registrations.js';
import { buildToolCatalogQuery } from '../tool-catalog-query.js';

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

const cases: Record<string, string[]> = {
  credential_save: JSON.parse(readFileSync(new URL("./fixtures/credential-setup-search.json", import.meta.url), "utf8")).map((c: { query: string }) => c.query),
  deployment_ops_set_secret: ["set STRIPE_KEY on my app"],
  media_list_providers: ['which image generation providers are configured', 'list video generation providers', 'which AI image provider can I use', 'is my Replicate image provider configured'],
};
for (const [id, queries] of Object.entries(cases)) test(`t10 ${id} ranks top 3 for credential setup requests`, async () => {
  contributions.contributors.clear({}); installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps(); await deps.identityReady;
  const registry = createToolRegistry({});
  for (const registration of buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock }) }, undefined, { contributions })) registry.register(registration);
  const catalog = buildToolCatalogQuery(registry);
  assert.ok(registry.list({}).some(d => d.id === id), `${id} missing from production catalog`);
  const misses = queries.flatMap(query => { const hits = catalog.search({ query }, { limit: 3 }).map(h => h.id); return hits.includes(id) ? [] : [`${query}: ${hits.join(', ')}`]; });
  assert.deepEqual(misses, [], `${id} search misses: ${misses.join('; ')}`);
});

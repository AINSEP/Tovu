import { createContributionRegistry, createToolRegistry } from '@jini-ai/core';
import type { ToolContributor, DerivedToolContributor } from '../index.js';
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from '../../contracts/core/rate-limit/rate-limit.js';
import { createRouteDeps } from '../../server/runtime/composition/app.js';
import { installFirstPartyToolContributors } from '../../server/runtime/composition/tool-catalog-manifest.js';
import { buildAssistantToolRegistrations } from '../tool-registrations.js';
import { buildToolCatalogQuery } from '../tool-catalog-query.js';

/** Production contributors and registrations over isolated in-memory route dependencies. */
export async function realToolCatalog() {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps();
  await deps.identityReady;
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock });
  const registry = createToolRegistry({});
  for (const registration of buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter }, undefined, { contributions })) registry.register(registration);
  return { registry, catalog: buildToolCatalogQuery(registry) };
}

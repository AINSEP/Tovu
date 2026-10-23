import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import type { AssistantPermanentDeletesPolicy } from '../../contracts/headless/assistant-permanent-deletes-policy.js';
import { createContributionRegistry, createToolRegistry } from '@jini-ai/core';
import { createInMemorySearchState, createStaticAccessPort } from '@jini-ai/search/testkit';
import type { ToolContributor, DerivedToolContributor } from '../index.js';
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from '../../contracts/core/rate-limit/rate-limit.js';
import { createRouteDeps } from '../../server/runtime/composition/app.js';
import { installFirstPartyToolContributors } from '../../server/runtime/composition/tool-catalog-manifest.js';
import { createSiteSearchRuntime } from '../../server/runtime/composition/modules/site-search.js';
import { buildAssistantToolRegistrations } from '../tool-registrations.js';
import { buildToolCatalogQuery } from '../tool-catalog-query.js';

/** Production contributors and registrations over isolated in-memory route dependencies.
 * Search uses its real composition owner with in-memory ports; no provider or network is enabled.
 * @complexity O(t) registration for t tools; indexing is delegated to the catalog owner.
 */
export async function realToolCatalog(_required = {}, optional: { permanentDeletePolicy?: AssistantPermanentDeletesPolicy } = {}) {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps();
  await Promise.all([deps.identityReady, deps.siteTitleReady]);
  // MOVE: The memory root omits site search. Bind its runtime here so discovery exercises the
  // same contributor as production instead of silently omitting all four search tools.
  const state = createInMemorySearchState({});
  const siteSearch = createSiteSearchRuntime({
    workspaceId: deps.workspaceId, siteId: deps.workspaceId, sources: [], ...state,
    access: createStaticAccessPort({ visible: [] }), installId: async () => 'catalog-fixture',
    resolveCredential: async () => null, httpClient: { send: async () => { throw new Error('Catalog fixture has no network'); } },
    loadPluginProviders: async () => ({ items: [], refusals: [] }), isPluginActive: async () => false,
    audiencesForSession: async () => [], readProviderSetting: async () => 'builtin',
    writeProviderSetting: async () => { throw new Error('Catalog fixture cannot change search providers'); },
    now: () => deps.clock.nowMs(),
  });
  await siteSearch.ready;
  // Both boot paths build the limiter themselves and add it to route dependencies;
  // AssistantToolRegistryDeps requires it, so bare route dependencies do not type-check.
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock });
  const routeDeps = { ...deps, siteSearch, magicLinkPerEmailLimiter };
  const registry = createToolRegistry({});
  for (const registration of buildAssistantToolRegistrations(routeDeps, undefined, { contributions, permanentDeletePolicy: optional.permanentDeletePolicy })) registry.register(registration);
  return { registry, catalog: buildToolCatalogQuery(registry) };
}

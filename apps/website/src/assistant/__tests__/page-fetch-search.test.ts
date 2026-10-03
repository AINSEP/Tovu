import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
/** t08: page-tool discovery using the full production catalog and real SQLite search. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry } from '@jini-ai/core';
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from '#src/contracts/core/rate-limit/rate-limit';
import { createRouteDeps } from '#src/server/runtime/composition/app';
import { installFirstPartyToolContributors } from '#src/server/runtime/composition/tool-catalog-manifest';

import { buildAssistantToolRegistrations } from '../tool-registrations.js';
import { buildToolCatalogQuery } from '../tool-catalog-query.js';

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};
test('live checks, unsaved draft previews and finding text rank in the top three', async () => {
  contributions.contributors.clear({}); installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps(); await deps.identityReady;
  const registry = createToolRegistry({});
  for (const r of buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock }) }, undefined, { contributions })) registry.register(r);
  const catalog = buildToolCatalogQuery(registry);
  const queries = {
    fetch_live_url: ['is the live site updated', 'check the production website', 'did it publish to the public domain', 'compare live vs local page'],
    content_post_preview: ['preview a draft before publishing', 'how will this unpublished page look', 'render unsaved edits with a different template', 'see draft page preview'],
    fetch_published_page: ['find text on page', 'search page contains this string', 'visible text of the local rendered page', 'check local page without markup'],
  };
  const misses: string[] = [];
  for (const [tool, phrases] of Object.entries(queries)) for (const phrase of phrases) {
    const hits = catalog.search({ query: phrase }, { limit: 3 }).map(hit => hit.id);
    if (!hits.includes(tool)) misses.push(`${tool}: ${phrase} -> ${hits.join(', ')}`);
  }
  assert.deepEqual(misses, []);
});

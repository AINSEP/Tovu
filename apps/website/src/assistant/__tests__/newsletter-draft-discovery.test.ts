import '../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { realToolCatalog } from './real-tool-catalog.fixture.js';

test('draft a newsletter about our new menu finds campaign creation in the first three tools', async () => {
  const { catalog } = await realToolCatalog();
  const hits = catalog.search({ query: 'draft a newsletter about our new menu' }, { limit: 3 }).map(hit => hit.id);
  assert.ok(hits.includes('newsletter_create_campaign'), hits.join(', '));
});

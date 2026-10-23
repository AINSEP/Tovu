import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('bundled keywords are read only on first search use and then reused on both indexing paths', async t => {
  let reads = 0;
  t.mock.module('node:fs', { namedExports: { ...fs, readFileSync: () => {
    reads++;
    return JSON.stringify({ extensions: { tovu: { toolKeywords: { credential_save: 'lazy-provider' } } } });
  } } });
  t.mock.module('../../platform/site-dir/product-root.js', { namedExports: { resolveProductRoot: () => '/product' } });
  t.mock.module('../../features/agent-plugins/bundled-contribution-sources.js', { namedExports: {
    bundledContributionSources: () => [{ pluginId: 'example', packageRoot: '/product/content/agent-plugins/example' }],
  } });
  const { toolSearchKeywords, indexedDescriptionFor, stripSearchKeywords } = await import('../tool-search-keywords.js');
  assert.equal(reads, 0, 'import must not read plugin manifests');
  const keywords = toolSearchKeywords({});
  assert.strictEqual(toolSearchKeywords({}), keywords);
  assert.match(keywords.credential_save!, /lazy-provider/);
  for (const metadata of [undefined, {}]) {
    const indexed = indexedDescriptionFor('credential_save', 'Save a credential.', { metadata, includeDoc2query: false });
    assert.match(indexed, /lazy-provider/);
    assert.equal(stripSearchKeywords(indexed), 'Save a credential.');
  }
  assert.equal(reads, 1, 'both indexing paths reuse the same shipped vocabulary');
});

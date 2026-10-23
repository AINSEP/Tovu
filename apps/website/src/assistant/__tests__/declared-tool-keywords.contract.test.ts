import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bundledContributionSources } from '../../features/agent-plugins/bundled-contribution-sources.js';
import { resolveProductRoot } from '../../platform/site-dir/product-root.js';
import { nativeToolMetadata } from '../../contracts/core/tool-metadata/index.js';
import { readBundledToolKeywords, indexedDescriptionFor, stripSearchKeywords } from '../tool-search-keywords.js';

const declaration = (value: unknown) => JSON.stringify({ extensions: { tovu: { toolKeywords: value } } });

test('shipped search data is inert, ordered, optional and independent of activation', () => {
  const files: Record<string, string> = {
    first: declaration({ credential_save: ' example-provider ', external_mcp_save: 'example-mcp' }),
    second: declaration({ credential_save: 'other-provider', fake_tool: 'cannot-register', search_status: 42, search_query: '  ' }),
    null: declaration(null), array: declaration([]), scalar: declaration('bad'), absent: '{}',
    malformed: '{', noContainer: 'null', noExtension: '{"extensions":{}}',
  };
  const seen: string[] = [];
  const keywords = readBundledToolKeywords({ sourceRoot: '/shipped' }, {
    sources: required => {
      assert.deepEqual(required, { sourceRoot: '/shipped', filename: 'plugin.json' });
      return [...Object.keys(files), 'unreadable'].map(pluginId => ({ pluginId, packageRoot: `/shipped/${pluginId}` }));
    },
    readText: file => {
      seen.push(file);
      const value = files[file.split('/').at(-2)!];
      if (value === undefined) throw new Error('missing');
      return value;
    },
  });
  assert.deepEqual({ ...keywords }, { credential_save: 'example-provider other-provider', external_mcp_save: 'example-mcp' });
  assert.equal(seen.length, Object.keys(files).length + 1);
  assert.equal(Object.hasOwn(keywords, 'fake_tool'), false);
  assert.deepEqual({ ...readBundledToolKeywords({ sourceRoot: '/missing' }, { sources: () => { throw new Error('absent'); } }) }, {});
  assert.deepEqual({ ...readBundledToolKeywords({ sourceRoot: '/empty' }, { sources: () => [] }) }, {});
});

test('registered metadata retains its authority and enrichment strips back to authored text', () => {
  const metadata = structuredClone(nativeToolMetadata.byId.credential_save!);
  const before = structuredClone(metadata);
  const description = 'Save a credential securely.';
  const indexed = indexedDescriptionFor('credential_save', description, { metadata, includeDoc2query: false });
  assert.equal(stripSearchKeywords(indexed), description);
  assert.deepEqual(metadata, before, 'enrichment cannot mutate registration or approval policy');
  assert.equal(stripSearchKeywords(indexedDescriptionFor('unknown', description, { metadata: {} })), description);
  assert.equal(indexedDescriptionFor('unknown', description, { metadata: {} }), description);
  const custom = indexedDescriptionFor('credential_save', description, { metadata: { search: { keywords: 'custom-word' } } });
  assert.ok(custom.includes('custom-word'));
  const noSearch = indexedDescriptionFor('credential_save', description, { metadata: {} });
  assert.ok(noSearch.includes('credential'));
});


test('shipped tool words enrich both legacy and registered search without plugin activation', () => {
  const sources = bundledContributionSources({ sourceRoot: path.join(resolveProductRoot(), 'content', 'agent-plugins'), filename: 'plugin.json' });
  let declarations = 0;
  for (const source of sources) {
    const manifest = JSON.parse(readFileSync(path.join(source.packageRoot, 'plugin.json'), 'utf8'));
    for (const [id, words] of Object.entries(manifest.extensions?.tovu?.toolKeywords ?? {})) {
      declarations++;
      assert.equal(typeof words, 'string', `${source.pluginId}: ${id}`);
      assert.ok(Object.hasOwn(nativeToolMetadata.byId, id), `${source.pluginId}: ${id}`);
      const description = 'Authored tool description.';
      for (const options of [{ includeDoc2query: false }, { metadata: nativeToolMetadata.byId[id], includeDoc2query: false }]) {
        const indexed = indexedDescriptionFor(id, description, options);
        for (const word of (words as string).split(' ')) assert.ok(indexed.includes(word), `${source.pluginId}: ${id}: ${word}`);
        assert.equal(stripSearchKeywords(indexed), description);
      }
    }
  }
  assert.ok(declarations > 0, 'the contract must exercise real shipped declarations');
});

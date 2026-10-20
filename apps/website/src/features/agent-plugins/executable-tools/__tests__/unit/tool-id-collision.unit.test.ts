/**
 * @file Why `register.ts`'s `ownersById` cannot lose a tool to an id collision in Tovu.
 * Jini's `pluginToolIdFor` maps `-` to `_`, so plugins `a-b` and `a_b` WOULD produce the same tool
 * id and the owner map would keep only the last one. That pair is unreachable here: an installed
 * plugin's id is its package folder name, and Jini admits only `^[a-z0-9]+(?:[-.][a-z0-9]+)*$`
 * (manifest `name`: `lifecycle/manifest.ts` NAME_PATTERN; installed folders:
 * `lifecycle/installed-package-roots.ts` and `lifecycle/layout.ts`), which has no `_`. These pins
 * hold that guarantee: if the id grammar ever admits `_`, the first test fails and the collision
 * becomes real. Vendor-neutral ids.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAgentPluginManifest } from '@jini-ai/agent-plugins/manifest';
import { pluginToolIdFor } from '@jini-ai/plugins/host';

const manifestNamed = (name: string) => parseAgentPluginManifest({ value: { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name, version: '1.0.0' } });

test('the plugin id grammar refuses an underscore, so no installable id can collide with its hyphenated twin', () => {
  const refused = manifestNamed('acme_office');
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.errors.some((error) => error.startsWith("plugin.json 'name' ('acme_office') must be 1-64 lowercase alphanumeric/hyphen/period characters")));
});

test('the hyphenated twin is admitted, so the refusal above is about the underscore alone', () => {
  assert.equal(manifestNamed('acme-office').ok, true);
});

test('the collision the grammar prevents is real at the id mapping: a-b and a_b share one tool id', () => {
  assert.equal(pluginToolIdFor({ pluginId: 'acme-office', name: 'append_rows' }), 'p_acme_office__append_rows');
  assert.equal(pluginToolIdFor({ pluginId: 'acme_office', name: 'append_rows' }), 'p_acme_office__append_rows');
});

test('distinct admissible plugin ids and tool names give distinct tool ids', () => {
  // Admissible ids differ only in delimiters or where a delimiter falls; tool names may hold `_`.
  const pairs = [
    ['acme-office', 'append_rows'], ['acme.office', 'append_rows'], ['acmeoffice', 'append_rows'],
    ['acme-office-x', 'rows'], ['acme-office', 'x__rows'], ['acme', 'office__append_rows'], ['acme-o', 'ffice__append_rows'],
  ] as const;
  for (const [pluginId] of pairs) assert.equal(manifestNamed(pluginId).ok, true, `${pluginId} is an admissible id`);
  const ids = pairs.map(([pluginId, name]) => pluginToolIdFor({ pluginId, name }));
  assert.equal(new Set(ids).size, pairs.length, ids.join(', '));
});

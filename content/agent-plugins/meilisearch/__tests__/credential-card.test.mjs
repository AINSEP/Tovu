import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';

const card = (target = 'meilisearch') => JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8')).extensions.tovu.credentialCards.find(c => c.target === target);
for (const [target, kind, title, permissions, helpUrl] of [
  ['meilisearch', 'api', 'Connect Meilisearch', /indexes.create.*documents.add.*settings.update.*tasks.get/, undefined],
]) test(`meilisearch/${target}: correct title, destination, key page and minimum access guidance`, () => {
  const value = card(target);
  assert.ok(value);
  assert.equal(value.saveKind, kind);
  assert.equal(value.title, title);
  assert.match(value.keyHint, permissions);
  assert.equal(value.helpUrl, helpUrl);
  assert.ok(value.intro);
});

test('the required server URL field is declared explicitly', () => {
  assert.deepEqual(card().fields, [{ name: 'baseUrl', label: 'Meilisearch server URL', hint: 'The HTTPS URL of your own Cloud or self-hosted Meilisearch server.', required: true }]);
});

test('every credential card parses its task purposes', () => {
  const parsed = parsePluginCredentialCards({ raw: readFileSync(new URL('../plugin.json', import.meta.url), 'utf8') });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.map(({ providerId, usedFor }) => ({ providerId, usedFor })), [
    {
      "providerId": "meilisearch",
      "usedFor": [
        "Keeps a search index of your site's public content",
        "Finds matching public content for your site's visitors"
      ]
    }
  ]);
});

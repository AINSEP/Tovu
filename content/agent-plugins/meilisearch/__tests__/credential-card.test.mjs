import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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

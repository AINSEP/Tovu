import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';

const card = (target = 'composio') => JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8')).extensions.tovu.credentialCards.find(c => c.target === target);
for (const [target, kind, title, permissions, helpUrl] of [
  ['composio', 'oauth', 'Connect Composio', /Browser sign-in only/, undefined],
]) test(`composio/${target}: correct title, destination, key page and minimum access guidance`, () => {
  const value = card(target);
  assert.ok(value);
  assert.equal(value.saveKind, kind);
  assert.equal(value.title, title);
  assert.match(value.keyHint, permissions);
  assert.equal(value.helpUrl, helpUrl);
  assert.ok(value.intro);
});

test('browser sign-in declares permissions', () => {
  assert.ok(card().permissions);
});

test('every credential card parses its task purposes', () => {
  const parsed = parsePluginCredentialCards({ raw: readFileSync(new URL('../plugin.json', import.meta.url), 'utf8') });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.map(({ providerId, usedFor }) => ({ providerId, usedFor })), [
    {
      "providerId": "composio",
      "usedFor": [
        "Finds tools for your other apps",
        "Connects each app with your approval and carries out the tasks you request"
      ]
    }
  ]);
});

import path from 'node:path';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';

// Moved from content/agent-plugins/composio (D-W): the plugin ships as @jini-ai/agent-plugins/composio; this Tovu-bound test reads it from there.
const PLUGIN_ROOT = agentPluginSourceDir({ pluginId: 'composio' });

const card = (target = 'composio') => JSON.parse(readFileSync(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8')).extensions.jini.credentialCards.find(c => c.target === target);
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
  const parsed = parsePluginCredentialCards({ raw: readFileSync(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8') });
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

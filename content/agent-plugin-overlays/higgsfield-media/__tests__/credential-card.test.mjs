import path from 'node:path';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';

// Moved from content/agent-plugins/higgsfield-media (D-W): the plugin ships as @jini-ai/agent-plugins/higgsfield-media; this Tovu-bound test reads it from there.
const PLUGIN_ROOT = agentPluginSourceDir({ pluginId: 'higgsfield-media' });

const card = (target = 'higgsfield-media') => JSON.parse(readFileSync(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8')).extensions.jini.credentialCards.find(c => c.target === target);
for (const [target, kind, title, permissions, helpUrl] of [
  ['higgsfield-media', 'oauth', 'Connect Higgsfield', /Browser sign-in only/, undefined],
]) test(`higgsfield-media/${target}: correct title, destination, key page and minimum access guidance`, () => {
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
      "providerId": "higgsfield-media",
      "usedFor": [
        "Checks available image and video models and generation progress",
        "Generates images and videos using your account's credits"
      ]
    }
  ]);
});

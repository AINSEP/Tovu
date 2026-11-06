import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import path from 'node:path';
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';

// netlify ships from @jini-ai/agent-plugins/netlify: read it where Tovu takes it from.
const PLUGIN_DIR = agentPluginSourceDir({ pluginId: 'netlify' });

const card = (target = 'netlify') => JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8')).extensions.jini.credentialCards.find(c => c.target === target);
for (const [target, kind, title, permissions, helpUrl] of [
  ['netlify', 'publish-host', 'Connect Netlify', /SSO/, 'https://app.netlify.com/user/applications#personal-access-tokens'],
]) test(`netlify/${target}: correct title, destination, key page and minimum access guidance`, () => {
  const value = card(target);
  assert.ok(value);
  assert.equal(value.saveKind, kind);
  assert.equal(value.title, title);
  assert.match(value.keyHint, permissions);
  assert.equal(value.helpUrl, helpUrl);
  assert.ok(value.intro);
});

test('every credential card parses its task purposes', () => {
  const parsed = parsePluginCredentialCards({ raw: readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8') });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.map(({ providerId, usedFor }) => ({ providerId, usedFor })), [
    {
      "providerId": "netlify",
      "usedFor": [
        "Publishes and updates your website on Netlify"
      ]
    }
  ]);
});

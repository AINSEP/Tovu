import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import path from 'node:path';
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';

// vercel ships from @jini-ai/agent-plugins/vercel: read it where Tovu takes it from.
const PLUGIN_DIR = agentPluginSourceDir({ pluginId: 'vercel' });

const card = (target = 'vercel') => JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8')).extensions.jini.credentialCards.find(c => c.target === target);
for (const [target, kind, title, permissions, helpUrl] of [
  ['vercel', 'publish-host', 'Connect Vercel', /team.*scope/i, 'https://vercel.com/account/tokens'],
]) test(`vercel/${target}: correct title, destination, key page and minimum access guidance`, () => {
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
      "providerId": "vercel",
      "usedFor": [
        "Publishes and updates your live website on Vercel",
        "Optional: shares site exports as download links from your Vercel Blob store"
      ]
    }
  ]);
});

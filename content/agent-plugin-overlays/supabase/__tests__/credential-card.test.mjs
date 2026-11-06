import path from 'node:path';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';

// Moved from content/agent-plugins/supabase (D-W): the plugin ships as @jini-ai/agent-plugins/supabase; this Tovu-bound test reads it from there.
const PLUGIN_ROOT = agentPluginSourceDir({ pluginId: 'supabase' });

const card = (target = 'supabase') => JSON.parse(readFileSync(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8')).extensions.jini.credentialCards.find(c => c.target === target);
for (const [target, kind, title, permissions, helpUrl] of [
  ['supabase', 'agent-plugin-token', 'Connect Supabase with an access token', /Management API.*Project Settings.*Database.*Migrations/, 'https://supabase.com/dashboard/account/tokens'],
]) test(`supabase/${target}: correct title, destination, key page and minimum access guidance`, () => {
  const value = card(target);
  assert.ok(value);
  assert.equal(value.saveKind, kind);
  assert.equal(value.title, title);
  assert.match(value.keyHint, permissions);
  assert.equal(value.helpUrl, helpUrl);
  assert.ok(value.intro);
});

test('browser sign-in uses the OAuth save destination', () => {
  assert.equal(card('supabase-sign-in').saveKind, 'oauth');
});

test('every credential card parses its task purposes', () => {
  const parsed = parsePluginCredentialCards({ raw: readFileSync(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8') });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.map(({ providerId, usedFor }) => ({ providerId, usedFor })), [
    {
      "providerId": "supabase-sign-in",
      "usedFor": [
        "Finds your accounts and databases",
        "Reads the selected database",
        "Sets up databases and applies database changes you approve"
      ]
    },
    {
      "providerId": "supabase",
      "usedFor": [
        "Finds your accounts and databases",
        "Reads the selected database",
        "Sets up databases and applies database changes you approve"
      ]
    }
  ]);
});

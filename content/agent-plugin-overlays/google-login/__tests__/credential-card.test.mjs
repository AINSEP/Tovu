import path from 'node:path';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import { buildPluginCredentialForm } from "../../../../apps/website/src/contracts/core/plugin-credential-card.js";
import { readPluginCredentialValues } from "../../../../apps/website/src/features/custom-credentials/plugin-credential-card.js";
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';

// Moved from content/agent-plugins/google-login (D-W5): the plugin ships as @jini-ai/agent-plugins/google-login; this Tovu-bound test reads it from there.
const PLUGIN_ROOT = agentPluginSourceDir({ pluginId: 'google-login' });

const raw = readFileSync(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8');
const preset = JSON.parse(readFileSync(path.join(PLUGIN_ROOT, 'tovu-login-providers.json'), 'utf8')).providers[0];
const workspaceCards = JSON.parse(readFileSync(path.join(agentPluginSourceDir({ pluginId: 'google-workspace' }), 'plugin.json'), 'utf8')).extensions.jini.credentialCards;

test('member OAuth client uses the existing sealed API card and matches the preset credential binding', () => {
  const parsed = parsePluginCredentialCards({ raw });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.descriptors.length, 1);
  const card = parsed.descriptors[0];
  assert.equal(card.providerId, preset.credentialCardTarget);
  assert.equal(card.title, 'Set up Google member login');
  assert.equal(card.saveKind, 'api');
  assert.equal(card.label, preset.credentialLabel);
  assert.equal(card.ownedApiLabel, preset.credentialLabel);
  assert.equal(card.baseUrl, preset.tokenEndpoint);
  assert.deepEqual(card.usedFor, ['Lets members sign in to this site with Google']);
  assert.equal(workspaceCards.some(other => other.label === card.label), false);
  assert.equal(workspaceCards.some(other => other.target === card.providerId), false);
  const form = buildPluginCredentialForm({ card });
  assert.deepEqual(form.fields.map(field => [field.name, field.required, field.secret ?? false]), [
    ['username', true, false], ['token', true, true],
  ]);
  assert.deepEqual(readPluginCredentialValues({ card, values: {
    username: 'fixture-client-id', token: 'fixture-secret', baseUrl: 'https://attacker.invalid',
  } }), {
    label: preset.credentialLabel, category: 'general', baseUrl: preset.tokenEndpoint,
    username: 'fixture-client-id', token: 'fixture-secret',
  });
});

test('missing client ID is rejected by the existing card owner', () => {
  const parsed = parsePluginCredentialCards({ raw });
  assert.equal(parsed.ok, true);
  const card = parsed.descriptors[0];
  assert.throws(() => readPluginCredentialValues({ card, values: { token: 'fixture-secret' } }), /username is required/);
});

test('the card cannot add a new callback or issuer input through API metadata', () => {
  for (const name of ['redirectUri', 'issuer', 'jwksUri']) {
    const manifest = JSON.parse(raw);
    manifest.extensions.jini.credentialCards[0].fields.push({ name, label: name, required: true });
    assert.equal(parsePluginCredentialCards({ raw: JSON.stringify(manifest) }).ok, false);
  }
});

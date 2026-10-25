import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import { buildPluginCredentialForm, readPluginCredentialValues } from '../../../../apps/website/src/features/custom-credentials/plugin-credential-card.ts';

const raw = readFileSync(new URL('../plugin.json', import.meta.url), 'utf8');
const preset = JSON.parse(readFileSync(new URL('../tovu-login-providers.json', import.meta.url), 'utf8')).providers[0];
const workspaceCards = JSON.parse(readFileSync(new URL('../../google-workspace/plugin.json', import.meta.url), 'utf8')).extensions.tovu.credentialCards;

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
    manifest.extensions.tovu.credentialCards[0].fields.push({ name, label: name, required: true });
    assert.equal(parsePluginCredentialCards({ raw: JSON.stringify(manifest) }).ok, false);
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import { buildAgentPluginConnectCard } from '../../../../apps/website/src/features/agent-plugins/connect-card-ui.ts';
import { buildPluginCredentialForm, readPluginCredentialValues } from '../../../../apps/website/src/features/custom-credentials/plugin-credential-card.ts';

const raw = readFileSync(new URL('../plugin.json', import.meta.url), 'utf8');
const skill = readFileSync(new URL('../skills/google-workspace/SKILL.md', import.meta.url), 'utf8');
const connection = JSON.parse(readFileSync(new URL('../tovu-connections.json', import.meta.url), 'utf8')).connections[0];
const products = JSON.parse(readFileSync(new URL('../products.json', import.meta.url), 'utf8'));

test('Google sign-in card matches the existing OAuth connection and its selected-file permission', () => {
  const parsed = parsePluginCredentialCards({ raw });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.descriptors.length, 2);
  const card = parsed.descriptors[0];
  assert.equal(card.providerId, 'google-workspace-sign-in');
  assert.equal(card.title, 'Connect Google Workspace');
  assert.equal(card.label, connection.label);
  assert.equal(card.saveKind, 'oauth');
  assert.equal(card.saveTarget, 'google-workspace');
  assert.equal(card.baseUrl, new URL(connection.authorizationEndpoint).origin);
  assert.deepEqual(products.baseScopes, ['https://www.googleapis.com/auth/drive.file']);
  assert.match(card.permissions, /https:\/\/www.googleapis.com\/auth\/drive.file/);
  assert.match(card.permissions, /only to files you choose or Tovu creates/);
  assert.match(card.permissions, /does not grant access to your whole Drive, Gmail or Calendar/);
  assert.equal(card.fields, undefined, 'Google receives account sign-in, not a token form');
  // Exercise supported rendering metadata directly; the host's API-connection path does not pass it yet.
  const surface = JSON.stringify(buildAgentPluginConnectCard({ pluginId: card.saveTarget, pluginDisplayName: 'Google Workspace', state: 'waiting', signInUrl: 'https://accounts.google.com/test', credentialCard: card }));
  assert.match(surface, /Connect Google Workspace/);
  assert.match(surface, /drive.file/);
});

test('Google own-client card fills the existing client-ID and secret slots without optional or unrelated inputs', () => {
  const parsed = parsePluginCredentialCards({ raw });
  assert.equal(parsed.ok, true);
  const card = parsed.descriptors[1];
  assert.equal(connection.byoClient, true);
  assert.equal(card.providerId, 'google-workspace-oauth-client');
  assert.equal(card.title, 'Use your own Google sign-in app');
  assert.equal(card.saveKind, 'api');
  assert.equal(card.label, `google-workspace/${connection.id} OAuth client`);
  assert.equal(card.ownedApiLabel, card.label, 'the trusted loader requires ownership of the API row');
  assert.equal(card.baseUrl, connection.tokenEndpoint);
  assert.equal(card.helpUrl, 'https://console.cloud.google.com/auth/clients');
  assert.match(card.keyHint, /Web application.*\/api\/agent-plugins\/connections\/oauth\/callback.*Desktop app.*client secret/);
  const form = buildPluginCredentialForm({ card });
  assert.deepEqual(form.fields.map(field => [field.name, field.required, field.secret ?? false]), [['username', true, false], ['token', true, true]]);
  assert.deepEqual(readPluginCredentialValues({ card, values: { username: 'test-client-id', token: 'test-client-secret', baseUrl: 'https://other.invalid' } }), {
    label: card.label, category: 'general', baseUrl: connection.tokenEndpoint, username: 'test-client-id', token: 'test-client-secret',
  });
  assert.throws(() => readPluginCredentialValues({ card, values: { token: 'test-client-secret' } }), /username is required/);
});

test('Google guidance chooses sign-in and keeps the own-client fallback on its own card', () => {
  assert.deepEqual(JSON.parse(readFileSync(new URL('../mcp.json', import.meta.url), 'utf8')).mcpServers, {});
  assert.ok(skill.includes('agent_plugin_connect { pluginId: "google-workspace" }'));
  assert.ok(skill.includes('credential_save { kind: "plugin-provider", target: "google-workspace-oauth-client" }'));
  assert.match(skill, /never ask the person to pick between sign-in and a key/);
  assert.match(skill, /Never offer to replace a working sign-in or saved app unless asked/);
  const reference = readFileSync(new URL('../skills/google-workspace/references/connection.md', import.meta.url), 'utf8');
  assert.ok(reference.includes('target: "google-workspace-oauth-client"'));
  assert.doesNotMatch(reference, /custom_credential_create/);
});

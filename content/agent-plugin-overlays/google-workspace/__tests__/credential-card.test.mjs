import path from 'node:path';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import { buildAgentPluginConnectCard } from '../../../../apps/website/src/features/agent-plugins/connect-card-ui.ts';
import { buildPluginCredentialForm } from "../../../../apps/website/src/contracts/core/plugin-credential-card.js";
import { readPluginCredentialValues } from "../../../../apps/website/src/features/custom-credentials/plugin-credential-card.js";
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';

// Moved from content/agent-plugins/google-workspace (D-W8): the plugin ships as @jini-ai/agent-plugins/google-workspace.
const PLUGIN_ROOT = agentPluginSourceDir({ pluginId: 'google-workspace' });

const raw = readFileSync(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8');
const connection = JSON.parse(readFileSync(path.join(PLUGIN_ROOT, 'tovu-connections.json'), 'utf8')).connections[0];
const products = JSON.parse(readFileSync(path.join(PLUGIN_ROOT, 'products.json'), 'utf8'));

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
  assert.match(card.permissions, /only to files you choose or the application creates/);
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
  assert.deepEqual(JSON.parse(readFileSync(path.join(PLUGIN_ROOT, 'mcp.json'), 'utf8')).mcpServers, {});
  // The Tovu tool names in SKILL.md / connection.md moved to the overlay GUIDANCE.md (D-W8);
  // google-workspace-overlay.test.mjs pins them.
});

test('every credential card parses its task purposes', () => {
  const parsed = parsePluginCredentialCards({ raw: readFileSync(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8') });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.map(({ providerId, usedFor }) => ({ providerId, usedFor })), [
    {
      "providerId": "google-workspace-sign-in",
      "usedFor": [
        "Reads and updates spreadsheets you choose, and creates new ones",
        "Saves your site's form submissions to a spreadsheet"
      ]
    },
    {
      "providerId": "google-workspace-oauth-client",
      "usedFor": [
        "Uses your own Google sign-in app to connect this site to Google Workspace"
      ]
    }
  ]);
});

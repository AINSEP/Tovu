import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAgentPluginConnectionStatuses } from '../../connection-status.js';

test('Agent Plugins shows signed-in state independently of whether a plugin is enabled', async () => {
  const statuses = await loadAgentPluginConnectionStatuses({
    workspaceId: 'ws',
    loadCards: async () => ['signed-in', 'not-signed-in', 'pending', 'expired'].map(pluginId => ({
      pluginId, saveKind: 'oauth' as const, providerId: pluginId, label: pluginId,
      category: 'api', baseUrl: 'https://example.test', title: 'Connect',
    })),
    mcp: { listByWorkspaceId: async () => [
      { provisionedByPluginId: 'signed-in', authMode: 'oauth', oauthStatus: 'connected', sealedOAuth: null },
      { provisionedByPluginId: 'pending', authMode: 'oauth', oauthStatus: 'pending', sealedOAuth: null },
      { provisionedByPluginId: 'expired', authMode: 'oauth', oauthStatus: 'needs_reauth', sealedOAuth: null },
      { provisionedByPluginId: 'local-tools', authMode: 'none', oauthStatus: null, sealedOAuth: null },
    ] },
  });
  assert.deepEqual(Object.fromEntries(statuses), {
    'signed-in': 'connected', 'not-signed-in': 'disconnected', pending: 'pending', expired: 'needs_reauth',
  });
});

test('all declared plugin connections must be signed in, and unrelated manual servers never confer status', async () => {
  const statuses = await loadAgentPluginConnectionStatuses({ workspaceId: 'ws', mcp: { listByWorkspaceId: async () => [
    { provisionedByPluginId: 'multiple', authMode: 'oauth', oauthStatus: 'connected', sealedOAuth: null },
    { provisionedByPluginId: 'multiple', authMode: 'oauth', oauthStatus: 'disconnected', sealedOAuth: null },
    { provisionedByPluginId: null, authMode: 'oauth', oauthStatus: 'connected', sealedOAuth: null },
  ] } });
  assert.deepEqual(Object.fromEntries(statuses), { multiple: 'disconnected' });
});

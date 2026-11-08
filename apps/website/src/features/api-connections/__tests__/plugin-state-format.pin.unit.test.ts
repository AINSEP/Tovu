/** Saved plugin-state identity is a compatibility contract across the extraction. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AesGcmSecretSealer } from '@jini-ai/platform/secrets';
import { InMemoryKeyring } from '@jini-ai/platform/secrets/testing';
import { InMemoryVaultRepo } from '@jini-ai/platform/secrets/credential-sets';
import { createAgentPluginStateStore } from '../plugin-state.js';
import { API_CONNECTION_VAULT_KIND, PLUGIN_STATE_FORMAT, apiConnectionVaultScope, createApiConnectionVault } from '../vault-stores.js';

test('A3 pin: real state store preserves the format, vault scope, row id and label', async () => {
  const workspaceId = 'workspace-pin';
  assert.equal(PLUGIN_STATE_FORMAT, 'agent-plugin-state');
  assert.deepEqual(apiConnectionVaultScope({ workspaceId }), { workspaceId, kind: API_CONNECTION_VAULT_KIND, ownerKey: 'tovu', principalId: null, binding: null });
  assert.equal(API_CONNECTION_VAULT_KIND, 'api-connection');
  const keyring = new InMemoryKeyring({ hkdfSalt: 'extract-s3-format-pin' });
  const vault = createApiConnectionVault({ workspaceId, repo: new InMemoryVaultRepo({}), keyring,
    sealer: new AesGcmSecretSealer({ keyring }), clock: { nowMs: () => 1000 } });
  const store = createAgentPluginStateStore({ vault, workspaceId });
  await store.forPlugin({ workspaceId, pluginId: 'acme-office' }).set({ key: 'products', value: ['files'] });
  const rows = await vault.list(apiConnectionVaultScope({ workspaceId }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.id, 'plugin-state:acme-office:products');
  assert.equal(rows[0]!.label, 'Plugin settings plugin-state:acme-office:products');
  assert.equal(rows[0]!.meta.credentialFormat, 'agent-plugin-state');
  assert.deepEqual(await store.readerFor({ workspaceId, pluginId: 'acme-office' }).get({ key: 'products' }), ['files']);
});

/** Row 14: the real host's state and API records share one vault instance and CAS scope. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AesGcmSecretSealer } from '@jini-ai/platform/secrets';
import { InMemoryKeyring } from '@jini-ai/platform/secrets/testing';
import { InMemoryVaultRepo, SecretsVaultService } from '@jini-ai/platform/secrets/credential-sets';
import { deriveApiConnectionKey, type ApiConnectionRecord } from '@jini-ai/integrations/api-connections';
import { InMemoryCustomCredentialSetRepo } from '../../../../features/custom-credentials/index.js';
import { createApiConnectionHost } from '../../../../features/api-connections/host.js';
import { apiConnectionVaultScope, PLUGIN_STATE_FORMAT } from '../../../../features/api-connections/vault-stores.js';

test('A4 row 14: actual state/API writes use one vault, saved scope/format and revision CAS', async () => {
  const seen = new Set<SecretsVaultService>();
  const proto = SecretsVaultService.prototype;
  const original = { put: proto.put, get: proto.get, list: proto.list };
  proto.put = function(this: SecretsVaultService, ...args: Parameters<typeof original.put>) { seen.add(this); return original.put.apply(this, args); };
  proto.get = function(this: SecretsVaultService, ...args: Parameters<typeof original.get>) { seen.add(this); return original.get.apply(this, args); };
  proto.list = function(this: SecretsVaultService, ...args: Parameters<typeof original.list>) { seen.add(this); return original.list.apply(this, args); };
  try {
    const workspaceId = 'one-vault';
    const repo = new InMemoryVaultRepo({});
    const keyring = new InMemoryKeyring({ hkdfSalt: 'extract-s3-one-vault' });
    const host = createApiConnectionHost({ workspaceId, vaultRepo: repo, keyring, sealer: new AesGcmSecretSealer({ keyring }),
      customCredentialRepo: new InMemoryCustomCredentialSetRepo(), clock: { nowMs: () => 1000 },
      loadContributions: async () => ({ items: [], refusals: [] }), runtime: 'hosted', env: {}, publicOrigin: () => undefined,
      oauthHttp: { fetchFn: async () => { throw new Error('No OAuth I/O in state proof'); }, guard: { assertSafeUrl: ({ raw }) => new URL(raw) } },
      pluginHttp: { fetch: async () => { throw new Error('No plugin HTTP in state proof'); } },
    });
    const scope = { workspaceId, pluginId: 'acme-office' };
    const state = host.pluginState.forPlugin(scope);
    await state.set({ key: 'products', value: ['files'] });
    await state.set({ key: 'products', value: ['files', 'mail'] });
    assert.deepEqual(await host.pluginState.readerFor(scope).get({ key: 'products' }), ['files', 'mail']);
    const key = deriveApiConnectionKey({ workspaceId, pluginId: scope.pluginId, connectionId: 'account' });
    const record: ApiConnectionRecord = { key, workspaceId, pluginId: scope.pluginId, connectionId: 'account', status: 'disconnected',
      revision: 0, generation: 0, account: null, grantedScopes: [], staged: null, revocationFailure: null, updatedAt: '1970-01-01T00:00:01.000Z' };
    assert.equal(await host.records.compareAndSet({ key, expectedRevision: 0, record }), true);
    assert.equal(await host.records.compareAndSet({ key, expectedRevision: 0, record }), false);
    assert.equal((await host.records.read({ key }))?.revision, 1);
    assert.equal(seen.size, 1);
    const rows = await repo.list(apiConnectionVaultScope({ workspaceId }));
    assert.equal(rows.length, 2);
    const saved = rows.find(row => row.id === 'plugin-state:acme-office:products')!;
    assert.equal(saved.label, 'Plugin settings plugin-state:acme-office:products');
    assert.equal(saved.meta.credentialFormat, 'agent-plugin-state');
    assert.equal(PLUGIN_STATE_FORMAT, 'agent-plugin-state');
    assert.equal(saved.revision, 2);
    for (const row of rows) assert.deepEqual({ workspaceId: row.workspaceId, kind: row.kind, ownerKey: row.ownerKey, principalId: row.principalId, binding: row.binding },
      { workspaceId, kind: 'api-connection', ownerKey: 'tovu', principalId: null, binding: null });
  } finally {
    Object.assign(proto, original);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryVaultRepo } from '@jini-ai/platform/secrets/credential-sets';
import { createApiConnectionVault } from '../../api-connections/vault-stores.js';
import { createSiteKeyReferences } from '../site-references.js';

test('site reference stores only credentialId and removal touches only that reference', async () => {
  const repo = new InMemoryVaultRepo({});
  const payloads: string[] = [];
  const vault = createApiConnectionVault({ repo, workspaceId: 'workspace-local', clock: { nowMs: () => 0 },
    keyring: { activeKey: async () => ({ keyId: 'site-key' }), derive: async () => new Uint8Array(), deriveSigningSecret: async () => new Uint8Array() },
    sealer: { seal: async ({ plaintext }) => { payloads.push(plaintext); return { keyId: 'site-key', alg: 'fixture', nonce: '', ciphertext: plaintext }; },
      open: async ({ sealed }) => sealed.ciphertext } });
  const refs = createSiteKeyReferences({ vault, repo, workspaceId: 'workspace-local' });
  await refs.set({ credentialId: 'owner-key-1' });
  assert.deepEqual(JSON.parse(payloads[0]!), { value: { credentialId: 'owner-key-1' } });
  assert.equal(await refs.has({ credentialId: 'owner-key-1' }), true);
  assert.equal(await refs.has({ credentialId: 'other-key' }), false);
  await refs.remove({ credentialId: 'owner-key-1' });
  assert.equal(await refs.has({ credentialId: 'owner-key-1' }), false);
});

test('OAuth consumer bindings are selected-row references without tokens or authority', async () => {
  const { createSiteOAuthBindings } = await import('../site-references.js');
  const repo = new InMemoryVaultRepo({});
  const payloads: string[] = [];
  const vault = createApiConnectionVault({ repo, workspaceId: 'workspace-local', clock: { nowMs: () => 0 },
    keyring: { activeKey: async () => ({ keyId: 'site-key' }), derive: async () => new Uint8Array(), deriveSigningSecret: async () => new Uint8Array() },
    sealer: { seal: async ({ plaintext }) => { payloads.push(plaintext); return { keyId: 'site-key', alg: 'fixture', nonce: '', ciphertext: plaintext }; },
      open: async ({ sealed }) => sealed.ciphertext } });
  const bindings = createSiteOAuthBindings({ vault, repo, workspaceId: 'workspace-local' });
  assert.equal(await bindings.read({ consumerId: 'mcp:server-a' }), null);
  await bindings.set({ consumerId: 'mcp:server-a', credentialId: 'owner-key' });
  await bindings.set({ consumerId: 'mcp:server-b', credentialId: 'other-owner-key' });
  assert.deepEqual(JSON.parse(payloads[0]!), { value: { credentialId: 'owner-key' } });
  assert.deepEqual(await bindings.read({ consumerId: 'mcp:server-a' }), { credentialId: 'owner-key' });
  await bindings.remove({ consumerId: 'mcp:server-a' });
  assert.equal(await bindings.read({ consumerId: 'mcp:server-a' }), null);
  assert.deepEqual(await bindings.read({ consumerId: 'mcp:server-b' }), { credentialId: 'other-owner-key' });
  await assert.rejects(bindings.set({ consumerId: '', credentialId: 'owner-key' }));
  await assert.rejects(bindings.set({ consumerId: 'mcp:server', credentialId: 'x'.repeat(513) }));
});

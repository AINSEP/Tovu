/** @file Real PostgreSQL site bindings remain token-free and confer no owner authority. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { AesGcmSecretSealer } from '@jini-ai/platform/secrets';
import { InMemoryKeyring } from '@jini-ai/platform/secrets/testing';
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from '@jini-ai/db/secrets-vault';
import { createSharedOAuthConsumer, type SharedOAuthConnection } from '@jini-ai/integrations/api-connections';
import { freshPostgresContentDatabase, dropDatabase } from '../../../platform/db/__tests__/postgres-database.js';
import { openPostgresKernel } from '../../../platform/db/kernel/drivers/postgres.js';
import { createSiteOAuthBindings } from '../../project-keys/site-references.js';
import { apiConnectionVaultScope, createApiConnectionVault } from '../vault-stores.js';

const DATABASE = 'tovu_shared_oauth_binding_fixture';

test('PostgreSQL persists only the consumer reference across pools; a copied reference cannot grant access', async t => {
  const connectionString = freshPostgresContentDatabase(DATABASE);
  const first = openPostgresKernel<SecretsVaultDatabase>({ connectionString });
  const second = openPostgresKernel<SecretsVaultDatabase>({ connectionString });
  t.after(async () => { await second.close(); await first.close(); dropDatabase({ database: DATABASE }); });
  const workspaceId = 'workspace-local';
  await first.execute(sql`INSERT INTO workspaces(id,name,slug,created_at) VALUES(${workspaceId},'Site','site','2026-11-05T00:00:00Z')`);
  const keyring = new InMemoryKeyring({ hkdfSalt: 'postgres-shared-binding-fixture' });
  const make = (kernel: typeof first) => {
    const repo = new SqlSecretsVaultRepo({ kernel });
    const vault = createApiConnectionVault({ repo, keyring, sealer: new AesGcmSecretSealer({ keyring }), clock: { nowMs: () => Date.now() }, workspaceId });
    return { repo, vault, bindings: createSiteOAuthBindings({ repo, vault, workspaceId }) };
  };
  const a = make(first); const b = make(second);
  await a.bindings.set({ consumerId: 'plugin-api-account', credentialId: 'owner-account-reference' });
  assert.deepEqual(await b.bindings.read({ consumerId: 'plugin-api-account' }), { credentialId: 'owner-account-reference' });
  const rows = await a.vault.list(apiConnectionVaultScope({ workspaceId }));
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.id, /^plugin-state:tovu-shared-oauth-binding:/);
  const stored = await a.vault.get({ ...apiConnectionVaultScope({ workspaceId }), id: rows[0]!.id });
  assert.deepEqual(stored!.payload, { value: { credentialId: 'owner-account-reference' } });
  const connection: SharedOAuthConnection = { credentialId: 'owner-account-reference', identity: { pluginId: 'fixture', connectionId: 'account',
    tokenEndpoint: 'https://issuer.example/token', clientId: 'original-client' }, generation: 1, status: 'connected', account: null, grantedScopes: ['read'] };
  let granted = false;
  let acquisitions = 0;
  const consumer = createSharedOAuthConsumer({ bindings: { read: input => b.bindings.read(input) }, grants: { isGranted: async () => granted },
    connections: { read: async () => connection, getAccessToken: async () => { acquisitions++; return 'owner-access-token-fixture'; } } });
  const target = { siteId: 'immutable-site-uuid', consumerId: 'plugin-api-account', identity: connection.identity, requiredScopes: ['read'] };
  await assert.rejects(consumer.getAccessToken(target), { code: 'access-denied' });
  assert.equal(acquisitions, 0);
  granted = true;
  assert.equal(await consumer.getAccessToken(target), 'owner-access-token-fixture');
  await b.bindings.remove({ consumerId: 'plugin-api-account' });
  assert.equal(await a.bindings.read({ consumerId: 'plugin-api-account' }), null);
  await assert.rejects(consumer.getAccessToken(target), { code: 'access-denied' });
  assert.equal(acquisitions, 1);
});

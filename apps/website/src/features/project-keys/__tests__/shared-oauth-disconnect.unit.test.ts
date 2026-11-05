import assert from 'node:assert/strict';
import test from 'node:test';
import type { ApiConnectionRecord } from '@jini-ai/integrations/api-connections';
import type { SharedOAuthOwnerStorage, SharedOAuthIssuingContext } from '../../api-connections/shared-owner.js';
import { disconnectSharedOAuth, inspectSharedOAuthDisconnect } from '../shared-oauth-disconnect.js';
import { fakeAttachments } from './helpers.js';

async function fixture() {
  const credentialId = 'owner-oauth';
  let record: ApiConnectionRecord = { key: credentialId, workspaceId: 'project', pluginId: 'mail', connectionId: 'account', status: 'connected', revision: 1,
    generation: 1, account: { accountId: 'person', displayName: 'Person' }, grantedScopes: ['read'], staged: null, revocationFailure: null, updatedAt: '2026-01-01' };
  const context: SharedOAuthIssuingContext = { credentialId, identity: { pluginId: 'mail', connectionId: 'account', tokenEndpoint: 'https://auth.example/token', clientId: 'issuing-client' },
    client: { clientId: 'issuing-client', authMethod: 'none' }, clientKind: 'public', descriptor: { pluginId: 'mail', connectionId: 'account', label: 'Mail',
      authorizationEndpoint: 'https://auth.example/authorize', tokenEndpoint: 'https://auth.example/token', authorizationParams: { public: {}, confidential: {} },
      forceConsentParams: {}, startParams: [], callbackFields: [] } };
  let inTransaction = false;
  let credentialPresent = true;
  const tokens = { accessToken: 'private-access', refreshToken: 'private-refresh', tokenType: 'Bearer' as const, scopes: ['read'], expiresAt: null };
  const attachments = fakeAttachments();
  await attachments.attach({ siteId: 'a', siteName: 'A', keyId: credentialId });
  await attachments.attach({ siteId: 'b', siteName: 'B', keyId: credentialId });
  const removeKey = attachments.removeKey;
  attachments.removeKey = async input => { assert.equal(inTransaction, true); assert.equal(record.status, 'revocation-pending'); return removeKey(input); };
  const storage = { readContext: async () => context, records: { read: async () => record,
    compareAndSet: async ({ expectedRevision, record: next }: { expectedRevision: number; record: ApiConnectionRecord }) => {
      if (record.revision !== expectedRevision) return false;
      record = next; return true;
    } }, tokensFor: () => ({ loadForRevocation: async ({ key }: { key: string }) => key === credentialId && credentialPresent ? tokens : null,
      delete: async () => { credentialPresent = false; } }) } as unknown as SharedOAuthOwnerStorage;
  const required = { storage, attachments, credentialId, clock: { nowMs: () => 0 },
    transaction: async <T>({ run }: { run: () => Promise<T> }) => { inTransaction = true; try { return await run(); } finally { inTransaction = false; } } };
  return { required, record: () => record, credentialPresent: () => credentialPresent, inTransaction: () => inTransaction };
}

test('global disconnect stops generation and removes A/B grants before provider; failed revoke stays retryable', async () => {
  const f = await fixture();
  const { report } = await inspectSharedOAuthDisconnect(f.required);
  assert.deepEqual(report.sites, ['A', 'B']);
  let calls = 0;
  const result = await disconnectSharedOAuth({ ...f.required, expectedRevision: report.revision, expectedDigest: report.sourceDigest }, { revoke: async () => {
    calls++;
    assert.equal(f.inTransaction(), false);
    assert.equal(f.record().status, 'revocation-pending');
    assert.equal(f.record().generation, 2);
    assert.deepEqual(await f.required.attachments.usersOf({ keyId: f.required.credentialId }), []);
    throw new Error('provider-private-error');
  } });
  assert.equal(calls, 1);
  assert.equal(result.applied, true);
  assert.equal(result.remoteRevocation, 'pending');
  assert.equal(f.record().status, 'revocation-pending');
  assert.equal(f.credentialPresent(), true);
  assert.equal(JSON.stringify(result).includes('private'), false);
  const next = await inspectSharedOAuthDisconnect(f.required);
  const retried = await disconnectSharedOAuth({ ...f.required, expectedRevision: next.report.revision, expectedDigest: next.report.sourceDigest }, { revoke: async () => {} });
  assert.equal(retried.remoteRevocation, 'confirmed');
  assert.equal(f.record().generation, 2, 'retry does not recreate or advance a credential');
  assert.equal(f.record().status, 'disconnected');
  assert.equal(f.credentialPresent(), false);
});

test('a changed grant set after confirmation leaves every credential and grant untouched', async () => {
  const f = await fixture();
  const { report } = await inspectSharedOAuthDisconnect(f.required);
  await f.required.attachments.attach({ siteId: 'c', siteName: 'C', keyId: f.required.credentialId });
  await assert.rejects(disconnectSharedOAuth({ ...f.required, expectedRevision: report.revision, expectedDigest: report.sourceDigest }), /changed/);
  assert.equal(f.record().status, 'connected');
  assert.equal(f.record().generation, 1);
  assert.equal((await f.required.attachments.usersOf({ keyId: f.required.credentialId })).length, 3);
});

test('without a provider hook local access stops and remote revocation remains explicitly pending', async () => {
  const f = await fixture();
  const { report } = await inspectSharedOAuthDisconnect(f.required);
  const result = await disconnectSharedOAuth({ ...f.required, expectedRevision: report.revision, expectedDigest: report.sourceDigest });
  assert.equal(result.remoteRevocation, 'pending');
  assert.equal(f.record().status, 'revocation-pending');
  assert.equal(f.credentialPresent(), true);
});

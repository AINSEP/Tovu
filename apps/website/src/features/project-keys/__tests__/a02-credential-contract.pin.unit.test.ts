// A02 first pin: the credential/OAuth contract seams that the type-edge move must not change.
// (1) a site's grant check gates every vault read, and the read goes to the caller's workspace;
// (2) an ungranted site never reaches the owner vault at all (M-unscoped-vault-reader goes red here);
// (3) a shared-owner OAuth disconnect, driven through the explicit SharedOAuthDisconnectStorage
//     contract, touches only the addressed owner's record, tokens and grants.
// All credential values below are fake placeholders; no assertion message echoes a token.
import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryVaultRepo } from '@jini-ai/platform/secrets/credential-sets';
import type { ApiConnectionRecord } from '@jini-ai/integrations/api-connections';
import { attachedOnlyVault } from '@jini-ai/user-management/project-keys/attached-vault';
import { disconnectSharedOAuth, inspectSharedOAuthDisconnect } from '../shared-oauth-disconnect.js';
import type { SharedOAuthDisconnectContext, SharedOAuthDisconnectStorage } from '@jini-ai/user-management/project-keys/shared-oauth-disconnect';
import { fakeAttachments, vaultRow } from './helpers.js';
import { attachedVaultPolicy } from "#src/features/project-keys/vault-policy";

const PROJECT = 'project';
const OTHER = 'other-workspace';

async function grantedVaultFixture() {
  const vault = new InMemoryVaultRepo({});
  await vault.put({ record: { ...vaultRow({ id: 'key-a' }), label: 'Project copy' }, expectedRevision: null });
  await vault.put({ record: { ...vaultRow({ id: 'key-a' }), workspaceId: OTHER, label: 'Other workspace copy' }, expectedRevision: null });
  const attachments = fakeAttachments();
  const grantChecks: Array<{ siteId: string; keyId: string }> = [];
  const isAttached = attachments.isAttached.bind(attachments);
  attachments.isAttached = async input => { grantChecks.push({ ...input }); return isAttached(input); };
  // Label resolution deliberately ignores grants so a stale label must still be stopped by the per-read grant check.
  attachments.keyForLabel = async ({ label }) => (label === 'Production' ? 'key-a' : null);
  return { vault, attachments, grantChecks };
}

test('A02 pin: a granted lookup checks the grant for this site and reads only the caller workspace', async t => {
  const f = await grantedVaultFixture();
  await f.attachments.attach({ siteId: 'site-granted', siteName: 'Granted', keyId: 'key-a' });
  const reads = t.mock.method(f.vault, 'find');
  const view = attachedOnlyVault({ vault: f.vault, siteId: 'site-granted', attachments: f.attachments, policy: attachedVaultPolicy });

  assert.equal((await view.find({ workspaceId: PROJECT, id: 'key-a' }))?.label, 'Project copy');
  assert.equal((await view.find({ workspaceId: OTHER, id: 'key-a' }))?.label, 'Other workspace copy');
  assert.equal((await view.findByLabel!({ workspaceId: PROJECT, label: 'Production' }))?.label, 'Project copy');
  assert.deepEqual((await view.list({ workspaceId: PROJECT, kind: 'vendor', ownerKey: 'tovu', principalId: null, provider: 'host' }))
    .map(row => [row.workspaceId, row.label]), [[PROJECT, 'Project copy']]);

  assert.deepEqual(reads.mock.calls.map(call => call.arguments[0]), [
    { workspaceId: PROJECT, id: 'key-a' }, { workspaceId: OTHER, id: 'key-a' },
    { workspaceId: PROJECT, id: 'key-a' }, { workspaceId: PROJECT, id: 'key-a' },
  ], 'every vault read carries the workspace the caller asked for, never a default');
  assert.deepEqual(f.grantChecks, Array.from({ length: 4 }, () => ({ siteId: 'site-granted', keyId: 'key-a' })),
    'each read is preceded by a grant check for the bound site and the requested key');
});

test('A02 pin: an ungranted site never reads the owner vault, even through a stale label', async t => {
  const f = await grantedVaultFixture();
  await f.attachments.attach({ siteId: 'site-granted', siteName: 'Granted', keyId: 'key-a' });
  const reads = t.mock.method(f.vault, 'find');
  const lists = t.mock.method(f.vault, 'list');
  const view = attachedOnlyVault({ vault: f.vault, siteId: 'site-ungranted', attachments: f.attachments, policy: attachedVaultPolicy });
  const query = { workspaceId: PROJECT, kind: 'vendor' as const, ownerKey: 'tovu', principalId: null, provider: 'host' };

  assert.equal(await view.find({ workspaceId: PROJECT, id: 'key-a' }), null);
  assert.equal(await view.findByLabel!({ workspaceId: PROJECT, label: 'Production' }), null);
  assert.deepEqual(await view.list(query), []);
  assert.equal(await view.findOne!(query), null);
  assert.equal(await view.findDefault!(query), null);

  assert.equal(reads.mock.callCount(), 0, 'no owner-vault read for a site without a grant');
  assert.equal(lists.mock.callCount(), 0, 'inventory never lists the owner vault');
  assert.deepEqual(f.grantChecks, [{ siteId: 'site-ungranted', keyId: 'key-a' }, { siteId: 'site-ungranted', keyId: 'key-a' }]);
});

type DisconnectRecords = SharedOAuthDisconnectStorage['records'];
type DisconnectTokens = ReturnType<SharedOAuthDisconnectStorage['tokensFor']>;
type FakeTokens = { accessToken: string; refreshToken: string; tokenType: 'Bearer'; scopes: string[]; expiresAt: null };

function ownerContext(credentialId: string, connectionId: string): SharedOAuthDisconnectContext {
  return { identity: { pluginId: 'mail', connectionId }, descriptor: { pluginId: 'mail', connectionId, label: `Mail ${connectionId}`,
    authorizationEndpoint: 'https://auth.example/authorize', tokenEndpoint: 'https://auth.example/token',
    authorizationParams: { public: {}, confidential: {} }, forceConsentParams: {}, startParams: [], callbackFields: [] } as SharedOAuthDisconnectContext['descriptor'] };
}

function ownerRecord(key: string, connectionId: string): ApiConnectionRecord {
  return { key, workspaceId: PROJECT, pluginId: 'mail', connectionId, status: 'connected', revision: 1, generation: 1,
    account: { accountId: `person-${connectionId}`, displayName: 'Person' }, grantedScopes: ['read'], staged: null, revocationFailure: null, updatedAt: '2026-01-01' };
}

/** Two shared owners behind one explicit disconnect-storage contract; every key the seam touches is logged. */
async function twoOwnerFixture() {
  const owners = { a: 'owner-a-oauth', b: 'owner-b-oauth' };
  const contexts = new Map([[owners.a, ownerContext(owners.a, 'account-a')], [owners.b, ownerContext(owners.b, 'account-b')]]);
  const records = new Map([[owners.a, ownerRecord(owners.a, 'account-a')], [owners.b, ownerRecord(owners.b, 'account-b')]]);
  const tokens = new Map<string, FakeTokens>([
    [owners.a, { accessToken: 'fake-access-a', refreshToken: 'fake-refresh-a', tokenType: 'Bearer', scopes: ['read'], expiresAt: null }],
    [owners.b, { accessToken: 'fake-access-b', refreshToken: 'fake-refresh-b', tokenType: 'Bearer', scopes: ['read'], expiresAt: null }],
  ]);
  const touched: string[] = [];
  const recordStore = {
    read: async ({ key }: { key: string }) => { touched.push(`record.read:${key}`); return records.get(key) ?? null; },
    compareAndSet: async ({ key, expectedRevision, record }: { key: string; expectedRevision: number; record: ApiConnectionRecord }) => {
      touched.push(`record.cas:${key}`);
      if (records.get(key)?.revision !== expectedRevision) return false;
      records.set(key, record); return true;
    },
  } as unknown as DisconnectRecords;
  const storage: SharedOAuthDisconnectStorage = {
    readContext: async ({ credentialId }) => { touched.push(`context:${credentialId}`); return contexts.get(credentialId) ?? null; },
    records: recordStore,
    tokensFor: ({ context }) => {
      touched.push(`tokensFor:${context.identity.connectionId}`);
      return { loadForRevocation: async ({ key }: { key: string }) => { touched.push(`tokens.load:${key}`); return tokens.get(key) ?? null; },
        delete: async ({ key }: { key: string }) => { touched.push(`tokens.delete:${key}`); tokens.delete(key); } } as unknown as DisconnectTokens;
    },
  };
  const attachments = fakeAttachments();
  await attachments.attach({ siteId: 'site-1', siteName: 'One', keyId: owners.a });
  await attachments.attach({ siteId: 'site-1', siteName: 'One', keyId: owners.b });
  await attachments.attach({ siteId: 'site-2', siteName: 'Two', keyId: owners.b });
  const required = { storage, attachments, clock: { nowMs: () => 0 },
    transaction: async <T>({ run }: { run: () => Promise<T> }) => run() };
  return { owners, records, tokens, touched, required };
}

test('A02 pin: a shared-owner disconnect through the explicit storage contract affects only the addressed owner', async () => {
  const f = await twoOwnerFixture();
  const before = structuredClone(f.records.get(f.owners.b));
  const { report } = await inspectSharedOAuthDisconnect({ ...f.required, credentialId: f.owners.a });
  assert.deepEqual(report.sites, ['One']);
  const revoked: string[] = [];
  const result = await disconnectSharedOAuth({ ...f.required, credentialId: f.owners.a, expectedRevision: report.revision, expectedDigest: report.sourceDigest },
    { revoke: async () => { revoked.push('a'); } });

  assert.equal(result.applied, true);
  assert.equal(result.remoteRevocation, 'confirmed');
  assert.deepEqual(revoked, ['a']);
  assert.equal(f.records.get(f.owners.a)?.status, 'disconnected');
  assert.equal(f.tokens.has(f.owners.a), false, 'the addressed owner tokens are removed');
  assert.deepEqual(await f.required.attachments.usersOf({ keyId: f.owners.a }), []);

  assert.deepEqual(f.records.get(f.owners.b), before, 'the other owner record is untouched');
  assert.equal(f.tokens.has(f.owners.b), true, 'the other owner tokens remain');
  assert.deepEqual((await f.required.attachments.usersOf({ keyId: f.owners.b })).map(site => site.siteId), ['site-1', 'site-2']);
  assert.deepEqual(await f.required.attachments.keysFor({ siteId: 'site-1' }), [f.owners.b]);
  assert.equal(f.touched.some(entry => entry.includes(f.owners.b) || entry.endsWith('account-b')), false,
    `the seam only addressed owner A: ${f.touched.join(', ')}`);
  assert.ok(f.touched.includes('tokensFor:account-a'), 'tokens are bound to the context the storage returned for owner A');
});

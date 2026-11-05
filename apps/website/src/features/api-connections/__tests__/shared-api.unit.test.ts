import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InMemoryVaultRepo } from '@jini-ai/platform/secrets/credential-sets';
import { AesGcmSecretSealer } from '@jini-ai/platform/secrets';
import { InMemoryKeyring } from '@jini-ai/platform/secrets/testing';
import { deriveApiConnectionKey } from '@jini-ai/integrations/api-connections';
import type { KeyAttachments } from '../../project-keys/attachments.js';
import { createSiteOAuthBindings } from '../../project-keys/site-references.js';
import { createSharedOAuthOwnerStorage } from '../shared-owner.js';
import { createApiConnectionVault } from '../vault-stores.js';
import { startAcmeHarness, ACME_PLUGIN } from './support/acme-harness.js';

function attachmentStore(): KeyAttachments {
  const grants = new Set<string>();
  const id = ({ siteId, keyId }: { siteId: string; keyId: string }) => `${siteId}:${keyId}`;
  return { keysFor: async () => [], usersOf: async () => [], renameSite: async () => {},
    attach: async input => { grants.add(id(input)); }, detach: async input => { grants.delete(id(input)); },
    isAttached: async input => grants.has(id(input)), removeKey: async ({ keyId }) => { for (const grant of grants) if (grant.endsWith(`:${keyId}`)) grants.delete(grant); } };
}

test('one explicit owner sign-in serves two granted site UUIDs; guessed binding and detach refuse without local fallback', async t => {
  const h = await startAcmeHarness();
  t.after(() => h.close());
  const clock = { nowMs: () => Date.now() };
  const ownerRepo = new InMemoryVaultRepo({});
  const keyring = new InMemoryKeyring({ hkdfSalt: 'shared-owner-fixture' });
  const storage = createSharedOAuthOwnerStorage({ scope: { workspaceId: 'project', repo: ownerRepo, keyring, sealer: new AesGcmSecretSealer({ keyring }) }, clock });
  const attachments = attachmentStore();
  const make = (siteId: string) => {
    const repo = new InMemoryVaultRepo({});
    const siteKeyring = new InMemoryKeyring({ hkdfSalt: `site-${siteId}` });
    const bindings = createSiteOAuthBindings({ workspaceId: 'workspace-local', repo, vault: createApiConnectionVault({ repo, keyring: siteKeyring,
      sealer: new AesGcmSecretSealer({ keyring: siteKeyring }), clock, workspaceId: 'workspace-local' }) });
    const host = h.makeHost({ runtime: 'desktop', workspaceId: 'workspace-local', vaultRepo: repo, keyring: siteKeyring,
      shared: { storage, bindings, attachments, siteId, siteName: siteId, ownerPrincipalId: Promise.resolve('owner'), transaction: async ({ run }) => run() } });
    return { host, repo, bindings };
  };
  const a = make('site-a'); const b = make('site-b'); const c = make('site-c');
  const connection = (await a.host.listConnections({ pluginId: ACME_PLUGIN }))[0]!;
  const redirectUri = 'http://127.0.0.1:1/callback';
  await assert.rejects(a.host.prepareSignIn({ connection, actorId: 'other', destination: 'shared', redirectUri }), { code: 'connection-not-found' });
  const target = await a.host.prepareSignIn({ connection, actorId: 'owner', destination: 'shared', redirectUri });
  const start = await target.service.start({ workspaceId: target.workspaceId, actorId: 'owner', intent: 'connect', scopeSetIds: [], redirectUri });
  const back = h.consentRedirect(start.authorizationUrl);
  await target.service.complete({ workspaceId: target.workspaceId, actorId: 'owner', redirectUri, callbackParams: Object.fromEntries(back.searchParams), browserBinding: start.browserBinding });
  await target.onCompleted();
  const credentialId = deriveApiConnectionKey({ workspaceId: 'project', pluginId: ACME_PLUGIN, connectionId: connection.descriptor.connectionId });
  const consumerId = deriveApiConnectionKey({ workspaceId: 'workspace-local', pluginId: ACME_PLUGIN, connectionId: connection.descriptor.connectionId });
  await b.host.sharedOAuth!.bind({ keyId: credentialId, use: true });
  await attachments.attach({ siteId: 'site-b', keyId: credentialId, siteName: 'B' });
  for (const site of [a, b]) {
    assert.equal(await site.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }), h.accessToken);
    assert.equal(await site.repo.find({ workspaceId: 'workspace-local', id: consumerId }), null);
  }
  await c.bindings.set({ consumerId, credentialId });
  await assert.rejects(c.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }), { code: 'access-denied' });
  await attachments.detach({ siteId: 'site-a', keyId: credentialId });
  await assert.rejects(a.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }), { code: 'access-denied' });
  assert.equal(await b.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }), h.accessToken);
  assert.equal(h.provider.tokenCalls, 1);
});

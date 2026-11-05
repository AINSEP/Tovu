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
import { runApiConnectionConnect, startApiConnectionSignIn } from '../connect.js';
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
  let nowMs = Date.now();
  const clock = { nowMs: () => nowMs };
  const ownerRepo = new InMemoryVaultRepo({});
  const keyring = new InMemoryKeyring({ hkdfSalt: 'shared-owner-fixture' });
  const storage = createSharedOAuthOwnerStorage({ scope: { workspaceId: 'project', repo: ownerRepo, keyring, sealer: new AesGcmSecretSealer({ keyring }) }, clock });
  const attachments = attachmentStore();
  const make = (siteId: string) => {
    const repo = new InMemoryVaultRepo({});
    const siteKeyring = new InMemoryKeyring({ hkdfSalt: `site-${siteId}` });
    const bindings = createSiteOAuthBindings({ workspaceId: 'workspace-local', repo, vault: createApiConnectionVault({ repo, keyring: siteKeyring,
      sealer: new AesGcmSecretSealer({ keyring: siteKeyring }), clock, workspaceId: 'workspace-local' }) });
    const host = h.makeHost({ runtime: 'desktop', workspaceId: 'workspace-local', vaultRepo: repo, keyring: siteKeyring, clock,
      env: siteId === 'site-b' ? { ...h.env, TOVU_ACME_OFFICE_OAUTH_DESKTOP_CLIENT_ID: 'different-site-client' } : h.env,
      shared: { storage, bindings, attachments, siteId, siteName: siteId, ownerPrincipalId: Promise.resolve('owner'), transaction: async ({ run }) => run() } });
    return { host, repo, bindings };
  };
  const a = make('site-a'); const b = make('site-b'); const c = make('site-c');
  const connection = (await a.host.listConnections({ pluginId: ACME_PLUGIN }))[0]!;
  const redirectUri = 'http://127.0.0.1:1/callback';
  // B already has an independent local sign-in; sharing must neither adopt nor rewrite it.
  const localConnection = (await b.host.listConnections({ pluginId: ACME_PLUGIN }))[0]!;
  const localService = b.host.serviceFor({ connection: localConnection, redirectUri });
  const localStart = await localService.start({ workspaceId: 'workspace-local', actorId: 'owner', intent: 'connect', scopeSetIds: [], redirectUri });
  const localBack = h.consentRedirect(localStart.authorizationUrl);
  await localService.complete({ workspaceId: 'workspace-local', actorId: 'owner', redirectUri, callbackParams: Object.fromEntries(localBack.searchParams), browserBinding: localStart.browserBinding });
  const localRef = deriveApiConnectionKey({ workspaceId: 'workspace-local', pluginId: ACME_PLUGIN, connectionId: connection.descriptor.connectionId });
  const originalLocal = await b.repo.find({ workspaceId: 'workspace-local', id: localRef });
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
    assert.deepEqual(await site.repo.find({ workspaceId: 'workspace-local', id: consumerId }), site === a ? null : originalLocal);
  }
  // A consuming site's own client never changes the original issuing client used for refresh.
  nowMs += 2 * 60 * 60 * 1000;
  await Promise.all([a.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }),
    b.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId })]);
  assert.equal(h.provider.lastTokenForm.get('client_id'), 'acme-desktop-client');
  assert.equal(h.provider.tokenCalls, 3);
  await c.bindings.set({ consumerId, credentialId });
  await assert.rejects(c.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }), { code: 'access-denied' });
  await attachments.detach({ siteId: 'site-a', keyId: credentialId });
  await assert.rejects(a.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }), { code: 'access-denied' });
  assert.equal(await b.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }), h.accessToken);
  assert.equal(h.provider.tokenCalls, 3);
  const cancel = new AbortController();
  const cancelledLocal = await startApiConnectionSignIn({ host: b.host, connection: localConnection, actorId: 'owner', intent: 'connect', scopeSetIds: [], destination: 'site' }, { signal: cancel.signal });
  cancel.abort();
  assert.equal(await cancelledLocal.completion, null);
  assert.deepEqual(await b.bindings.read({ consumerId }), { credentialId });
  assert.equal(await attachments.isAttached({ siteId: 'site-b', keyId: credentialId }), true);
  assert.deepEqual(await b.repo.find({ workspaceId: 'workspace-local', id: consumerId }), originalLocal);
  const localResult = await runApiConnectionConnect({ deps: { host: b.host }, connection: localConnection, actorId: 'owner', destination: 'site',
    signal: new AbortController().signal, pollIntervalMs: 10, waitTimeoutMs: 50, showSignIn: async () => { throw new Error('Existing local sign-in needs no new browser step'); } });
  assert.equal(localResult.status, 'connected');
  assert.equal(await b.bindings.read({ consumerId }), null);
  assert.equal(await attachments.isAttached({ siteId: 'site-b', keyId: credentialId }), false);
  assert.deepEqual(await b.repo.find({ workspaceId: 'workspace-local', id: consumerId }), originalLocal);
  assert.equal(await b.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }), h.accessToken);
  assert.equal(h.provider.lastTokenForm.get('client_id'), 'different-site-client');
  assert.equal(h.provider.tokenCalls, 4);
});

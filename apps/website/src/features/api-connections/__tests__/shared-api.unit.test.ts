import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { InMemoryVaultRepo } from '@jini-ai/platform/secrets/credential-sets';
import { AesGcmSecretSealer } from '@jini-ai/platform/secrets';
import { InMemoryKeyring } from '@jini-ai/platform/secrets/testing';
import { deriveApiConnectionKey } from '@jini-ai/integrations/api-connections';
import type { KeyAttachments } from '../../project-keys/attachments.js';
import { createSiteOAuthBindings } from '../../project-keys/site-references.js';
import { disconnectSharedOAuth, inspectSharedOAuthDisconnect } from '../../project-keys/shared-oauth-disconnect.js';
import { createSharedOAuthLabels, createSharedOAuthOwnerStorage } from '../shared-owner.js';
import { createApiConnectionVault } from '../vault-stores.js';
import { createSurfaceConnections } from '../surface-connections.js';
import { runApiConnectionConnect, startApiConnectionSignIn } from '../connect.js';
import { startAcmeHarness, ACME_PLUGIN } from './support/acme-harness.js';

function attachmentStore(): KeyAttachments {
  const grants = new Set<string>();
  const id = ({ siteId, keyId }: { siteId: string; keyId: string }) => `${siteId}:${keyId}`;
  return { keysFor: async () => [], usersOf: async () => [], renameSite: async () => {},
    attach: async input => { grants.add(id(input)); }, detach: async input => { grants.delete(id(input)); },
    isAttached: async input => grants.has(id(input)), removeKey: async ({ keyId }) => { for (const grant of grants) if (grant.endsWith(`:${keyId}`)) grants.delete(grant); } };
}

async function fixture(t: TestContext) {
  const h = await startAcmeHarness();
  t.after(() => h.close());
  let nowMs = Date.now();
  const clock = { nowMs: () => nowMs };
  const ownerRepo = new InMemoryVaultRepo({});
  const keyring = new InMemoryKeyring({ hkdfSalt: 'shared-owner-fixture' });
  const scope = { workspaceId: 'project', repo: ownerRepo, keyring, sealer: new AesGcmSecretSealer({ keyring }) };
  const storage = createSharedOAuthOwnerStorage({ scope, clock });
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
  return { h, storage, attachments, make, clock, describeOAuth: createSharedOAuthLabels({ scope, clock }), advance: (ms: number) => { nowMs += ms; } };
}

for (const gap of ['before-grant', 'before-start'] as const) {
  test(`global disconnect fences a prepared shared reconnect ${gap}`, async t => {
    const f = await fixture(t);
    const { host } = f.make('site-a');
    const connection = (await host.listConnections({ pluginId: ACME_PLUGIN }))[0]!;
    const redirectUri = 'http://127.0.0.1:1/callback';
    const input = { connection, actorId: 'owner', destination: 'shared' as const, redirectUri };
    const first = await host.prepareSignIn(input);
    const started = await first.service.start({ workspaceId: 'project', actorId: 'owner', intent: 'connect', scopeSetIds: [], redirectUri });
    const back = f.h.consentRedirect(started.authorizationUrl);
    await first.service.complete({ workspaceId: 'project', actorId: 'owner', redirectUri, callbackParams: Object.fromEntries(back.searchParams), browserBinding: started.browserBinding });
    await first.onCompleted();
    let release!: () => void;
    let paused!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { paused = resolve; });
    const original = f.storage.saveContext;
    if (gap === 'before-grant') f.storage.saveContext = async value => { await original(value); paused(); await barrier; };
    const preparing = host.prepareSignIn(input);
    const target = gap === 'before-start' ? await preparing : undefined;
    if (gap === 'before-grant') await reached;
    const credentialId = started.connectionRef;
    const owner = { storage: f.storage, attachments: f.attachments, clock: f.clock, transaction: async <T>({ run }: { run: () => Promise<T> }) => run(), credentialId };
    const review = await inspectSharedOAuthDisconnect(owner);
    await disconnectSharedOAuth({ ...owner, expectedRevision: review.report.revision, expectedDigest: review.report.sourceDigest }, { revoke: async () => {} });
    release();
    if (target) await assert.rejects(target.service.start({ workspaceId: 'project', actorId: 'owner', intent: 'connect', scopeSetIds: [], redirectUri }), { code: 'storage-conflict' });
    else await assert.rejects(preparing, { code: 'storage-conflict' });
    assert.equal(await f.attachments.isAttached({ siteId: 'site-a', keyId: credentialId }), false);
    assert.equal((await f.storage.records.read({ key: credentialId }))?.status, 'disconnected');
    assert.equal(f.h.provider.tokenCalls, 1);
  });
}

test('one explicit owner sign-in serves two granted site UUIDs; guessed binding and detach refuse without local fallback', async t => {
  const { h, attachments, make, advance, describeOAuth } = await fixture(t);
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
  const surfaceA = createSurfaceConnections({ host: a.host, pluginId: ACME_PLUGIN, workspaceId: 'workspace-local', principalId: 'owner' });
  assert.equal((await surfaceA.status({ connectionId: connection.descriptor.connectionId })).accountLabel, 'Ada (shared on this Mac)');
  await assert.rejects(surfaceA.begin({ connectionId: connection.descriptor.connectionId, action: 'switch' }), { code: 'connection-not-found' });
  const credentialId = deriveApiConnectionKey({ workspaceId: 'project', pluginId: ACME_PLUGIN, connectionId: connection.descriptor.connectionId });
  assert.equal(await describeOAuth({ keyId: credentialId }), `${connection.descriptor.label} — Ada (shared on this Mac)`);
  assert.equal(await describeOAuth({ keyId: 'missing' }), 'Unavailable saved connection (shared on this Mac)');
  const consumerId = deriveApiConnectionKey({ workspaceId: 'workspace-local', pluginId: ACME_PLUGIN, connectionId: connection.descriptor.connectionId });
  await b.host.sharedOAuth!.bind({ keyId: credentialId, use: true });
  await attachments.attach({ siteId: 'site-b', keyId: credentialId, siteName: 'B' });
  for (const site of [a, b]) {
    assert.equal(await site.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }), h.accessToken);
    assert.deepEqual(await site.repo.find({ workspaceId: 'workspace-local', id: consumerId }), site === a ? null : originalLocal);
  }
  // A consuming site's own client never changes the original issuing client used for refresh.
  advance(2 * 60 * 60 * 1000);
  await Promise.all([a.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }),
    b.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId })]);
  assert.equal(h.provider.lastTokenForm.get('client_id'), 'acme-desktop-client');
  assert.equal(h.provider.tokenCalls, 3);
  await c.bindings.set({ consumerId, credentialId });
  await assert.rejects(c.host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }), { code: 'access-denied' });
  assert.equal((await surfaceA.disconnect({ connectionId: connection.descriptor.connectionId })).revocation, 'not-needed');
  assert.equal(h.provider.revokeCalls, 0);
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
  const surfaceB = createSurfaceConnections({ host: b.host, pluginId: ACME_PLUGIN, workspaceId: 'workspace-local', principalId: 'owner' });
  assert.equal((await surfaceB.status({ connectionId: connection.descriptor.connectionId })).accountLabel, 'Ada');
  assert.equal(h.provider.tokenCalls, 4);
});

for (const reconnect of [false, true]) {
  test(`Stop using here fences a paused ${reconnect ? 'reconnect' : 'first shared sign-in'} callback`, async t => {
    const { h, attachments, make } = await fixture(t);
    const { host } = make('site-a');
    const connection = (await host.listConnections({ pluginId: ACME_PLUGIN }))[0]!;
    const redirectUri = 'http://127.0.0.1:1/callback';
    async function pending() {
      const target = await host.prepareSignIn({ connection, actorId: 'owner', destination: 'shared', redirectUri });
      const start = await target.service.start({ workspaceId: target.workspaceId, actorId: 'owner', intent: 'connect', scopeSetIds: [], redirectUri });
      const back = h.consentRedirect(start.authorizationUrl);
      return { target, finish: () => target.service.complete({ workspaceId: target.workspaceId, actorId: 'owner', redirectUri,
        callbackParams: Object.fromEntries(back.searchParams), browserBinding: start.browserBinding }) };
    }
    if (reconnect) { const previous = await pending(); await previous.finish(); await previous.target.onCompleted(); }
    const paused = await pending();
    await host.sharedOAuth!.stopUsing(connection);
    const credentialId = deriveApiConnectionKey({ workspaceId: 'project', pluginId: ACME_PLUGIN, connectionId: connection.descriptor.connectionId });
    assert.equal(await attachments.isAttached({ siteId: 'site-a', keyId: credentialId }), false);
    await paused.finish();
    await assert.rejects(paused.target.onCompleted(), { code: 'access-denied' });
    assert.equal(await attachments.isAttached({ siteId: 'site-a', keyId: credentialId }), false);
    const consumerId = deriveApiConnectionKey({ workspaceId: 'workspace-local', pluginId: ACME_PLUGIN, connectionId: connection.descriptor.connectionId });
    await assert.rejects(host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef: consumerId }), { code: 'access-denied' });
  });
}

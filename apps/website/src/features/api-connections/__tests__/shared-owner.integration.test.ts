/** @file Shared OAuth on real owner SQLite handles/processes; only provider redemption is fake. */
import '../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test, { type TestContext } from 'node:test';
import { createSharedOAuthConsumer, deriveApiConnectionKey, parseApiConnectionDescriptor, type ApiConnectionRecord } from '@jini-ai/integrations/api-connections';
import { createTokenRefresher, type OAuthTokenSet, type TokenRefreshPort } from '@jini-ai/oauth';
import { AesGcmSecretSealer } from '@jini-ai/platform/secrets';
import { InMemoryKeyring } from '@jini-ai/platform/secrets/testing';
import { InMemoryVaultRepo, type VaultRepoPort } from '@jini-ai/platform/secrets/credential-sets';
import { openProjectStore } from '../../../server/runtime/composition/project-store.js';
import { createSiteOAuthBindings } from '../../project-keys/site-references.js';
import { disconnectSharedOAuth, inspectSharedOAuthDisconnect } from '../../project-keys/shared-oauth-disconnect.js';
import { createSharedOAuthOwnerStorage, type SharedOAuthIssuingContext } from '../shared-owner.js';
import { apiConnectionVaultScope, createApiConnectionVault } from '../vault-stores.js';

const clock = { nowMs: () => Date.parse('2026-11-05T19:00:00Z') };
const descriptor = parseApiConnectionDescriptor({ value: { pluginId: 'shared-fixture', connectionId: 'account',
  label: 'Shared fixture account', authorizationEndpoint: 'https://issuer.example/authorize', tokenEndpoint: 'https://issuer.example/token' } });
const credentialId = deriveApiConnectionKey({ workspaceId: 'project', pluginId: descriptor.pluginId, connectionId: descriptor.connectionId });
const identity = { pluginId: descriptor.pluginId, connectionId: descriptor.connectionId,
  authorizationEndpoint: descriptor.authorizationEndpoint, tokenEndpoint: descriptor.tokenEndpoint, clientId: 'issuing-desktop-client' };
const context: SharedOAuthIssuingContext = { credentialId, identity, descriptor, clientKind: 'public',
  client: { clientId: identity.clientId, clientSecret: 'fixture-client-secret', authMethod: 'client_secret_post' } };
const tokenSet = (label: string, expired = false): OAuthTokenSet => ({ accessToken: `fixture-access-${label}`,
  refreshToken: `fixture-refresh-${label}`, tokenType: 'Bearer', scopes: ['read'],
  expiresAt: new Date(clock.nowMs() + (expired ? -1 : 3_600_000)).toISOString() });

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

const ioCounts = () => ({ reads: 0, readBytes: 0, writes: 0, writeBytes: 0, scans: 0 });
type IoCounts = ReturnType<typeof ioCounts>;
const serializedBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? 'null');

/** Count repository operations and serialized boundary payloads, excluding SQLite/WAL pages. */
function measuredRepo(repo: VaultRepoPort, io: IoCounts): VaultRepoPort {
  return new Proxy(repo, { get(target, property) {
    const member: unknown = Reflect.get(target, property);
    if (typeof member !== 'function') return member;
    return async (...args: unknown[]) => {
      const result: unknown = await Reflect.apply(member, target, args);
      if (['find', 'findOne', 'findDefault', 'list'].includes(String(property))) {
        io.reads++; io.readBytes += serializedBytes(result);
        if (property === 'list') io.scans++;
      } else { io.writes++; io.writeBytes += serializedBytes(args); }
      return result;
    };
  } });
}

async function ownerFixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-shared-oauth-'));
  const input = { home: path.join(root, 'home'), sitesHome: path.join(root, 'sites'), appDataDir: path.join(root, 'owner') };
  const first = await openProjectStore(input, { clock });
  const second = await openProjectStore(input, { clock });
  let closed = false;
  const close = () => { if (!closed) { second.close({}); first.close({}); closed = true; } };
  t.after(() => { close(); fs.rmSync(root, { recursive: true, force: true }); });
  const ownerIo = [ioCounts(), ioCounts()];
  const a = createSharedOAuthOwnerStorage({ scope: { ...first.vault, repo: measuredRepo(first.vault.repo, ownerIo[0]!) }, clock });
  const b = createSharedOAuthOwnerStorage({ scope: { ...second.vault, repo: measuredRepo(second.vault.repo, ownerIo[1]!) }, clock });
  await a.saveContext({ credentialId, context });
  const record: ApiConnectionRecord = { key: credentialId, workspaceId: 'project', pluginId: identity.pluginId,
    connectionId: identity.connectionId, generation: 1, revision: 1, status: 'connected', account: { accountId: 'alice', displayName: 'Alice' },
    grantedScopes: ['read'], staged: null, revocationFailure: null, updatedAt: new Date(clock.nowMs()).toISOString() };
  assert.equal(await a.records.compareAndSet({ key: credentialId, expectedRevision: 0, record }), true);
  await a.tokensFor({ context }).install({ key: credentialId, generation: 1, tokens: tokenSet('old', true) });
  await first.attachments.attach({ siteId: 'site-a-uuid', siteName: 'A', keyId: credentialId });
  await second.attachments.attach({ siteId: 'site-b-uuid', siteName: 'B', keyId: credentialId });
  return { root, input, first, second, a, b, close, ownerIo };
}

function siteBindings() {
  const io = ioCounts();
  const repo = measuredRepo(new InMemoryVaultRepo({}), io);
  const keyring = new InMemoryKeyring({ hkdfSalt: 'shared-consumer-site' });
  const vault = createApiConnectionVault({ workspaceId: 'workspace-local', repo, keyring,
    sealer: new AesGcmSecretSealer({ keyring }), clock });
  const bindings = createSiteOAuthBindings({ vault, repo, workspaceId: 'workspace-local' });
  return { bindings, vault, repo, io };
}

test('two SQLite owner handles redeem one rotation after a delayed lease, then site/global revocation survives restart', async t => {
  const f = await ownerFixture(t);
  const sites = [siteBindings(), siteBindings()];
  const consumerId = 'workspace-local/shared-fixture/account';
  for (const site of sites) await site.bindings.set({ consumerId, credentialId });
  const staleLoaded = barrier();
  const proceed = barrier();
  const redeemed: string[] = [];
  const refreshed = tokenSet('rotated');
  const refresh: TokenRefreshPort['refresh'] = async ({ refreshToken }) => { redeemed.push(refreshToken); return refreshed; };
  const firstTokens = f.a.tokensFor({ context });
  const secondTokens = f.b.tokensFor({ context });
  let pauseFirstLoad = true;
  const firstRefresher = createTokenRefresher({ clock, sleep: async () => {}, port: { ...firstTokens, refresh } });
  const secondRefresher = createTokenRefresher({ clock, sleep: async () => {}, port: { ...secondTokens, refresh,
    load: async input => {
      const loaded = await secondTokens.load(input);
      if (pauseFirstLoad) { pauseFirstLoad = false; staleLoaded.release(); await proceed.promise; }
      return loaded;
    } } });
  const grantIo = { reads: 0, readBytes: 0 };
  const makeConsumer = (index: number) => {
    const storage = index === 0 ? f.a : f.b;
    const owner = index === 0 ? f.first : f.second;
    const refresher = index === 0 ? firstRefresher : secondRefresher;
    return createSharedOAuthConsumer({ bindings: { read: input => sites[index]!.bindings.read(input) },
      grants: { isGranted: async input => {
        const granted = await owner.attachments.isAttached({ siteId: input.siteId, keyId: input.credentialId });
        grantIo.reads++; grantIo.readBytes += serializedBytes(granted);
        return granted;
      } },
      connections: { read: storage.readConnection, getAccessToken: async input => {
        assert.equal((await storage.records.read({ key: input.credentialId }))?.generation, input.expectedGeneration);
        assert.equal(input.expectedAccountId, 'alice');
        return refresher.getAccessToken({ key: input.credentialId });
      } } });
  };
  const a = makeConsumer(0);
  const b = makeConsumer(1);
  const target = { siteId: 'site-a-uuid', consumerId, identity, requiredScopes: ['read'] };
  const delayed = b.getAccessToken({ ...target, siteId: 'site-b-uuid' });
  await staleLoaded.promise;
  assert.equal(await a.getAccessToken(target), refreshed.accessToken);
  proceed.release();
  assert.equal(await delayed, refreshed.accessToken);
  assert.deepEqual(redeemed, [tokenSet('old', true).refreshToken]);
  assert.deepEqual(await secondTokens.load({ key: credentialId }), refreshed);

  for (const counts of [...f.ownerIo, ...sites.map(site => site.io)]) Object.assign(counts, ioCounts());
  Object.assign(grantIo, { reads: 0, readBytes: 0 });
  assert.equal(await a.getAccessToken(target), refreshed.accessToken);
  t.diagnostic(`one unexpired shared acquisition: ${JSON.stringify({ owner: f.ownerIo, sites: sites.map(site => site.io), grants: grantIo })}`);
  assert.equal(f.ownerIo.reduce((sum, io) => sum + io.writes + io.scans, 0), 0);
  assert.equal(sites.reduce((sum, site) => sum + site.io.writes + site.io.scans, 0), 0);

  for (const site of sites) {
    const rows = await site.repo.list(apiConnectionVaultScope({ workspaceId: 'workspace-local' }));
    assert.equal(rows.length, 1);
    const payload = (await site.vault.get({ ...apiConnectionVaultScope({ workspaceId: 'workspace-local' }), id: rows[0]!.id }))!.payload;
    assert.deepEqual(payload, { value: { credentialId } });
  }
  assert.equal((await f.first.vault.repo.find({ workspaceId: 'project', id: credentialId }))?.sealed !== null, true);
  for (const suffix of ['', '-wal']) {
    const file = f.first.dbPath + suffix;
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    for (const secret of [context.client.clientSecret!, refreshed.accessToken, refreshed.refreshToken!]) assert.equal(bytes.includes(secret), false);
  }

  await f.first.attachments.detach({ siteId: target.siteId, keyId: credentialId });
  await assert.rejects(a.getAccessToken(target), { code: 'access-denied' });
  assert.equal(await b.getAccessToken({ ...target, siteId: 'site-b-uuid' }), refreshed.accessToken);
  const owner = { storage: f.a, attachments: f.first.attachments, transaction: f.first.transaction, clock, credentialId };
  const { report } = await inspectSharedOAuthDisconnect(owner);
  const stopped = await disconnectSharedOAuth({ ...owner, expectedRevision: report.revision, expectedDigest: report.sourceDigest }, {
    revoke: async () => { throw Object.assign(new Error('fixture provider unavailable'), { code: 'provider-unreachable' }); },
  });
  assert.equal(stopped.remoteRevocation, 'pending');
  assert.deepEqual(await f.second.attachments.usersOf({ keyId: credentialId }), []);
  await assert.rejects(b.getAccessToken({ ...target, siteId: 'site-b-uuid' }), { code: 'access-denied' });
  f.close();
  const restarted = await openProjectStore(f.input, { clock });
  try {
    const storage = createSharedOAuthOwnerStorage({ scope: restarted.vault, clock });
    assert.equal((await storage.records.read({ key: credentialId }))?.status, 'revocation-pending');
    assert.deepEqual(await storage.tokensFor({ context }).load({ key: credentialId }), null);
    assert.deepEqual(await storage.tokensFor({ context }).loadForRevocation({ key: credentialId }), refreshed);
    assert.deepEqual(await restarted.attachments.usersOf({ keyId: credentialId }), []);
  } finally { restarted.close({}); }
});

test('a separate process cannot take an owner SQLite refresh lease held by another process', async t => {
  const f = await ownerFixture(t);
  const tokens = f.a.tokensFor({ context });
  assert.equal(await tokens.tryAcquireRefreshLease!({ key: credentialId }), true);
  const child = `
    import { openProjectStore } from './apps/website/src/server/runtime/composition/project-store.ts';
    import { createSharedOAuthOwnerStorage } from './apps/website/src/features/api-connections/shared-owner.ts';
    const input = JSON.parse(process.argv[1]);
    const credentialId = process.argv[2];
    const clock = { nowMs: () => ${clock.nowMs()} };
    const owner = await openProjectStore(input, { clock });
    try {
      const storage = createSharedOAuthOwnerStorage({ scope: owner.vault, clock });
      const context = await storage.readContext({ credentialId });
      const tokens = storage.tokensFor({ context });
      const acquired = await tokens.tryAcquireRefreshLease({ key: credentialId });
      if (acquired) await tokens.releaseRefreshLease({ key: credentialId });
      process.stdout.write(JSON.stringify({ acquired }));
    } finally { owner.close({}); }
  `;
  const runChild = () => promisify(execFile)(process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', child, JSON.stringify(f.input), credentialId],
    { cwd: process.cwd(), timeout: 20_000 });
  assert.deepEqual(JSON.parse((await runChild()).stdout), { acquired: false });
  await tokens.releaseRefreshLease!({ key: credentialId });
  assert.deepEqual(JSON.parse((await runChild()).stdout), { acquired: true });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryVaultRepo } from '@jini-ai/platform/secrets/credential-sets';
import { InMemoryKeyring } from '../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../webhooks/secret-sealer.aesgcm.js';
import { createApiConnectionVault } from '../../api-connections/vault-stores.js';
import { createSharedOAuthOwnerStorage } from '../../api-connections/shared-owner.js';
import { createSiteOAuthBindings } from '../../project-keys/site-references.js';
import { fakeAttachments } from '../../project-keys/__tests__/helpers.js';
import { createExternalMcpOAuthService, createDeviceAuthorizationStore } from '../external-mcp-oauth.js';
import { InMemoryExternalMcpServerRepo } from '../external-mcp-store.memory.js';
import { openExternalMcpOAuthPayload, saveExternalMcpServer } from '../external-mcp-store.js';
import { createTovuOAuthGuard } from '../../../platform/oauth/endpoint-safety.js';
import type { OAuthProviderDescriptor } from '@jini-ai/oauth';

const provider: OAuthProviderDescriptor = { providerId: 'fixture', label: 'Synthetic provider', supportedGrants: ['authorization_code', 'device_code'],
  authorizationEndpoint: 'https://auth.example/authorize', tokenEndpoint: 'https://auth.example/token', deviceAuthorizationEndpoint: 'https://auth.example/device',
  defaultScopes: ['read'], usesPkce: true, clientAuth: 'client_secret_post' };
const redirectUri = 'https://site.example/api/mcp-servers/oauth/callback/server';

async function harness() {
  let now = Date.parse('2026-11-05T00:00:00Z');
  const clock = { nowMs: () => now, nowIso: () => new Date(now).toISOString() };
  const ownerRepo = new InMemoryVaultRepo({});
  const ownerKeyring = new InMemoryKeyring();
  const ownerSealer = new AesGcmSecretSealer(ownerKeyring);
  const owner = createSharedOAuthOwnerStorage({ scope: { workspaceId: 'project', repo: ownerRepo, keyring: ownerKeyring, sealer: ownerSealer }, clock });
  const attachments = fakeAttachments();
  const requests: URLSearchParams[] = [];
  let tokens = 0;
  let onRefresh: (() => Promise<void>) | undefined;
  const fetchFn = async ({ url }: { url: string | URL }, init?: RequestInit) => {
    const params = new URLSearchParams(String(init?.body));
    requests.push(params);
    if (String(url).endsWith('/device')) return new Response(JSON.stringify({ device_code: 'private-device', user_code: 'USER', verification_uri: 'https://auth.example/verify', expires_in: 600, interval: 1 }));
    if (params.get('grant_type') === 'refresh_token') await onRefresh?.();
    tokens++;
    return new Response(JSON.stringify({ access_token: `access-${tokens}`, refresh_token: `refresh-${tokens}`, token_type: 'Bearer', expires_in: 60, scope: 'read' }), { headers: { 'content-type': 'application/json' } });
  };
  async function site(siteId: string, clientId = 'original-client', grant = 'authorization_code') {
    const repo = new InMemoryExternalMcpServerRepo();
    const keyring = new InMemoryKeyring();
    const sealer = new AesGcmSecretSealer(keyring);
    const siteVaultRepo = new InMemoryVaultRepo({});
    const bindings = createSiteOAuthBindings({ repo: siteVaultRepo, workspaceId: 'workspace-local', vault: createApiConnectionVault({ repo: siteVaultRepo, workspaceId: 'workspace-local', keyring, sealer, clock }) });
    await saveExternalMcpServer({ repo, keyring, sealer, clock }, { workspaceId: 'workspace-local', serverId: 'server', label: 'Shared fixture', transport: 'streamable_http',
      authMode: 'oauth', enabled: true, url: 'https://resource.example/mcp', command: '', args: '', allowedToolNames: 'read', principalId: 'owner',
      oauth: { providerId: provider.providerId, grant, clientId, clientSecret: `${clientId}-secret`, scopes: 'read' } });
    const service = createExternalMcpOAuthService({ workspaceId: 'workspace-local', repo, keyring, sealer, clock,
      devices: createDeviceAuthorizationStore(), lookupProvider: () => provider, httpPorts: { guard: createTovuOAuthGuard({}), fetchFn },
      shared: { owner, bindings, attachments, siteId, siteName: siteId, ownerPrincipalId: 'owner', transaction: ({ run }) => run() } });
    return { repo, bindings, service, sealer };
  }
  return { clock, owner, ownerRepo, attachments, requests, site, advance: (ms: number) => { now += ms; }, onRefresh: (handler: () => Promise<void>) => { onRefresh = handler; } };
}
async function signIn(site: Awaited<ReturnType<Awaited<ReturnType<typeof harness>>['site']>>) {
  const start = await site.service.beginConnect({ serverId: 'server', destination: 'shared', redirectUri, browserBinding: 'browser-a', actorId: 'owner' });
  assert.equal(start.kind, 'redirect_required');
  if (start.kind !== 'redirect_required') throw new Error('redirect required');
  await site.service.completeAuthorizationCallback({ serverId: 'server', redirectUri, browserBinding: 'browser-a', params: { state: new URL(start.authorizationUrl).searchParams.get('state')!, code: 'synthetic-code' } });
  return (await site.bindings.read({ consumerId: 'mcp:server' }))!.credentialId;
}

test('explicit shared sign-in stores tokens only in the owner vault; two sites refresh once with original client', async () => {
  const h = await harness();
  const a = await h.site('site-a');
  const before = await a.repo.findByServerId({ workspaceId: 'workspace-local', serverId: 'server' });
  const credentialId = await signIn(a);
  const after = await a.repo.findByServerId({ workspaceId: 'workspace-local', serverId: 'server' });
  assert.deepEqual(after, before, 'shared sign-in must not mutate the local connection');
  assert.equal((await openExternalMcpOAuthPayload(a.sealer, after!)).tokens, undefined);
  const b = await h.site('site-b', 'different-site-client');
  await b.service.useSharedConnection!({ serverId: 'server', credentialId, actorId: 'owner' });
  h.advance(120_000);
  assert.deepEqual(await Promise.all([a.service.tokenResolver.resolveAccessToken({ serverId: 'server' }), b.service.tokenResolver.resolveAccessToken({ serverId: 'server' })]), ['access-2', 'access-2']);
  const refreshes = h.requests.filter(params => params.get('grant_type') === 'refresh_token');
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0]!.get('client_id'), 'original-client');
  assert.equal(refreshes[0]!.get('client_secret'), 'original-client-secret');
  assert.equal(refreshes[0]!.get('resource'), 'https://resource.example/mcp');
  const context = await h.owner.readContext({ credentialId });
  assert.equal((await h.owner.tokensFor({ context: context! }).load({ key: credentialId }))!.refreshToken, 'refresh-2');
});

test('Stop using here blocks an open shared selection without disabling another site or falling back local', async () => {
  const h = await harness();
  const a = await h.site('site-a');
  const credentialId = await signIn(a);
  const b = await h.site('site-b');
  await b.service.useSharedConnection!({ serverId: 'server', credentialId, actorId: 'owner' });
  await a.service.disconnect({ serverId: 'server' });
  await assert.rejects(a.service.tokenResolver.resolveAccessToken({ serverId: 'server' }), /shared|saved/i);
  assert.equal(await b.service.tokenResolver.resolveAccessToken({ serverId: 'server' }), 'access-1');
  assert.equal(await a.service.assertSharedAuthorized!({ serverId: 'server' }).catch(() => false), false);
});

test('revocation while refresh is in flight returns no token to that site', async () => {
  const h = await harness();
  const a = await h.site('site-a');
  const credentialId = await signIn(a);
  h.advance(120_000);
  h.onRefresh(() => h.attachments.detach({ siteId: 'site-a', keyId: credentialId }));
  await assert.rejects(a.service.tokenResolver.resolveAccessToken({ serverId: 'server' }), /shared|saved/i);
});

test('owner check, copied binding and a changed resource cannot grant a saved connection', async () => {
  const h = await harness();
  const a = await h.site('site-a');
  await assert.rejects(a.service.beginConnect({ serverId: 'server', destination: 'shared', redirectUri, actorId: 'editor' }));
  const credentialId = await signIn(a);
  const copied = await h.site('site-c');
  await copied.bindings.set({ consumerId: 'mcp:server', credentialId });
  await assert.rejects(copied.service.tokenResolver.resolveAccessToken({ serverId: 'server' }));
  const b = await h.site('site-b');
  const row = (await b.repo.findByServerId({ workspaceId: 'workspace-local', serverId: 'server' }))!;
  await b.repo.upsert({ ...row, url: 'https://different.example/mcp' });
  await assert.rejects(b.service.useSharedConnection!({ serverId: 'server', credentialId, actorId: 'owner' }));
  assert.equal(await h.attachments.isAttached({ siteId: 'site-b', keyId: credentialId }), false);
});

test('shared redirect and device completions stay stopped after local disconnect', async () => {
  for (const grant of ['authorization_code', 'device_code']) {
    const h = await harness();
    const a = await h.site('site-a', 'original-client', grant);
    const start = await a.service.beginConnect({ serverId: 'server', destination: 'shared', redirectUri, browserBinding: 'proof', actorId: 'owner' });
    await a.service.disconnect({ serverId: 'server' });
    const before = h.requests.length;
    if (start.kind === 'redirect_required') await assert.rejects(a.service.completeAuthorizationCallback({ serverId: 'server', redirectUri, browserBinding: 'proof', params: { state: new URL(start.authorizationUrl).searchParams.get('state')!, code: 'synthetic' } }));
    else await assert.rejects(a.service.pollDeviceAuthorization({ serverId: 'server' }));
    assert.equal(h.requests.length, before, 'stopped completion must fail before provider exchange');
  }
});

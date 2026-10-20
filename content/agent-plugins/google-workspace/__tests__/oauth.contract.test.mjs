/**
 * @file OAuth contract for the Google Workspace plugin: the plugin's real connection declaration
 * (`tovu-connections.json`) and hooks (`lib/auth.mjs`) run inside the real Jini API-connection
 * service over the real sealed vault token store, against a local fake of Google. One vertical-slice
 * proof plus phase-A security pins: state + PKCE, consent denial, partial scopes, missing refresh
 * token, refresh rotation, invalid_grant, revoke honesty, desktop re-consent, hosted incremental
 * consent, and secret redaction. Only `fake.fetch` is injected; it throws for every non-Google host
 * and sends Google hosts to 127.0.0.1.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';

import {
  createApiConnectionGenerationReader, createApiConnectionService, createVaultOAuthTokenStore, parseApiConnectionDescriptor, parseOAuthTokenVaultMeta,
} from '@jini-ai/integrations/api-connections';
import { createOAuthUrlGuard } from '@jini-ai/oauth';
import { AesGcmSecretSealer } from '@jini-ai/platform/secrets';
import { InMemoryKeyring } from '@jini-ai/platform/secrets/testing';
import { InMemoryVaultRepo, SecretsVaultService, createVaultMetaParsers } from '@jini-ai/platform/secrets/credential-sets';

import hooksModule, { GOOGLE_REVOCATION_ENDPOINT } from '../lib/auth.mjs';
import { createGoogleClient } from '../lib/http.mjs';
import accountInfo from '../tools/account-info.mjs';
import { startFakeGoogle } from './fake-google-http.mjs';

const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
const WS = 'ws-1';
const ACTOR = 'admin-1';
/** Placeholder client identities; secrets are built at runtime and are not secret-shaped. */
const CLIENTS = {
  hosted: { clientId: 'web-client.test', clientSecret: `web-secret-${'w'.repeat(20)}`, authMethod: 'client_secret_post', kind: 'confidential', callback: 'https://site.test/api/agent-plugins/connections/oauth/callback' },
  desktop: { clientId: 'desktop-client.test', clientSecret: `desktop-secret-${'d'.repeat(20)}`, authMethod: 'client_secret_post', kind: 'public', callback: 'http://127.0.0.1:47011/callback' },
};

let fake;
before(async () => {
  fake = await startFakeGoogle({ clients: { [CLIENTS.hosted.clientId]: { secret: CLIENTS.hosted.clientSecret }, [CLIENTS.desktop.clientId]: { secret: CLIENTS.desktop.clientSecret } } });
});
after(async () => { await fake.close(); });
beforeEach(() => { fake.reset(); });

/** The plugin's declaration, split the way the host loader splits it. */
async function declaredDescriptor() {
  const file = JSON.parse(await readFile(new URL('../tovu-connections.json', import.meta.url), 'utf8'));
  const { id, module: _module, clients: _clients, ...descriptor } = file.connections[0];
  return parseApiConnectionDescriptor({ value: { ...descriptor, pluginId: 'google-workspace', connectionId: id } });
}

function memoryRecordStore() {
  const records = new Map();
  const attempts = new Map();
  return {
    records,
    async read({ key }) { return structuredClone(records.get(key) ?? null); },
    async compareAndSet({ key, expectedRevision, record }) {
      if ((records.get(key)?.revision ?? 0) !== expectedRevision) return false;
      records.set(key, structuredClone(record));
      return true;
    },
    async putAttempt({ attempt }) { attempts.set(attempt.state, structuredClone(attempt)); },
    async takeAttempt({ state }) {
      const attempt = attempts.get(state) ?? null;
      attempts.delete(state);
      return attempt;
    },
  };
}

/** In-memory token store with the same port (for the revoke-honesty tests; see the vault pin below). */
function memoryTokenStore() {
  const entries = new Map();
  return {
    async load({ key }) { return structuredClone(entries.get(key) ?? null); },
    async persist({ key, tokens }) { entries.set(key, structuredClone(tokens)); },
    async install({ key, tokens }) { entries.set(key, structuredClone(tokens)); },
    async markNeedsReauth() { /* status lives in the record store */ },
    async delete({ key }) { entries.delete(key); },
  };
}

/** A real service for one runtime, over the sealed vault token store (or the in-memory one). */
async function harness({ runtime = 'hosted', tokenStore = 'vault' } = {}) {
  const client = CLIENTS[runtime];
  const clock = { now: Date.parse('2026-10-20T10:00:00.000Z'), nowMs() { return this.now; } };
  const keyring = new InMemoryKeyring({ hkdfSalt: 'google-workspace-oauth-contract' });
  const repo = new InMemoryVaultRepo({});
  const vault = new SecretsVaultService({ repo, keyring, sealer: new AesGcmSecretSealer({ keyring }),
    metaParsers: createVaultMetaParsers({}, { parsers: { 'api-connection': parseOAuthTokenVaultMeta } }),
    authorize: async () => {}, now: () => new Date(clock.nowMs()).toISOString(), newId: () => 'unused-id' });
  const records = memoryRecordStore();
  const tokens = tokenStore === 'memory' ? memoryTokenStore() : createVaultOAuthTokenStore({
    vault, clock, readGeneration: createApiConnectionGenerationReader({ records }),
    vaultScope: { workspaceId: WS, kind: 'api-connection', ownerKey: 'google-workspace', principalId: null, binding: null },
    owner: { workspaceId: WS, pluginId: 'google-workspace', connectionId: 'account', clientId: client.clientId },
  });
  const service = createApiConnectionService({
    descriptor: await declaredDescriptor(), clientKind: client.kind,
    client: { clientId: client.clientId, clientSecret: client.clientSecret, authMethod: client.authMethod },
    appOptions: { clientDisplayName: 'Tovu', softwareId: 'tovu', redirectUris: [client.callback] },
    hooks: hooksModule.createHooks({ http: { fetch: fake.fetch } }),
    records, tokens, fetchFn: ({ url }, init) => fake.fetch({ url }, init), clock,
    guard: createOAuthUrlGuard({ assertAllowed: () => undefined }, { allowLoopbackHttp: true }),
    randomBytesFn: ({ byteLength }) => randomBytes(byteLength), sleep: async () => undefined,
  });
  return { service, records, repo, clock, callback: client.callback };
}

/** Start a sign-in, consent at the fake, and return the callback query (not yet completed). */
async function consent(h, { scopeSetIds = ['sheets'], intent = 'connect', ...choices } = {}) {
  const started = await h.service.start({ workspaceId: WS, actorId: ACTOR, intent, scopeSetIds, redirectUri: h.callback });
  return { started, callbackParams: fake.consent({ authorizationUrl: started.authorizationUrl, ...choices }) };
}

async function signIn(h, options = {}) {
  const { started, callbackParams } = await consent(h, options);
  const completed = await h.service.complete({ workspaceId: WS, actorId: ACTOR, redirectUri: h.callback, callbackParams });
  return { started, completed };
}

const tokenRequests = () => fake.requests.filter((request) => request.path === '/token').map((request) => new URLSearchParams(request.body));
const issuedTokens = () => tokenRequests().length;

test('vertical slice: hosted sign-in asks for drive.file only, proves PKCE, and the account_info tool names the account without a token', async () => {
  const h = await harness();
  const { started, completed } = await signIn(h);
  const authorize = new URL(started.authorizationUrl);
  assert.equal(`${authorize.origin}${authorize.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.deepEqual(Object.fromEntries(['scope', 'access_type', 'include_granted_scopes', 'code_challenge_method', 'prompt'].map((name) => [name, authorize.searchParams.get(name)])),
    { scope: DRIVE_FILE, access_type: 'offline', include_granted_scopes: 'true', code_challenge_method: 'S256', prompt: null });
  const [exchange] = tokenRequests();
  assert.equal(exchange.get('grant_type'), 'authorization_code');
  assert.equal(exchange.get('client_secret'), CLIENTS.hosted.clientSecret);
  assert.deepEqual([completed.outcome, completed.account, completed.grantedScopes], ['connected', { accountId: 'perm-alice', displayName: 'alice@example.test' }, [DRIVE_FILE]]);

  const capabilities = { connections: { getAccessToken: ({ connectionRef }) => h.service.getAccessToken({ connectionRef }) }, http: { fetch: fake.fetch }, limiter: { check: async () => ({ allowed: true }) } };
  const output = await accountInfo.invoke({ input: { connectionRef: started.connectionRef }, capabilities });
  assert.deepEqual(output, { accountId: 'perm-alice', displayName: 'alice@example.test' });
  const about = fake.requests.at(-1);
  assert.deepEqual([about.host, about.path, about.query.get('fields')], ['www.googleapis.com', '/drive/v3/about', 'user(displayName,emailAddress,permissionId)']);
});

test('PKCE: the verifier sent to the token endpoint matches the S256 challenge of the same attempt (the fake refuses any other)', async () => {
  const h = await harness();
  const { started, callbackParams } = await consent(h);
  const other = await consent(h);
  // Swap codes: attempt A's state with attempt B's code. The verifier of A does not match B's challenge.
  await assert.rejects(h.service.complete({ workspaceId: WS, actorId: ACTOR, redirectUri: h.callback, callbackParams: { ...callbackParams, code: other.callbackParams.code } }), { code: 'authorization-failed' });
  assert.equal((await h.service.getStatus({ connectionRef: started.connectionRef })).status, 'disconnected');
});

test('state: a callback whose state was never issued is refused as invalid-attempt and no code is exchanged', async () => {
  const h = await harness();
  const { callbackParams } = await consent(h);
  await assert.rejects(h.service.complete({ workspaceId: WS, actorId: ACTOR, redirectUri: h.callback, callbackParams: { ...callbackParams, state: 'forged-state' } }), { code: 'invalid-attempt' });
  assert.equal(issuedTokens(), 0);
});

test('state: a replayed callback is refused as invalid-attempt (consume once)', async () => {
  const h = await harness();
  const { callbackParams } = await consent(h);
  await h.service.complete({ workspaceId: WS, actorId: ACTOR, redirectUri: h.callback, callbackParams });
  await assert.rejects(h.service.complete({ workspaceId: WS, actorId: ACTOR, redirectUri: h.callback, callbackParams }), { code: 'invalid-attempt' });
  assert.equal(issuedTokens(), 1);
});

test('consent denial: access-denied, nothing exchanged or stored, still not connected', async () => {
  const h = await harness();
  const { started, callbackParams } = await consent(h, { deny: true });
  await assert.rejects(h.service.complete({ workspaceId: WS, actorId: ACTOR, redirectUri: h.callback, callbackParams }), { code: 'access-denied' });
  assert.equal(issuedTokens(), 0);
  assert.equal((await h.service.getStatus({ connectionRef: started.connectionRef })).status, 'disconnected');
});

test('partial scopes: a grant without drive.file is refused as scope-not-granted and no token is served', async () => {
  const h = await harness();
  const { started, callbackParams } = await consent(h, { grantScopes: ['openid'] });
  await assert.rejects(h.service.complete({ workspaceId: WS, actorId: ACTOR, redirectUri: h.callback, callbackParams }), { code: 'scope-not-granted' });
  await assert.rejects(h.service.getAccessToken({ connectionRef: started.connectionRef }), { code: 'connection-not-found' });
});

test('missing refresh token: a hosted same-account reconnect that omits one keeps the stored refresh token', async () => {
  const h = await harness();
  const first = await signIn(h);
  const [original] = fake.liveRefreshTokens();
  await signIn(h, { omitRefreshToken: true });
  h.clock.now += 3600_000;
  await h.service.getAccessToken({ connectionRef: first.started.connectionRef });
  assert.equal(tokenRequests().at(-1).get('refresh_token'), original);
});

test('refresh rotation: a rotated refresh token is stored and the old one is never sent again', async () => {
  const h = await harness();
  const { started } = await signIn(h);
  const [original] = fake.liveRefreshTokens();
  fake.behaviour.rotateRefreshTokens = true;
  h.clock.now += 3600_000;
  await h.service.getAccessToken({ connectionRef: started.connectionRef });
  const [rotated] = fake.liveRefreshTokens();
  h.clock.now += 3600_000;
  await h.service.getAccessToken({ connectionRef: started.connectionRef });
  assert.deepEqual(tokenRequests().slice(-2).map((form) => form.get('refresh_token')), [original, rotated]);
});

test('invalid_grant: the connection needs a reconnect and the plugin client says "Reconnect required" with a reconnect action', async () => {
  const h = await harness();
  const { started } = await signIn(h);
  fake.behaviour.refreshError = 'invalid_grant';
  h.clock.now += 3600_000;
  const client = createGoogleClient({ http: { fetch: fake.fetch }, connections: { getAccessToken: ({ connectionRef }) => h.service.getAccessToken({ connectionRef }) } });
  await assert.rejects(client.request({ connectionRef: started.connectionRef, url: 'https://www.googleapis.com/drive/v3/about', kind: 'read' }),
    (error) => error.code === 'reconnect-required' && error.nextAction === 'reconnect' && error.message.startsWith('Reconnect required'));
  assert.equal((await h.service.getStatus({ connectionRef: started.connectionRef })).status, 'reconnect-required');
});

test('revoke hook: posts the token form-encoded to Google\'s revocation endpoint and resolves only on 200', async () => {
  const { revoke } = hooksModule.createHooks({ http: { fetch: fake.fetch } });
  await revoke({ token: 'fake-refresh-to-revoke' });
  const request = fake.requests.find((entry) => entry.path === '/revoke');
  assert.deepEqual([request.method, `https://${request.host}${request.path}`, request.headers['content-type'], request.body],
    ['POST', GOOGLE_REVOCATION_ENDPOINT, 'application/x-www-form-urlencoded', 'token=fake-refresh-to-revoke']);
});

test('revoke hook: a refusal or Google\'s invalid_token is never a confirmation, and the error carries no token', async () => {
  const { revoke } = hooksModule.createHooks({ http: { fetch: fake.fetch } });
  for (const [status, body] of [[503, {}], [400, { error: 'invalid_token' }]]) {
    Object.assign(fake.behaviour, { revokeStatus: status, revokeBody: body });
    await assert.rejects(revoke({ token: 'fake-refresh-kept' }), (error) => error.message.includes('Google revocation pending') && !error.message.includes('fake-refresh-kept'));
  }
});

test('revoke: a confirmed revocation clears local tokens; a failed one stays "revocation pending", serves no token, and a retry confirms', async () => {
  const h = await harness({ tokenStore: 'memory' });
  const { started } = await signIn(h);
  fake.behaviour.revokeStatus = 503;
  const pending = await h.service.disconnect({ connectionRef: started.connectionRef });
  assert.deepEqual([pending.status, pending.remoteRevocation], ['revocation-pending', 'pending']);
  await assert.rejects(h.service.getAccessToken({ connectionRef: started.connectionRef }), { code: 'revocation-pending' });
  fake.behaviour.revokeStatus = 200;
  const retried = await h.service.disconnect({ connectionRef: started.connectionRef });
  assert.deepEqual([retried.status, retried.remoteRevocation, fake.liveRefreshTokens()], ['disconnected', 'confirmed', []]);
});

test('revoke over the vault token store never reaches Google and reports not-needed (reported, not fixed)', async () => {
  // Jini disconnectApiConnection bumps the generation before revokeCredential loads the tokens, and
  // the vault store's load() returns null for an older generation, so the grant is never revoked.
  const h = await harness();
  const { started } = await signIn(h);
  const result = await h.service.disconnect({ connectionRef: started.connectionRef });
  assert.deepEqual([result.status, result.remoteRevocation, fake.requests.some((entry) => entry.path === '/revoke'), fake.liveRefreshTokens().length], ['disconnected', 'not-needed', false, 1]);
});

test('desktop: the installed-app sign-in forces consent without incremental grants, and re-consent replaces the old tokens', async () => {
  const h = await harness({ runtime: 'desktop' });
  const { started } = await signIn(h);
  const authorize = new URL(started.authorizationUrl);
  assert.deepEqual([authorize.searchParams.get('prompt'), authorize.searchParams.get('include_granted_scopes'), authorize.searchParams.get('scope')], ['consent', null, DRIVE_FILE]);
  const [oldRefresh] = fake.liveRefreshTokens();
  const again = await signIn(h);
  assert.equal(again.completed.outcome, 'connected');
  h.clock.now += 3600_000;
  await h.service.getAccessToken({ connectionRef: started.connectionRef });
  const used = tokenRequests().at(-1).get('refresh_token');
  assert.ok(used !== oldRefresh && fake.liveRefreshTokens().includes(used));
});

test('hosted incremental: include_granted_scopes=true and a grant carrying earlier scopes is accepted', async () => {
  const h = await harness();
  await signIn(h, { grantScopes: [DRIVE_FILE, 'https://www.googleapis.com/auth/earlier.scope'] });
  const { completed } = await signIn(h);
  assert.deepEqual(completed.grantedScopes, [DRIVE_FILE, 'https://www.googleapis.com/auth/earlier.scope']);
});

test('redaction: no token or client secret reaches status, connection records or the tool output', async () => {
  const h = await harness();
  const { started } = await signIn(h);
  const accessToken = await h.service.getAccessToken({ connectionRef: started.connectionRef });
  const [refreshToken] = fake.liveRefreshTokens();
  const capabilities = { connections: { getAccessToken: () => accessToken }, http: { fetch: fake.fetch }, limiter: { check: async () => ({ allowed: true }) } };
  const visible = JSON.stringify([await h.service.getStatus({ connectionRef: started.connectionRef }), [...h.records.records.values()],
    await accountInfo.invoke({ input: { connectionRef: started.connectionRef }, capabilities })]);
  for (const secret of [accessToken, refreshToken, CLIENTS.hosted.clientSecret]) assert.equal(visible.includes(secret), false);
});

test('redaction: a Google error that echoes request data becomes a fixed safe message', async () => {
  const echoed = `token ${'e'.repeat(12)} in Sheet1!A1`;
  fake.route({ method: 'GET', path: '/v4/spreadsheets/s-1' }, () => [400, { error: { code: 400, message: echoed, status: 'INVALID_ARGUMENT' } }]);
  const client = createGoogleClient({ http: { fetch: fake.fetch }, connections: { getAccessToken: async () => 'fake-access-token' } });
  await assert.rejects(client.request({ connectionRef: 'ref-1', url: 'https://sheets.googleapis.com/v4/spreadsheets/s-1', kind: 'read' }),
    (error) => error.code === 'invalid-request' && !JSON.stringify(error.toJSON()).includes(echoed) && !error.message.includes('Sheet1'));
});

test('transport: the test fetch refuses every host but Google\'s (no real third-party call is possible)', async () => {
  await assert.rejects(fake.fetch({ url: 'https://example.com/' }), /test transport refused https:\/\/example\.com/);
});

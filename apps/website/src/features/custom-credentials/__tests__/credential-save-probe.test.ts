/** S2/T3: plugin-owned probes run before sealing on create and rotate; failures preserve storage. */
import '../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import type { ToolExecutionContext } from '@jini-ai/core';
import { InMemoryKeyring } from '../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../webhooks/secret-sealer.aesgcm.js';
import { InMemoryCustomCredentialSetRepo } from '../repo.memory.js';
import { createCustomCredential, resolveCustomCredentialByLabel } from '../store.js';
import { buildApiCredentialSaveHandlers, type CustomCredentialsToolDeps } from '../tool-registrations.js';
import type { HttpRequest, HttpClientPort } from '../../../platform/http/index.js';
import { createHttpClient } from '../../../platform/http/client.js';
import { CUSTOM_CREDENTIALS_EGRESS_POLICY } from '../../../platform/http/egress-policies.js';
import { probeCredentialConnection } from '../credentialed-request.js';
import { loadFixtureAuthSchemes } from './fixture-auth-schemes.fixture.js';

const card = { providerId: 'example', pluginId: 'example', label: 'Example API', ownedApiLabel: 'Example API', category: 'ops',
  baseUrl: 'https://api.example.com/v1', probeUrl: 'https://api.example.com/user', title: 'Connect example',
  saveKind: 'api' as const, keyHint: 'Use an account read key.' };
const token = 'SECRET-NEW-credential-123456';
const oldToken = 'SECRET-OLD-credential-123456';

/** Real engine and encrypted memory vault; HTTP and human form submission are the only fakes. */
async function fixture({ rotate, status = 200, probe = true, abort = false, transportError = false, submitted = token, username, abortDuringSeal = false, legacy = false }: {
  rotate: boolean; status?: number; probe?: boolean; abort?: boolean; transportError?: boolean; submitted?: string; username?: string; abortDuringSeal?: boolean; legacy?: boolean;
}, _options = {}) {
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const inner = new AesGcmSecretSealer(keyring);
  const clock = createSystemClock(); const idGen = createRandomUuidGenerator();
  const workspaceId = 'probe-workspace';
  const writeDeps = { repo, sealer: inner, keyring, clock, idGen };
  if (rotate) await createCustomCredential(writeDeps, { workspaceId, label: card.label, category: 'ops', baseUrl: card.baseUrl,
    connection: { token: oldToken, ...(username ? { username } : {}) } });
  const before = await repo.listByWorkspace({ workspaceId });
  let seals = 0;
  const controller = new AbortController();
  const requests: Array<{ request: HttpRequest; options: Parameters<HttpClientPort['send']>[1] }> = [];
  const logs: string[] = [];
  const deps: CustomCredentialsToolDeps = {
    workspaceId, clock, idGen, customCredentialSetRepo: repo, siteAssistantSecretKeyring: keyring,
    siteAssistantSecretSealer: { open: (input, options) => inner.open(input, options), seal: async input => { seals++; const sealed = await inner.seal(input); if (abortDuringSeal) controller.abort(); return sealed; } },
    loadAuthSchemes: loadFixtureAuthSchemes,
    loadSourceControlProviders: async () => ({ list: () => [], get: () => undefined, refusals: [] }),
    loadPluginCredentialCards: async () => [{ ...card, probeUrl: probe ? card.probeUrl : undefined, saveKind: legacy ? undefined : card.saveKind }],
    authorize: async () => ({ allowed: true, reason: 'matched' }), customCredentialsFailureLog: line => logs.push(line),
    customCredentialsHttpClient: { send: async (request, options) => {
      assert.equal(seals, 0, 'the probe precedes sealing');
      requests.push({ request, options });
      if (abort) controller.abort();
      if (transportError) throw new Error(`transport echoed ${submitted}`);
      return { status, headers: {}, bodyText: `provider echoed ${submitted}` };
    } },
  };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock, idGenerator: idGen, defaultChannel: 'mcp-ui' });
  const handlers = buildApiCredentialSaveHandlers({ routeDeps: deps, surfaces: { surfaceExchanges } });
  let exchangeId = '';
  let emittedText = '';
  const pending = handlers[rotate ? 'rotate' : 'pluginProvider']({ executionId: 'probe-save', principal: { id: 'owner' }, run: { id: 'run-probe' },
    input: rotate ? { label: card.label } : { provider: card.providerId }, signal: controller.signal } as ToolExecutionContext, {
    emitSurface: async surface => {
      emittedText += JSON.stringify(surface);
      const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
      const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
      if (match) exchangeId = match[1]!;
    },
  });
  for (let tick = 0; tick < 100 && !exchangeId; tick++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(exchangeId, 'the real secret form opens');
  assert.ok(surfaceExchanges.deliver({ exchangeId, principalId: 'owner', params: { token: submitted } }, { toolId: 'credential_save' }));
  const result = await pending as Record<string, unknown>;
  const after = await repo.listByWorkspace({ workspaceId });
  assert.ok(!JSON.stringify([result, emittedText, logs]).includes(submitted), 'secrets stay out of results, surfaces and logs');
  const resolved = await resolveCustomCredentialByLabel({ repo, sealer: inner }, { workspaceId, label: card.label });
  return { result, requests, seals, before, after, resolved };
}

for (const rotate of [false, true]) {
  test(`ok probes once before sealing (${rotate ? 'rotate' : 'create'})`, async () => {
    const f = await fixture({ rotate });
    assert.equal(f.result[rotate ? 'saved' : 'created'], true);
    assert.equal(f.seals, 1);
    assert.equal(f.resolved?.connection.token, token);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0]!.request.method, 'GET');
    assert.equal(f.requests[0]!.request.url, card.probeUrl);
    assert.equal(f.requests[0]!.request.body, undefined);
    assert.equal(f.requests[0]!.request.headers.Authorization, `Bearer ${token}`);
    assert.deepEqual(f.requests[0]!.options, { redirect: 'error' });
  });
  for (const status of [401, 403, 503, 302]) test(`probe ${status} writes nothing (${rotate ? 'rotate' : 'create'})`, async () => {
    const f = await fixture({ rotate, status });
    assert.equal(f.result[rotate ? 'saved' : 'created'], false);
    assert.equal(f.seals, 0);
    assert.deepEqual(f.after, f.before);
    assert.equal(f.resolved?.connection.token, rotate ? oldToken : undefined);
    assert.match(String(f.result.message), status === 401 || status === 403 ? /refused.*This card needs: Use an account read key/ : /service couldn't be reached/);
    assert.equal(/previous key was kept/.test(String(f.result.message)), rotate);
  });
  test(`abort after probe writes nothing (${rotate ? 'rotate' : 'create'})`, async () => {
    const f = await fixture({ rotate, abort: true });
    assert.equal(f.seals, 0);
    assert.deepEqual(f.after, f.before);
    assert.notEqual(f.result[rotate ? 'saved' : 'created'], true);
  });
  test(`legacy card skips HTTP (${rotate ? 'rotate' : 'create'})`, async () => {
    const f = await fixture({ rotate, probe: false });
    assert.equal(f.result[rotate ? 'saved' : 'created'], true);
    assert.equal(f.requests.length, 0);
    assert.equal(f.resolved?.connection.token, token);
  });
  test(`transport failure is redacted and preserves storage (${rotate ? 'rotate' : 'create'})`, async () => {
    const f = await fixture({ rotate, transportError: true });
    assert.match(String(f.result.message), /service couldn't be reached/);
    assert.equal(f.seals, 0);
    assert.deepEqual(f.after, f.before);
  });
}

test('probe reuses the installed self-describing auth scheme instead of hard-coded Bearer', async () => {
  const f = await fixture({ rotate: false, submitted: 'ExampleV1SECRET-self-describing-123456' });
  assert.equal(f.requests[0]!.request.headers.Authorization, 'ExampleV1 SECRET-self-describing-123456');
});

test('rotation probe keeps Basic auth and the stored username', async () => {
  const f = await fixture({ rotate: true, username: 'account' });
  assert.equal(f.requests[0]!.request.headers.Authorization, `Basic ${Buffer.from(`account:${token}`).toString('base64')}`);
  assert.equal(f.resolved?.connection.username, 'account');
});

test('real guarded transport never follows a probe redirect, including a same-origin redirect', async () => {
  const requests: HttpRequest[] = [];
  const httpClient = createHttpClient({ policy: CUSTOM_CREDENTIALS_EGRESS_POLICY, transport: { requestPinned: async request => {
    requests.push(request);
    return { status: 302, headers: { location: 'https://api.example.com/redirected' }, bodyText: '' };
  } } }, { dns: { resolve: async () => ['93.184.216.34'] } });
  const status = await probeCredentialConnection({ connection: { token }, url: card.probeUrl, schemes: [] }, { httpClient });
  assert.equal(status, 'unavailable');
  assert.equal(requests.length, 1);
});

for (const rotate of [false, true]) test(`abort during seal cannot reach vault persistence (${rotate ? 'rotate' : 'create'})`, async () => {
  const f = await fixture({ rotate, abortDuringSeal: true });
  assert.equal(f.requests.length, 1);
  assert.equal(f.seals, 1);
  assert.deepEqual(f.after, f.before);
  assert.notEqual(f.result[rotate ? 'saved' : 'created'], true);
});

test('legacy implicit API ownership still probes on rotation', async () => {
  const f = await fixture({ rotate: true, legacy: true, status: 403 });
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.after, f.before);
});

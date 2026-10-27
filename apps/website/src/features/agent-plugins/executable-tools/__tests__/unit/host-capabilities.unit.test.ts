/**
 * @file Unit tests for `host-capabilities.ts`: the frozen-account map, the guarded plugin HTTP
 * (request shape, https-only, no redirects, bounded and never-truncated bodies, bodiless statuses),
 * the declared-origin gate, and the per-call capability scoping. Typed fakes only; no network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { HttpClientPort, HttpRequest, HttpResponse } from '@jini-ai/core/primitives';

import {
  HTTPS_ONLY_MESSAGE, RESPONSE_TOO_LARGE_MESSAGE, UNDECLARED_ORIGIN_MESSAGE,
  createAgentPluginToolCapabilities, createFrozenConnectionAccounts, createGuardedPluginHttp,
  type AgentPluginConnectionAccess, type AgentPluginConnectionTarget,
} from '../../host-capabilities.js';

type SendOptions = Parameters<HttpClientPort['send']>[1];

function recordingHttp(answer: Partial<HttpResponse> = {}) {
  const sent: Array<{ request: HttpRequest; options: SendOptions }> = [];
  const http: HttpClientPort = {
    async send({ request }, options) { sent.push({ request, options }); return { status: 200, headers: { 'content-type': 'application/json' }, bodyText: '{"ok":true}', ...answer }; },
  };
  return { http, sent };
}

function recordingConnections() {
  const tokenCalls: Array<{ target: AgentPluginConnectionTarget; optional: { expectedAccountId?: string } | undefined }> = [];
  const connections: AgentPluginConnectionAccess = {
    async readAccount() { return null; },
    async getAccessToken(target, optional) { tokenCalls.push({ target, optional }); return 'token-value'; },
  };
  return { connections, tokenCalls };
}

const SCOPE = { pluginId: 'acme-office', workspaceId: 'ws-1', signal: new AbortController().signal } as const;

function capabilitiesWith(options: { readonly http?: HttpClientPort; readonly origins?: readonly string[]; readonly originLookups?: Array<{ workspaceId: string; pluginId: string }> } = {}) {
  const { connections, tokenCalls } = recordingConnections();
  const frozen = createFrozenConnectionAccounts();
  const port = createAgentPluginToolCapabilities({
    connections, http: options.http ?? recordingHttp().http, limiter: { check: async () => ({ allowed: true }) }, frozen,
    state: () => ({ get: async () => null }),
    apiOrigins: async (scope) => { options.originLookups?.push(scope); return options.origins ?? ['https://api.acme.test']; },
  });
  return { port, frozen, tokenCalls };
}

test('frozen accounts: a bound signal returns its account for that connectionRef only', () => {
  const frozen = createFrozenConnectionAccounts();
  const signal = new AbortController().signal;
  frozen.bind({ signal, accounts: new Map([['conn-1', 'acct-7']]) });
  assert.equal(frozen.lookup({ signal, connectionRef: 'conn-1' }), 'acct-7');
  assert.equal(frozen.lookup({ signal, connectionRef: 'conn-2' }), undefined);
});

test('frozen accounts: another execution\'s signal sees nothing', () => {
  const frozen = createFrozenConnectionAccounts();
  frozen.bind({ signal: new AbortController().signal, accounts: new Map([['conn-1', 'acct-7']]) });
  assert.equal(frozen.lookup({ signal: new AbortController().signal, connectionRef: 'conn-1' }), undefined);
});

test('frozen accounts: a call without a signal is never matched to a frozen account', () => {
  const frozen = createFrozenConnectionAccounts();
  assert.equal(frozen.lookup({ signal: undefined, connectionRef: 'conn-1' }), undefined);
});

test('guarded HTTP: a bare call is a bounded GET with no body, no signal and redirects refused', async () => {
  const { http, sent } = recordingHttp();
  await createGuardedPluginHttp({ http }).fetch({ url: 'https://api.acme.test/v1/rows' });
  assert.deepEqual(sent, [{
    request: { url: 'https://api.acme.test/v1/rows', method: 'GET', headers: {}, idleTimeoutMs: 30_000, maxResponseBytes: 1024 * 1024 },
    options: { redirect: 'error' },
  }]);
});

test('guarded HTTP: method, headers, body and signal are passed through when given', async () => {
  const { http, sent } = recordingHttp();
  const signal = new AbortController().signal;
  await createGuardedPluginHttp({ http }).fetch({ url: 'https://api.acme.test/v1/rows' }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '[1]', signal });
  assert.equal(sent[0]!.request.method, 'POST');
  assert.deepEqual(sent[0]!.request.headers, { 'content-type': 'application/json' });
  assert.equal(sent[0]!.request.body, '[1]');
  assert.equal(sent[0]!.request.signal, signal);
});

test('guarded HTTP: the answer becomes a Response with its status, headers and body text', async () => {
  const { http } = recordingHttp({ status: 201, headers: { 'x-request-id': 'r-1' }, bodyText: '{"id":3}' });
  const response = await createGuardedPluginHttp({ http }).fetch({ url: 'https://api.acme.test/v1/rows' });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-request-id'), 'r-1');
  assert.deepEqual(await response.json(), { id: 3 });
});

for (const status of [204, 205, 304]) {
  test(`guarded HTTP: a ${status} answer becomes a bodiless Response (fetch forbids a body there)`, async () => {
    const { http } = recordingHttp({ status, bodyText: '' });
    const response = await createGuardedPluginHttp({ http }).fetch({ url: 'https://api.acme.test/v1/rows' });
    assert.equal(response.status, status);
    assert.equal(response.body, null);
  });
}

test('guarded HTTP: a truncated body is refused instead of returning part of it', async () => {
  const { http } = recordingHttp({ bodyText: '{"rows":[', bodyTruncated: true });
  await assert.rejects(createGuardedPluginHttp({ http }).fetch({ url: 'https://api.acme.test/v1/rows' }), { message: RESPONSE_TOO_LARGE_MESSAGE });
});

test('security: guarded HTTP refuses a plaintext URL before anything is sent', async () => {
  const { http, sent } = recordingHttp();
  await assert.rejects(createGuardedPluginHttp({ http }).fetch({ url: 'http://api.acme.test/v1/rows' }), { message: HTTPS_ONLY_MESSAGE });
  assert.deepEqual(sent, []);
});

test('tool HTTP: a declared origin is reached, looked up for the calling plugin and workspace', async () => {
  const { http, sent } = recordingHttp();
  const originLookups: Array<{ workspaceId: string; pluginId: string }> = [];
  const { port } = capabilitiesWith({ http, originLookups });
  await port(SCOPE).http.fetch({ url: 'https://api.acme.test/v1/rows' });
  assert.equal(sent.length, 1);
  assert.deepEqual(originLookups, [{ workspaceId: 'ws-1', pluginId: 'acme-office' }]);
});

test('security: tool HTTP compares whole origins, so a declared host on another port is refused', async () => {
  const { http, sent } = recordingHttp();
  const { port } = capabilitiesWith({ http });
  await assert.rejects(port(SCOPE).http.fetch({ url: 'https://api.acme.test:8443/v1/rows' }), { message: UNDECLARED_ORIGIN_MESSAGE });
  assert.deepEqual(sent, []);
});

test('tool HTTP: a plaintext URL keeps the https-only message and needs no origin lookup', async () => {
  const originLookups: Array<{ workspaceId: string; pluginId: string }> = [];
  const { port } = capabilitiesWith({ originLookups });
  await assert.rejects(port(SCOPE).http.fetch({ url: 'http://api.acme.test/v1/rows' }), { message: HTTPS_ONLY_MESSAGE });
  assert.deepEqual(originLookups, []);
});

test('tokens: an unconfirmed call asks without an expected account', async () => {
  const { port, tokenCalls } = capabilitiesWith();
  assert.equal(await port(SCOPE).connections.getAccessToken({ connectionRef: 'conn-1' }), 'token-value');
  assert.deepEqual(tokenCalls, [{ target: { workspaceId: 'ws-1', pluginId: 'acme-office', connectionRef: 'conn-1' }, optional: {} }]);
});

test('tokens: a confirmed call asks for the account frozen against its own signal', async () => {
  const { port, frozen, tokenCalls } = capabilitiesWith();
  frozen.bind({ signal: SCOPE.signal, accounts: new Map([['conn-1', 'acct-7']]) });
  await port(SCOPE).connections.getAccessToken({ connectionRef: 'conn-1' });
  assert.deepEqual(tokenCalls[0]!.optional, { expectedAccountId: 'acct-7' });
});

test('T13: a confirmed call refuses a token for a connection absent from its frozen approval', async () => {
  const { port, frozen, tokenCalls } = capabilitiesWith();
  const signal = new AbortController().signal;
  frozen.bind({ signal, accounts: new Map([['conn-1', 'acct-7']]) });

  // The accessor accepts both refs as plugin-owned. Only conn-1 was approved for this call.
  await assert.rejects(port({ ...SCOPE, signal }).connections.getAccessToken({ connectionRef: 'conn-2' }), Error);
  assert.deepEqual(tokenCalls, [], 'an unapproved connection must be refused before requesting its token');
});

test('T23: aborting a tool propagates to its in-flight HTTP request even with a plugin signal', async () => {
  const started = Promise.withResolvers<HttpRequest>();
  const reply = Promise.withResolvers<HttpResponse>();
  const http: HttpClientPort = { async send({ request }) { started.resolve(request); return reply.promise; } };
  const { port } = capabilitiesWith({ http });
  const tool = new AbortController();
  const plugin = new AbortController();
  const pending = port({ ...SCOPE, signal: tool.signal }).http.fetch(
    { url: 'https://api.acme.test/v1/rows' }, { signal: plugin.signal },
  );
  try {
    const request = await started.promise;
    const reason = new Error('tool cancelled');
    tool.abort(reason);

    assert.equal(request.signal?.aborted, true);
    assert.equal(request.signal?.reason, reason);
    assert.equal(plugin.signal.aborted, false, 'cancelling the tool must not mutate the plugin controller');
  } finally {
    reply.resolve({ status: 200, headers: {}, bodyText: '{}' });
    await pending;
  }
});

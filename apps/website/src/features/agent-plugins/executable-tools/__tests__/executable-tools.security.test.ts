/**
 * @file Security pins for executable Agent Plugin tools (phase A): connection ownership scoping,
 * the frozen account, guarded HTTP, limiter isolation, confirmation before any external write,
 * activation and authorization rechecks, and the MCP-UI callback accepting only exchange answers.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { isMcpUiToolCallPermitted } from '../../../../assistant/mcp-ui-tool-calls.js';
import { NOT_CONNECTED_MESSAGE } from '../approval.js';
import { createAgentPluginToolCapabilities, createFrozenConnectionAccounts, HTTPS_ONLY_MESSAGE, RESPONSE_TOO_LARGE_MESSAGE, type AgentPluginStateReaderFor } from '../host-capabilities.js';
import { bootFixture, fakeConnections, fakeHttp, startConfirmingCall, PLUGIN, WORKSPACE } from './fixtures.js';
import type { HttpClientPort } from '@jini-ai/core/primitives';

const WRITE = 'p_acme_office__append_rows';
const READ = 'p_acme_office__read_rows';
const input = { connectionRef: 'conn-1', table: 'Leads', values: ['a'] };
const limiterKeys: string[] = [];
const recordingLimiter = { check: async ({ key }: { key: string }) => { limiterKeys.push(key); return { allowed: true as const }; } };

function portFor(http: HttpClientPort = fakeHttp().http, state: AgentPluginStateReaderFor = () => ({ get: async () => null })) {
  const { connections, tokenRequests } = fakeConnections({ accountId: 'alice' });
  const frozen = createFrozenConnectionAccounts();
  // Only PLUGIN declares an API origin (its connections' `apiOrigins`, as the host reports them).
  const apiOrigins = async ({ pluginId }: { readonly pluginId: string }) => (pluginId === PLUGIN ? ['https://api.acme.test'] : []);
  return { port: createAgentPluginToolCapabilities({ connections, http, limiter: recordingLimiter, frozen, state, apiOrigins }), tokenRequests, frozen };
}

test('a token request always names the calling plugin and workspace, never one the plugin chose', async () => {
  const { port, tokenRequests } = portFor();
  await assert.rejects(port({ pluginId: 'other-plugin', workspaceId: WORKSPACE }).connections.getAccessToken({ connectionRef: 'conn-1' }), { message: 'connection not found' });
  assert.deepEqual(tokenRequests[0]?.target, { workspaceId: WORKSPACE, pluginId: 'other-plugin', connectionRef: 'conn-1' });
});

test('a call bound to a frozen account asks the accessor for exactly that account', async () => {
  const { port, tokenRequests, frozen } = portFor();
  const signal = new AbortController().signal;
  frozen.bind({ signal, accounts: new Map([['conn-1', 'alice']]) });
  await port({ pluginId: PLUGIN, workspaceId: WORKSPACE, signal }).connections.getAccessToken({ connectionRef: 'conn-1' });
  assert.equal(tokenRequests[0]?.expectedAccountId, 'alice');
});

test('plugin HTTP refuses non-https URLs before sending anything', async () => {
  const { http, requests } = fakeHttp();
  await assert.rejects(portFor(http).port({ pluginId: PLUGIN, workspaceId: WORKSPACE }).http.fetch({ url: 'http://api.acme.test/x' }), { message: HTTPS_ONLY_MESSAGE });
  assert.equal(requests.length, 0);
});

test('security: plugin HTTP refuses an origin the calling plugin does not declare, before sending anything', async () => {
  const { http, requests } = fakeHttp();
  const { port } = portFor(http);
  const undeclared = { message: /only call the API addresses their plugin declares/ };
  await assert.rejects(port({ pluginId: PLUGIN, workspaceId: WORKSPACE }).http.fetch({ url: 'https://elsewhere.example/x' }), undeclared);
  await assert.rejects(port({ pluginId: 'other-plugin', workspaceId: WORKSPACE }).http.fetch({ url: 'https://api.acme.test/x' }), undeclared, 'origins are per plugin');
  assert.equal(requests.length, 0);
  await port({ pluginId: PLUGIN, workspaceId: WORKSPACE }).http.fetch({ url: 'https://api.acme.test/x' });
  assert.deepEqual(requests.map((request) => request.url), ['https://api.acme.test/x']);
});

test('plugin HTTP never follows redirects and refuses a truncated body instead of returning part of it', async () => {
  const seen: unknown[] = [];
  const http: HttpClientPort = { async send(_required, optional) { seen.push(optional?.redirect); return { status: 200, headers: {}, bodyText: '{"partial"', bodyTruncated: true }; } };
  await assert.rejects(portFor(http).port({ pluginId: PLUGIN, workspaceId: WORKSPACE }).http.fetch({ url: 'https://api.acme.test/x' }), { message: RESPONSE_TOO_LARGE_MESSAGE });
  assert.deepEqual(seen, ['error']);
});

test('limiter keys are namespaced by workspace and plugin, so one plugin cannot spend another budget', async () => {
  limiterKeys.length = 0;
  const { port } = portFor();
  await port({ pluginId: 'a', workspaceId: WORKSPACE }).limiter.check({ key: 'user' });
  await port({ pluginId: 'b', workspaceId: WORKSPACE }).limiter.check({ key: 'user' });
  assert.deepEqual(limiterKeys, [`${WORKSPACE}\u0000a\u0000user`, `${WORKSPACE}\u0000b\u0000user`]);
});

test('no artifact store bound: the artifacts capability is absent, so a tool can refuse before any work', () => {
  assert.equal('artifacts' in portFor().port({ pluginId: PLUGIN, workspaceId: WORKSPACE }), false);
});

test('an artifact store bound: a write is stored under the calling plugin and workspace, never ones the plugin names', async () => {
  const written: unknown[] = [];
  const { connections } = fakeConnections({ accountId: 'alice' });
  const port = createAgentPluginToolCapabilities(
    { connections, http: fakeHttp().http, limiter: recordingLimiter, frozen: createFrozenConnectionAccounts(), state: () => ({ get: async () => null }), apiOrigins: async () => [] },
    { artifacts: { write: async (file) => { written.push(file); return { artifactRef: 'a-1' }; } } },
  );
  const forged = { name: 'x.csv', mediaType: 'text/csv', content: 'a', workspaceId: 'other-ws', pluginId: 'other-plugin' };
  assert.deepEqual(await port({ pluginId: PLUGIN, workspaceId: WORKSPACE }).artifacts?.write(forged), { artifactRef: 'a-1' });
  assert.deepEqual(written, [{ ...forged, workspaceId: WORKSPACE, pluginId: PLUGIN }]);
});

test('a write call refuses when no human can be asked, and nothing runs', async () => {
  const fixture = await bootFixture();
  const result = await fixture.executor.execute({ toolId: WRITE, principal: { id: 'owner' }, run: { id: 'run' }, input });
  assert.equal(result.status, 'failed');
  assert.match(String(result.error), /NO_CONFIRMATION_CHANNEL/);
  assert.equal(fixture.calls.length, 0);
});

test('a cancelled write call changes nothing and requests no token', async () => {
  const fixture = await bootFixture();
  const call = await startConfirmingCall(fixture, WRITE, input);
  call.answer('cancel');
  assert.equal((await call.pending).status, 'completed');
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.tokenRequests.length, 0);
});

test('an account switched after confirmation is refused at token time, so the write never runs', async () => {
  const fixture = await bootFixture();
  const call = await startConfirmingCall(fixture, WRITE, input);
  fixture.account.accountId = 'mallory';
  call.answer('confirm');
  const result = await call.pending;
  assert.equal(result.status, 'failed');
  assert.match(String(result.error), /account-changed/);
  assert.equal(fixture.calls.length, 0);
});

test('a connectionRef inside payload data is data: the card shows the call\'s own account and the write runs', async () => {
  const fixture = await bootFixture();
  const call = await startConfirmingCall(fixture, WRITE, { ...input, note: { connectionRef: 'invoice-123' } });
  assert.deepEqual(call.rows.filter(([label]) => label === 'Account'), [['Account', 'alice@acme.test']]);
  call.answer('confirm');
  assert.equal((await call.pending).status, 'completed');
  assert.deepEqual(fixture.tokenRequests.map(request => request.target.connectionRef), ['conn-1']);
});

test('a confirmed call that waited on the card still asks for the account it showed (the freeze survives the park)', async () => {
  const fixture = await bootFixture();
  const call = await startConfirmingCall(fixture, WRITE, input);
  call.answer('confirm');
  assert.equal((await call.pending).status, 'completed');
  assert.deepEqual(fixture.tokenRequests, [{ target: { workspaceId: WORKSPACE, pluginId: PLUGIN, connectionRef: 'conn-1' }, expectedAccountId: 'alice' }]);
});

test('a connection that is not connected is refused before the card, and nothing runs', async () => {
  const fixture = await bootFixture();
  const call = await startConfirmingCall(fixture, WRITE, { ...input, connectionRef: 'conn-unknown' });
  try {
    // startConfirmingCall returns as soon as a card is shown OR the call settles, so this fails at once
    // when the guard is broken instead of after the exchange's multi-minute timeout.
    assert.equal(call.html, '', 'no confirmation card for a connection that is not connected');
  } finally {
    // A broken guard parks the call on the card: release it so the run ends now.
    if (call.html !== '') await call.answer('cancel');
  }
  const result = await call.pending;
  assert.equal(result.status, 'failed');
  assert.equal(result.error, NOT_CONNECTED_MESSAGE);
  assert.equal(fixture.calls.length, 0);
});

test('a plugin disabled after boot is denied for read and write tools', async () => {
  let active = true;
  const fixture = await bootFixture({ active: () => active });
  active = false;
  for (const toolId of [READ, WRITE]) {
    const result = await fixture.executor.execute({ toolId, principal: { id: 'owner' }, run: { id: 'run' }, input });
    assert.equal(result.status, 'denied', toolId);
  }
  assert.equal(fixture.calls.length, 0);
});

test('a principal without admin.assistant.use is refused before the tool runs', async () => {
  const asked: string[] = [];
  const fixture = await bootFixture({ authorize: async ({ permission }) => { asked.push(permission); return { allowed: false, reason: 'no' }; } });
  const result = await fixture.executor.execute({ toolId: READ, principal: { id: 'guest' }, run: { id: 'run' }, input });
  // The permission refusal throws inside authorization; the executor records it as a failed,
  // never-executed call (the same fail-closed outcome as other plugin tools).
  assert.deepEqual({ status: result.status, error: result.error }, { status: 'failed', error: 'authorization failed' });
  assert.deepEqual(asked, ['admin.assistant.use']);
  assert.equal(fixture.calls.length, 0);
});

test('the MCP-UI callback accepts a plugin tool id only as an answer to a parked exchange', () => {
  assert.equal(isMcpUiToolCallPermitted(WRITE, true), true);
  assert.equal(isMcpUiToolCallPermitted(WRITE, false), false);
  assert.equal(isMcpUiToolCallPermitted('p_acme_office', true), false);
  assert.equal(isMcpUiToolCallPermitted('p_Acme__x', true), false);
});

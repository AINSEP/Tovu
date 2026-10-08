import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryKeyring } from '../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../webhooks/secret-sealer.aesgcm.js';
import { InMemoryExternalMcpServerRepo } from '../../../assistant/external-mcp-store.memory.js';
import { saveExternalMcpServer, readEnabledExternalMcpConfigs } from '../../../assistant/external-mcp-store.js';
import { probeExternalMcpServer } from '../../../server/runtime/services/external-mcp-probe.js';
import { buildExternalMcpRegistrations } from '../../external-mcp/tool-registrations.js';
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { SealedDatabaseDestinationStore, type DatabaseDestinationRecord } from '../../database-transfer/destination-store.js';
import { createDestinationExchangeReporter } from '../../database-transfer/destination-exchange.js';
import { buildDestinationForm, SET_DESTINATION_TOOL_ID } from '../../database-transfer/destination-ui.js';
import { CREDENTIAL_MESSAGES } from '../../../contracts/core/credential-token.js';
import { McpProtocolError } from '@jini-ai/mcp/federation';
import type { SurfaceEmission } from '@jini-ai/core';
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


const workspaceId = 'credential-probe';
const clock = { nowMs: () => 0, nowIso: () => '1970-01-01T00:00:00.000Z' };
function cryptoDeps() {
  const keyring = new InMemoryKeyring(); return { keyring, sealer: new AesGcmSecretSealer(keyring) };
}
async function fixture() {
  const deps = { ...cryptoDeps(), repo: new InMemoryExternalMcpServerRepo(), clock };
  await saveExternalMcpServer(deps, { workspaceId, serverId: 'fixture', label: 'Fixture', transport: 'streamable_http', authMode: 'static_env', command: '', args: '', url: 'https://example.test/mcp', accessToken: 'fixture-credential-a9F2', allowedToolNames: '', principalId: 'owner', enabled: true });
  return { workspaceId, clock, externalMcpServerRepo: deps.repo, siteAssistantSecretSealer: deps.sealer };
}
for (const status of [401, 403]) test(`hosted probe maps ${status} to auth, without echoing upstream text`, async () => {
  const deps = await fixture();
  const result = await probeExternalMcpServer({ ...deps, connect: async () => { throw Object.assign(new Error('hostile upstream credential body'), { status }); } }, 'fixture');
  assert.deepEqual(result, { ok: false, status: 401, body: { error: 'The server rejected this token.', code: 'MCP_AUTH_REJECTED' } });
});
for (const [name, expected] of [['AbortError', 'timeout'], ['TimeoutError', 'timeout'], ['Error', 'unreachable']] as const) test(`hosted probe distinguishes ${name}`, async () => {
  const deps = await fixture();
  const result = await probeExternalMcpServer({ ...deps, connect: async () => { const error = new Error('upstream private text'); error.name = name; throw error; } }, 'fixture');
  assert.deepEqual(result, { ok: false, status: expected === 'timeout' ? 504 : 502, body: { error: expected === 'timeout' ? 'The connection timed out.' : 'Could not reach the server.', code: expected === 'timeout' ? 'MCP_TIMEOUT' : 'MCP_SERVER_UNREACHABLE' } });
});
test('a successful hosted probe closes its session', async () => {
  const deps = await fixture(); let closed = 0;
  const result = await probeExternalMcpServer({ ...deps, connect: async () => ({ listTools: async () => [], callTool: async () => { throw new Error('unused'); }, close: async () => { closed++; } }) }, 'fixture');
  assert.equal(result.ok, true); assert.equal(closed, 1);
});
async function submitCard({ transport = 'streamable_http', token, code = 'MCP_AUTH_REJECTED' }: { transport?: 'streamable_http' | 'stdio'; token: string; code?: string }) {
  const crypto = cryptoDeps(); const repo = new InMemoryExternalMcpServerRepo(); const exchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }); const emissions: SurfaceEmission[] = []; let probes = 0;
  const deps = { workspaceId, clock, externalMcpServerRepo: repo, siteAssistantSecretSealer: crypto.sealer, siteAssistantSecretKeyring: crypto.keyring, authorize: async () => ({ allowed: true, reason: 'matched' }), externalMcpProbe: async () => {
    probes++;
    assert.equal((await repo.listByWorkspaceId(workspaceId)).length, 1, 'probe runs only after save');
    return { ok: code === 'connected', body: { code } };
  } };
  const registration = buildExternalMcpRegistrations(deps, { surfaceExchanges: exchanges }).find(entry => entry.descriptor.id === 'external_mcp_save')!;
  const pending = registration.handler({ executionId: 'fixture', principal: { id: 'owner' }, run: { id: 'run' }, input: { id: 'fixture', transport, authMode: 'static_env', ...(transport === 'stdio' ? { command: 'node' } : { url: 'https://example.test/mcp' }) }, signal: new AbortController().signal }, { emitSurface: async emission => { emissions.push(emission); } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(emissions.length, 1);
  const html = (emissions[0]!.payload as { resource: { resource: { text: string } } }).resource.resource.text;
  const id = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)?.[1]; assert.ok(id);
  exchanges.deliver({ exchangeId: id, principalId: 'owner', params: { id: 'fixture', transport, authMode: 'static_env', enabled: true, command: transport === 'stdio' ? 'node' : '', url: 'https://example.test/mcp', args: '', allowedToolNames: '', accessToken: token, accessTokenEnvName: 'ACCESS_TOKEN' } }, { toolId: 'external_mcp_save' });
  const result = await pending as Record<string, unknown>;
  return { result, probes, emissions, repo, sealer: crypto.sealer };
}
test('chat card saves then probes; reports auth separately and includes the server-derived hint', async () => {
  const token = 'x'.repeat(1180) + 'a9F2';
  const answer = await submitCard({ token });
  assert.equal(answer.probes, 1); assert.equal(answer.result.saved, true);
  assert.equal(answer.result.message, '…a9F2, 1,184 chars. The server rejected this token.');
  assert.equal(answer.emissions.length, 2);
  assert.equal(JSON.stringify(answer.emissions).includes(token), false);
  assert.equal(JSON.stringify(answer.result).includes(token), false);
  const { configs } = await readEnabledExternalMcpConfigs(answer, workspaceId);
  const target = configs[0]?.target;
  assert.equal(target?.kind === 'streamable_http' && target.headers.authorization === `Bearer ${token}`, true, 'the rejected token is still durably saved');
});
test('chat stdio card has no probe target and explicitly says saved, not tested', async () => {
  const answer = await submitCard({ transport: 'stdio', token: 'short' });
  assert.equal(answer.probes, 0); assert.equal(answer.result.message, '5 chars. Saved, not tested.');
});
for (const [token, message] of [['   ', CREDENTIAL_MESSAGES.blank], ['x'.repeat(8193), CREDENTIAL_MESSAGES.limit], ['café', CREDENTIAL_MESSAGES.ascii]]) test(`chat validation precedes probe (${message})`, async () => {
  const answer = await submitCard({ token });
  assert.equal(answer.probes, 0); assert.equal(answer.result.saved, false); assert.equal(answer.result.message, message);
  assert.equal((await answer.repo.listByWorkspaceId(workspaceId)).length, 0);
});
test('database destination uses real sealing, keeps blank updates, refuses whitespace, and derives a safe outcome hint', async () => {
  const crypto = cryptoDeps(); let row: DatabaseDestinationRecord | null = null;
  const store = new SealedDatabaseDestinationStore({ ...crypto, repo: { find: async () => row, upsert: async record => { row = record; }, setLastRun: async () => {} } });
  const address = 'postgres://owner:canary-password@example.test:5432/project';
  const description = { host: 'example.test', port: '5432', database: 'project', user: 'owner' };
  const destination = (connectionString: string) => ({ connectionString, description, savedAt: clock.nowIso() });
  await store.save(workspaceId, destination(` \n${address}\n `));
  assert.equal((await store.get(workspaceId))?.connectionString === address, true, 'sealed URI round-trip is exact');
  await store.save(workspaceId, destination(''));
  await assert.rejects(store.save(workspaceId, destination('   ')), (error: unknown) => error instanceof Error && error.message === CREDENTIAL_MESSAGES.blank);
  assert.equal((await store.get(workspaceId))?.connectionString === address, true, 'bad updates do not clear the URI');
  const exchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }); const emitted: SurfaceEmission[] = [];
  const exchange = exchanges.open({ binding: { toolId: SET_DESTINATION_TOOL_ID, principalId: 'owner' }, emit: async emission => { emitted.push(emission); } });
  const report = createDestinationExchangeReporter({ store, workspaceId });
  const pending = report({ exchange, confirmationEmission: { channel: 'mcp-ui', payload: { resource: buildDestinationForm(exchange.id) } }, handle: async () => ({ result: { saved: true } }) });
  await new Promise(resolve => setImmediate(resolve));
  exchanges.deliver({ exchangeId: exchange.id, principalId: 'owner', params: {} }, { toolId: SET_DESTINATION_TOOL_ID });
  const result = await pending;
  assert.equal(JSON.stringify(result).includes(address), false);
  assert.equal(emitted.length, 2);
  assert.equal(JSON.stringify(emitted).includes('canary-password'), false);
  assert.equal(JSON.stringify(emitted).includes('Connected.'), true);
});

test('publish verifier validates before probing and maps 401/403 independently of provider reason', async () => {
  const { verifyPublishCredential, InMemoryPublishCredentialVerificationCache } = await import('../../deployments/static-publish/verify.js');
  let probes = 0; let status = 401; let value = 'fixture-credential-a9F2';
  const target = {
    pluginId: 'fixture',
    descriptor: { id: 'fixture-host', label: 'Fixture', module: 'fixture.mjs', configFields: [], credential: { vendorId: 'fixture', tokenField: 'apiKey', fields: [{ name: 'apiKey', label: 'Key', required: true, secret: true }] } },
    module: { create: () => { throw new Error('unused'); }, verifyCredential: async () => { probes++; return { ok: false as const, reason: 'unreachable' as const, statusCode: status }; } },
  };
  const deps = {
    clock, cache: new InMemoryPublishCredentialVerificationCache(),
    credentialSource: { isConfigured: async () => ({ configured: true as const }), resolve: async () => ({ ok: true as const, token: value }) },
    loadDeployTargets: async () => ({ list: () => [target], get: () => target, refusals: [] }),
  };
  for (const code of [401, 403]) {
    status = code;
    const result = await verifyPublishCredential(deps, { workspaceId, target: 'fixture-host' });
    assert.equal(result?.status, 'invalid'); assert.equal(result?.message, 'The server rejected this token.');
  }
  assert.equal(probes, 2);
  value = 'x'.repeat(8193);
  const refused = await verifyPublishCredential(deps, { workspaceId, target: 'fixture-host' });
  assert.equal(refused?.message, CREDENTIAL_MESSAGES.limit); assert.equal(probes, 2);
});

test('Jini protocol HTTP 403 is an auth verdict at the connection-check boundary', async () => {
  const deps = await fixture();
  const result = await probeExternalMcpServer({ ...deps, connect: async () => { throw new McpProtocolError({ message: "mcp-federation: the server answered 'initialize' with HTTP 403" }); } }, 'fixture');
  assert.deepEqual(result, { ok: false, status: 401, body: { error: 'The server rejected this token.', code: 'MCP_AUTH_REJECTED' } });
});

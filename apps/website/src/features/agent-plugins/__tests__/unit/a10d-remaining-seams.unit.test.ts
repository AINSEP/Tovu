import assert from 'node:assert/strict';
import test from 'node:test';
import { createSystemClock } from '@jini-ai/core/primitives';
import { ToolInputError } from '@jini-ai/core';
import { InMemoryExternalMcpServerRepo } from '../../../external-mcp/external-mcp-store.memory.js';
import { applyExternalMcpAccess, saveExternalMcpServer } from '../../../external-mcp/external-mcp-store.js';
import { InMemoryKeyring } from '../../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../../webhooks/secret-sealer.aesgcm.js';
import { agentPluginMcpProjections } from '../../mcp-host-bindings.js';
import { grantDeclaredToolsAtBoot, grantDeclaredToolsToSignedInRows, type GrantSignedInDefaultsDeps } from '@jini-ai/agent-plugins/connect';
import { importAgentPluginAccessToken, importAgentPluginAccessTokensFromEnv, listInstalledAgentPluginServers, type ImportAgentPluginAccessTokensFromEnvDeps } from '@jini-ai/agent-plugins/connect';
import type { AgentPluginMcpSave } from '@jini-ai/agent-plugins/connect';
import type { McpServerConfig } from '@jini-ai/agent-plugins/lifecycle';

const servers: Readonly<Record<string, McpServerConfig>> = { crm: { type: 'streamable-http', url: 'https://crm.acme.test/mcp', authMode: 'oauth', defaultTools: { allow: ['read'], write: ['read'] }, tokenAuth: { helpUrl: 'https://crm.acme.test/token', probeUrl: 'https://crm.acme.test/me', importFromEnv: 'ACME_TOKEN', retiredEnv: ['ACME_OLD'] } } };
async function fixture() {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring(); const clock = createSystemClock();
  const store = { repo, keyring, clock, sealer: new AesGcmSecretSealer(keyring) };
  await saveExternalMcpServer(store, { workspaceId: 'acme', serverId: 'crm', label: 'Acme', transport: 'streamable_http', authMode: 'oauth', enabled: false, command: '', args: '', url: 'https://crm.acme.test/mcp', allowedToolNames: '', writeAllowedToolNames: '', oauth: { grant: 'authorization_code' }, principalId: 'owner', provisionedByPluginId: 'crm-plugin' });
  const row = (await repo.findByServerId({ workspaceId: 'acme', serverId: 'crm' }))!;
  await repo.upsert({ ...row, oauthStatus: 'connected' });
  const saved: AgentPluginMcpSave[] = []; const calls: string[] = []; const warnings: string[] = []; const infos: string[] = [];
  const projections = { ...agentPluginMcpProjections, oauthStatus: (input: { oauthStatus: string | null }) => { calls.push('acme:oauth'); return agentPluginMcpProjections.oauthStatus(input); } };
  const grant: GrantSignedInDefaultsDeps = { workspaceId: 'acme', repo, clock, projections, classifyError: () => 'other', applyAccess: input => applyExternalMcpAccess({ ...input, repo, clock }), resolveServers: async () => servers, enablePlugin: async () => { calls.push('activate'); }, isPluginOffByOperator: async () => false, actors: { connectDefaults: 'acme:defaults', connectDeclined: 'acme:declined' }, notifyRosterChanged: async () => { calls.push('roster'); }, warn: message => warnings.push(message), approvedFailure: ({ connectionId, detail }) => `acme enable ${connectionId}: ${detail}` };
  const deps: ImportAgentPluginAccessTokensFromEnvDeps = { workspaceId: 'acme', mcp: { repo, projections, classifyError: () => 'other', saveServer: input => { saved.push(input); return saveExternalMcpServer(store, input); } }, resolveInstalledPlugin: async () => ({ servers }), federation: { classifyTrust: () => 'auto-admit', messages: { sseTransportUnsupported: () => 'acme no sse', headersUnsupported: () => 'acme no headers' } }, messages: { connectionNotSetUp: () => 'acme missing', connectionRepointed: () => 'acme repointed', notInstalled: () => 'acme not installed', noTokenSignIn: () => 'acme no token', multipleTokenSignIns: () => 'acme many tokens', serverNotSetUp: () => 'acme no server' }, importActor: 'acme:import', switchOnSavedToken: async () => { calls.push('switch'); return { state: 'on' }; }, listPlugins: async () => [{ pluginId: 'crm-plugin', bundled: true, servers }], importMessages: { pluginsScreen: 'Acme Connections', failed: ({ envName, pluginId }) => `acme could not copy ${envName} to ${pluginId}` } };
  const log = { info: (message: string) => infos.push(message), warn: (message: string) => warnings.push(message) };
  return { repo, calls, warnings, infos, grant, deps, log, saved };
}

test('other host grant uses its projection pair and saved actor, skips failed servers, and preserves explicit decline', async () => {
  const f = await fixture();
  assert.deepEqual(await grantDeclaredToolsToSignedInRows({ deps: f.grant, pluginId: 'crm-plugin', servers }, { skipServerKeys: ['crm'] }), []);
  assert.equal(f.calls.length, 0);
  const row = (await f.repo.findByServerId({ workspaceId: 'acme', serverId: 'crm' }))!;
  await f.repo.upsert({ ...row, writeGrantsUpdatedByPrincipalId: 'acme:declined' });
  let declinedCalls = 0;
  assert.deepEqual(await grantDeclaredToolsToSignedInRows({ deps: { ...f.grant, onConnected: async () => { declinedCalls += 1; } }, pluginId: 'crm-plugin', servers }), []);
  assert.equal(declinedCalls, 0, 'a declined row is withheld even from the supplied grant callback');
  assert.ok(f.calls.includes('acme:oauth')); assert.ok(!f.calls.includes('activate'));
  await f.repo.upsert({ ...row, writeGrantsUpdatedByPrincipalId: null });
  assert.deepEqual(await grantDeclaredToolsToSignedInRows({ deps: f.grant, pluginId: 'crm-plugin', servers }), ['crm']);
  const after = (await f.repo.findByServerId({ workspaceId: 'acme', serverId: 'crm' }))!;
  assert.equal(after.writeGrantsUpdatedByPrincipalId, 'acme:defaults');
  assert.equal(after.allowedToolNames, '["read"]');
  assert.deepEqual(f.calls.slice(-2), ['activate', 'roster']);
});

test('approved grant failure uses safe host guidance; advisory healing warns and continues', async () => {
  const f = await fixture(); const fault = new Error('storage failed');
  const deps = { ...f.grant, onConnected: async () => { throw fault; } };
  await grantDeclaredToolsToSignedInRows({ deps, pluginId: 'crm-plugin', servers });
  assert.equal(f.warnings.length, 1); assert.match(f.warnings[0]!, /storage failed/);
  await assert.rejects(grantDeclaredToolsToSignedInRows({ deps, pluginId: 'crm-plugin', servers }, { approvedEnable: { principalId: 'owner', accessKey: 'approved' } }), error => error instanceof ToolInputError && error.message === 'acme enable crm: storage failed');
});

test('boot reads one host snapshot after listing and never grants an off plugin or a previously attributed row', async () => {
  const f = await fixture(); const order: string[] = [];
  const deps = { ...f.grant, listPlugins: async () => { order.push('list'); return [{ pluginId: 'crm-plugin', servers }]; }, readActivations: async () => { order.push('activations'); return { plugins: { 'crm-plugin': { enabled: false } } }; } };
  await grantDeclaredToolsAtBoot({ deps, log: f.log });
  assert.deepEqual(order, ['list', 'activations']); assert.equal(f.calls.length, 0);
  const row = (await f.repo.findByServerId({ workspaceId: 'acme', serverId: 'crm' }))!;
  await f.repo.upsert({ ...row, writeGrantsUpdatedByPrincipalId: 'acme:operator' });
  await grantDeclaredToolsAtBoot({ deps: { ...deps, readActivations: async () => ({ plugins: {} }) }, log: f.log });
  assert.ok(!f.calls.includes('activate')); assert.equal(f.infos.length, 0);
});

test('import keeps an existing credential and finishes switch-on without replacement', async () => {
  const f = await fixture();
  assert.equal(await importAgentPluginAccessToken({ deps: f.deps, input: { pluginId: 'crm-plugin', token: 'never-replace' } }), 'already-connected');
  assert.deepEqual(f.calls, ['acme:oauth', 'switch']);
  const row = (await f.repo.findByServerId({ workspaceId: 'acme', serverId: 'crm' }))!;
  assert.equal(row.authMode, 'oauth'); assert.deepEqual(f.saved, []);
});

test('env import requires the seeded digest, honors pending tokens, uses host actor and screen, and keeps failures secret', async () => {
  const f = await fixture(); const row = (await f.repo.findByServerId({ workspaceId: 'acme', serverId: 'crm' }))!;
  await f.repo.upsert({ ...row, oauthStatus: null });
  const env = { ACME_TOKEN: '  acme-secret-token  ', ACME_OLD: '1' };
  await importAgentPluginAccessTokensFromEnv({ deps: { ...f.deps, listPlugins: async () => [{ pluginId: 'crm-plugin', servers, bundled: false }] }, env, log: f.log });
  assert.equal(f.calls.length, 0); assert.equal(f.infos.length, 0);
  await importAgentPluginAccessTokensFromEnv({ deps: f.deps, env, log: f.log }, { skipPluginIds: new Set(['crm-plugin']) });
  assert.equal(f.calls.length, 0); assert.equal(f.infos.length, 1);
  await importAgentPluginAccessTokensFromEnv({ deps: { ...f.deps, switchOnSavedToken: async () => ({ state: 'plugin-off-by-operator' }) }, env, log: f.log });
  const after = (await f.repo.findByServerId({ workspaceId: 'acme', serverId: 'crm' }))!;
  assert.equal(f.saved.at(-1)?.principalId, 'acme:import'); assert.equal(after.authMode, 'static_env');
  assert.ok(f.infos.some(message => message.includes('(Acme Connections)')));
  const failure = { ...f.deps, resolveInstalledPlugin: async () => { throw new Error('acme-secret-token'); } };
  await importAgentPluginAccessTokensFromEnv({ deps: failure, env, log: f.log });
  assert.equal(f.warnings.at(-1), 'acme could not copy ACME_TOKEN to crm-plugin');
  assert.ok(![...f.infos, ...f.warnings].join('\n').includes('acme-secret-token'));
});

test('installed listing uses the one host ledger, preferred selection and fresh declaration reads, first id wins', async () => {
  const order: string[] = []; const ledger = new Map([['crm-plugin', 'seeded']]);
  const first = { pluginId: 'crm-plugin', archiveDigest: 'seeded', packageRoot: '/acme/one', files: [], skills: [] };
  const duplicate = { ...first, archiveDigest: 'other', packageRoot: '/acme/two' };
  const result = await listInstalledAgentPluginServers({ workspaceRoot: '/acme', lifecycle: { readBundledAgentPluginDigests: async () => { order.push('ledger'); return ledger; }, listInstalledPlugins: async () => { order.push('installed'); return [first, duplicate]; }, preferBundledAgentPluginDigests: ({ installed, bundled }) => { assert.equal(bundled, ledger); return installed; }, readInstalledMcpServers: async ({ packageRoot }) => { order.push(packageRoot); return servers; } } });
  assert.deepEqual(order, ['ledger', 'installed', '/acme/one']);
  assert.deepEqual(result, [{ pluginId: 'crm-plugin', servers, bundled: true }]);
});

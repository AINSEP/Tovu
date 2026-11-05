import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryKeyring } from '../../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../../webhooks/secret-sealer.aesgcm.js';
import { InMemoryExternalMcpServerRepo } from '../../../external-mcp/external-mcp-store.memory.js';
import { externalMcpAdmissionRevision, saveExternalMcpServer } from '../../../external-mcp/external-mcp-store.js';
import { createExternalMcpConnectionGate } from '../../../external-mcp/external-mcp-oauth.js';
import { createApplyConnectDefaults } from '../../apply-connect-defaults.js';
import { previewAgentPluginEnableAccess, validatedAgentPluginToolGrant } from '../../enable-access.js';
import { resolveAgentPluginLayout } from '../../layout.js';
import type { McpServerConfig } from '../../mcp-metadata.js';

const servers: Readonly<Record<string, McpServerConfig>> = { media: { type: 'streamable-http', url: 'https://media.example.test/mcp', tovuAuthMode: 'oauth', tovuDefaultTools: { allow: ['models', 'generate'], write: ['generate'] } } };
async function fixture() {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const clock = { nowMs: () => Date.parse('2026-11-04T12:00:00.000Z') };
  await saveExternalMcpServer({ repo, keyring, clock, sealer: new AesGcmSecretSealer(keyring) }, {
    workspaceId: 'ws', serverId: 'media', label: 'Media', transport: 'streamable_http', url: 'https://media.example.test/mcp',
    authMode: 'oauth', enabled: false, command: '', args: '', allowedToolNames: 'existing', writeAllowedToolNames: '',
    principalId: 'owner', provisionedByPluginId: 'images', oauth: { grant: 'authorization_code' },
  });
  return { repo, clock, row: async () => (await repo.findByServerId({ workspaceId: 'ws', serverId: 'media' }))! };
}

test('the owner card predicts the same exact access that the existing grant owner applies, before sign-in', async () => {
  const f = await fixture();
  const preview = await previewAgentPluginEnableAccess({ workspaceId: 'ws', pluginId: 'images', servers, repo: f.repo });
  assert.deepEqual(preview.details.map(detail => detail.value), ['media — https://media.example.test/mcp', 'existing, models, generate', 'generate']);
  let reloads = 0;
  const apply = createApplyConnectDefaults({ ...f, workspaceId: 'ws', agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/unused' }),
    resolveServers: async () => servers, isPluginOffByOperator: async () => false, enablePlugin: async () => true,
    notifyRosterChanged: async () => { reloads++; },
  }, { approvedEnable: { principalId: 'owner' } });
  await apply('media');
  const row = await f.row();
  assert.equal(row.enabled, true);
  assert.deepEqual(JSON.parse(row.allowedToolNames!), ['existing', 'models', 'generate']);
  assert.deepEqual(JSON.parse(row.writeAllowedToolNames!), ['generate']);
  assert.equal(row.writeGrantsUpdatedByPrincipalId, 'owner');
  assert.equal(reloads, 1);
  assert.equal((await previewAgentPluginEnableAccess({ workspaceId: 'ws', pluginId: 'images', servers, repo: f.repo })).details.length, 0);
});

test('a changed endpoint refuses before disclosing or granting a different source', async () => {
  const f = await fixture();
  await f.repo.upsert({ ...await f.row(), url: 'https://other.example.test/mcp' });
  await assert.rejects(previewAgentPluginEnableAccess({ workspaceId: 'ws', pluginId: 'images', servers, repo: f.repo }), /points somewhere else/);
});

test('a combined grant cannot exceed the existing external-MCP tool-list limit', async () => {
  const f = await fixture();
  await f.repo.upsert({ ...await f.row(), allowedToolNames: JSON.stringify(Array.from({ length: 64 }, (_, i) => `existing_${i}`)) });
  await assert.rejects(previewAgentPluginEnableAccess({ workspaceId: 'ws', pluginId: 'images', servers, repo: f.repo }), /64 tools/);
  assert.equal((await f.row()).enabled, false);
});

test('a plugin OFF switch refuses its already-admitted external tools on the next call', async () => {
  const f = await fixture();
  await f.repo.upsert({ ...await f.row(), enabled: true, authMode: 'none' });
  const row = await f.row();
  const gate = createExternalMcpConnectionGate({ workspaceId: 'ws', repo: f.repo, isPluginEnabled: async () => false });
  await assert.rejects(gate('media', { remoteName: 'existing', declaredAnnotations: { readOnlyHint: true }, origin: { kind: 'roster', admissionRevision: externalMcpAdmissionRevision(row) } }), /plugin.*off/i);
});

test('an ON plugin with an OFF source offers the same enable card instead of manual settings', async () => {
  const f = await fixture();
  const row = await f.row();
  const gate = createExternalMcpConnectionGate({ workspaceId: 'ws', repo: f.repo, isPluginEnabled: async () => true });
  await assert.rejects(gate('media', { remoteName: 'existing', declaredAnnotations: { readOnlyHint: true }, origin: { kind: 'roster', admissionRevision: externalMcpAdmissionRevision(row) } }), /connection was turned off.*plugins_set_enabled/);
});

for (const damaged of ['{', '{}', '["read",3]', 'false']) {
  test(`a damaged stored grant refuses the owner card: ${damaged}`, async () => {
    const f = await fixture();
    await f.repo.upsert({ ...await f.row(), allowedToolNames: damaged });
    await assert.rejects(previewAgentPluginEnableAccess({ workspaceId: 'ws', pluginId: 'images', servers, repo: f.repo }), /tool list.*before enabling/i);
    assert.equal((await f.row()).enabled, false);
  });
}

test('declared tool arrays are validated as names rather than split as comma-separated text', () => {
  assert.throws(() => validatedAgentPluginToolGrant({ current: { enabled: false, allow: [], write: [] }, declared: { allow: ['read,write'], write: [] } }, { reason: 'owner-enable' }), /not a valid MCP tool name/);
});

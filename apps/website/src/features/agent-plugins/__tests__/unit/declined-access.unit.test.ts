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
  return { repo, keyring, clock, row: async () => (await repo.findByServerId({ workspaceId: 'ws', serverId: 'media' }))! };
}

test('one approved operator source stays approved through its expected plugin adoption', async () => {
  const f = await fixture();
  await f.repo.upsert({ ...await f.row(), provisionedByPluginId: null });
  const preview = await previewAgentPluginEnableAccess({ workspaceId: 'ws', pluginId: 'images', servers, repo: f.repo });
  await f.repo.upsert({ ...await f.row(), provisionedByPluginId: 'images' });
  const apply = createApplyConnectDefaults({ ...f, workspaceId: 'ws', agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/unused' }),
    resolveServers: async () => servers, isPluginOffByOperator: async () => false, enablePlugin: async () => true, notifyRosterChanged: async () => {},
  }, { approvedEnable: { principalId: 'owner', accessKey: preview.key } });
  await apply('media');
  assert.equal((await f.row()).enabled, true);
  assert.deepEqual(JSON.parse((await f.row()).writeAllowedToolNames!), ['generate']);
});



for (const existingApprover of [null, 'prior-owner']) test(`a declined review preserves earlier decisions: ${existingApprover}`, async () => {
  const f = await fixture();
  await f.repo.upsert({ ...await f.row(), allowedToolNames: '[]', writeGrantsUpdatedByPrincipalId: existingApprover });
  const preview = await previewAgentPluginEnableAccess({ workspaceId: 'ws', pluginId: 'images', servers, repo: f.repo });
  const { recordAgentPluginAccessDeclined } = await import('../../apply-connect-defaults.js');
  await recordAgentPluginAccessDeclined({ repo: f.repo, clock: f.clock, workspaceId: 'ws', accessKey: preview.key });
  const after = await f.row();
  assert.equal(after.writeGrantsUpdatedByPrincipalId, existingApprover ?? 'system:connect-declined');
  assert.equal(after.enabled, false);
  let activations = 0;
  const apply = createApplyConnectDefaults({ ...f, workspaceId: 'ws', agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/unused' }),
    resolveServers: async () => servers, isPluginOffByOperator: async () => false,
    enablePlugin: async () => { activations++; return true; }, notifyRosterChanged: async () => {},
  });
  await apply('media');
  assert.equal(activations, 0);
  assert.equal((await f.row()).enabled, false);
});

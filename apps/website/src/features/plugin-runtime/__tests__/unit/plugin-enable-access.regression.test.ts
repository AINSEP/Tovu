import assert from 'node:assert/strict';
import test from 'node:test';
import { answerCard, harness } from '../fixtures/plugins-tool-harness.js';

const input = { family: 'agent-plugin', pluginId: 'higgsfield', enabled: true } as const;
const details = [
  { label: 'External MCP source', value: 'media — https://mcp.example.test/mcp' },
  { label: 'Tools', value: 'models, generate' },
  { label: 'May write', value: 'generate' },
];

test('one enable card lists source, tools and writes before applying the approved grant', async () => {
  const grants: unknown[] = [];
  const h = harness({ confirmEnable: () => true, agentHost: {
    previewEnableAccess: async () => ({ key: 'revision-1', details, resources: [{ id: 'media', label: details[0]!.value, previous: { enabled: false, allow: [], write: [] }, proposed: { enabled: true, allow: ['models', 'generate'], write: ['generate'] }, revision: 'source-1' }] }),
    provisionMcp: async (_input, options) => { grants.push(options); },
  } });
  const { html, outcome } = await answerCard({ tool: h.tool('plugins_set_enabled'), surfaceExchanges: h.surfaceExchanges, input, decision: 'confirm' });
  assert.ok(html.includes(details[0]!.value));
  assert.ok(html.includes('models')); assert.ok(html.includes('generate'));
  assert.ok(html.includes('source-1')); assert.ok(html.includes('owner-under-test'));
  assert.equal((await outcome as { changed: boolean }).changed, true);
  assert.deepEqual(grants, [{ approvedEnable: true, approvedEnableKey: 'revision-1' }]);
});

test('cancel never grants and changed source configuration requires another approval', async () => {
  let revision = 0;
  const h = harness({ confirmEnable: () => true, agentHost: {
    previewEnableAccess: async () => ({ key: String(++revision), details }),
  } });
  const cancelled = await answerCard({ tool: h.tool('plugins_set_enabled'), surfaceExchanges: h.surfaceExchanges, input, decision: 'cancel' });
  assert.equal((await cancelled.outcome as { changed: boolean }).changed, false);
  const stale = await answerCard({ tool: h.tool('plugins_set_enabled'), surfaceExchanges: h.surfaceExchanges, input, decision: 'confirm' });
  await assert.rejects(stale.outcome, /PLUGINS_STALE_APPROVAL/);
  assert.equal(h.events.some(event => /^(setEnabled|provisionMcp):/.test(event)), false);
});


test('cancel records the reviewed access choice through the host', async () => {
  const declined: unknown[] = [];
  const h = harness({ confirmEnable: () => true, agentHost: {
    previewEnableAccess: async () => ({ key: 'reviewed-source', resources: [] }),
    recordDeclinedAccess: async input => { declined.push(input); },
  } });
  const cancelled = await answerCard({ tool: h.tool('plugins_set_enabled'), surfaceExchanges: h.surfaceExchanges, input, decision: 'cancel' });
  assert.equal((await cancelled.outcome as { changed: boolean }).changed, false);
  assert.deepEqual(declined, [{ accessKey: 'reviewed-source' }]);
});


test('a declined enable remains a choice when a seeded-off plugin signs in later', async t => {
  const { createTempSiteLayoutFixture } = await import('#src/__tests__/fixtures/site-layout-context');
  const { agentPluginActivations } = await import('../../../agent-plugins/activation-effects.js');
  const { createApplyConnectDefaults, recordAgentPluginAccessDeclined } = await import('../../../agent-plugins/apply-connect-defaults.js');
  const { previewAgentPluginEnableAccess } = await import('../../../agent-plugins/enable-access.js');
  const { InMemoryExternalMcpServerRepo } = await import('../../../external-mcp/external-mcp-store.memory.js');
  const { saveExternalMcpServer } = await import('../../../external-mcp/external-mcp-store.js');
  const { InMemoryKeyring } = await import('../../../webhooks/keyring.memory.js');
  const { AesGcmSecretSealer } = await import('../../../webhooks/secret-sealer.aesgcm.js');
  const { WORKSPACE_ID } = await import('../fixtures/plugins-tool-harness.js');
  const fixture = createTempSiteLayoutFixture({});
  t.after(fixture.cleanup);
  const { agentPluginLayout } = fixture.deps;
  const workspaceRoot = agentPluginLayout.forWorkspace(WORKSPACE_ID).root;
  await agentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId: input.pluginId, enabled: false, actor: 'system:seed' });
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const clock = { nowMs: () => Date.parse('2026-11-05T12:00:00Z') };
  const servers = { media: { type: 'streamable-http' as const, url: 'https://media.example.test/mcp', tovuAuthMode: 'oauth' as const, tovuDefaultTools: { allow: ['read'], write: [] } } };
  await saveExternalMcpServer({ repo, keyring, clock, sealer: new AesGcmSecretSealer(keyring) }, {
    workspaceId: WORKSPACE_ID, serverId: 'media', label: 'Media', transport: 'streamable_http', authMode: 'oauth', enabled: false,
    url: servers.media.url, command: '', args: '', allowedToolNames: '', writeAllowedToolNames: '', principalId: 'owner', provisionedByPluginId: input.pluginId,
  });
  const h = harness({ layout: agentPluginLayout, confirmEnable: () => true, agentHost: {
    previewEnableAccess: async () => previewAgentPluginEnableAccess({ workspaceId: WORKSPACE_ID, pluginId: input.pluginId, servers, repo }),
    recordDeclinedAccess: async ({ accessKey }) => recordAgentPluginAccessDeclined({ repo, clock, workspaceId: WORKSPACE_ID, accessKey }),
  } });
  const cancelled = await answerCard({ tool: h.tool('plugins_set_enabled'), surfaceExchanges: h.surfaceExchanges, input, decision: 'cancel' });
  assert.equal((await cancelled.outcome as { changed: boolean }).changed, false);
  const row = (await repo.findByServerId({ workspaceId: WORKSPACE_ID, serverId: 'media' }))!;
  await repo.upsert({ ...row, oauthStatus: 'connected' });
  let activations = 0;
  await createApplyConnectDefaults({ repo, clock, workspaceId: WORKSPACE_ID, agentPluginLayout, resolveServers: async () => servers,
    enablePlugin: async () => { activations++; return true; }, notifyRosterChanged: async () => {},
  })('media');
  assert.equal(activations, 0);
  assert.equal((await repo.findByServerId({ workspaceId: WORKSPACE_ID, serverId: 'media' }))!.enabled, false);
  assert.equal((await agentPluginActivations.readAgentPluginActivations({ workspaceRoot })).plugins[input.pluginId]!.updatedBy, 'system:seed');
});

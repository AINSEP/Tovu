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
  }, { approvedEnable: { principalId: 'owner', accessKey: preview.key } });
  await apply('media');
  const row = await f.row();
  assert.equal(row.enabled, true);
  assert.deepEqual(JSON.parse(row.allowedToolNames!), ['existing', 'models', 'generate']);
  assert.deepEqual(JSON.parse(row.writeAllowedToolNames!), ['generate']);
  assert.equal(row.writeGrantsUpdatedByPrincipalId, 'owner');
  assert.equal(reloads, 1);
  assert.equal((await previewAgentPluginEnableAccess({ workspaceId: 'ws', pluginId: 'images', servers, repo: f.repo })).details.length, 0);
});

test('an approved enable missing its access snapshot refuses before activation or grant writes', async () => {
  const f = await fixture();
  let activations = 0; let writes = 0;
  const originalUpdate = f.repo.updateAccessIfCurrent.bind(f.repo);
  f.repo.updateAccessIfCurrent = async input => { writes++; return originalUpdate(input); };
  const apply = createApplyConnectDefaults({ ...f, workspaceId: 'ws', agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/unused' }),
    resolveServers: async () => servers, isPluginOffByOperator: async () => false, enablePlugin: async () => { activations++; return true; },
    notifyRosterChanged: async () => {},
  }, { approvedEnable: { principalId: 'owner' } } as never);
  await assert.rejects(apply('media'), /approved access snapshot/);
  assert.equal(activations, 0); assert.equal(writes, 0);
  assert.equal((await f.row()).enabled, false);
});

test('a changed endpoint refuses before disclosing or granting a different source', async () => {
  const f = await fixture();
  await f.repo.upsert({ ...await f.row(), url: 'https://other.example.test/mcp' });
  await assert.rejects(previewAgentPluginEnableAccess({ workspaceId: 'ws', pluginId: 'images', servers, repo: f.repo }), /points somewhere else/);
});

test('a newly provisioned source cannot receive an approval issued for a different endpoint', async () => {
  const f = await fixture();
  const initial: Readonly<Record<string, McpServerConfig>> = { fresh: { ...servers.media!, url: 'https://first.example.test/mcp' } as McpServerConfig };
  const preview = await previewAgentPluginEnableAccess({ workspaceId: 'ws', pluginId: 'images', servers: initial, repo: f.repo });
  await f.repo.upsert({ ...await f.row(), id: 'fresh-record', serverId: 'fresh', url: 'https://second.example.test/mcp', allowedToolNames: '[]' });
  const changed: Readonly<Record<string, McpServerConfig>> = { fresh: { ...initial.fresh!, url: 'https://second.example.test/mcp' } as McpServerConfig };
  const apply = createApplyConnectDefaults({ ...f, workspaceId: 'ws', agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/unused' }),
    resolveServers: async () => changed, isPluginOffByOperator: async () => false, enablePlugin: async () => true,
    notifyRosterChanged: async () => {},
  }, { approvedEnable: { principalId: 'owner', accessKey: preview.key } });
  await assert.rejects(apply('fresh'), /changed after approval/);
  assert.equal((await f.repo.findByServerId({ workspaceId: 'ws', serverId: 'fresh' }))?.enabled, false);
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

// A retained sign-in is authentication, not fresh permission to widen access from chat.
test('already signed-in connect declines without granting or calling the sign-in defaults hook', async () => {
  const { runAgentPluginConnect } = await import('../../connect-tool.js');
  const { createSurfaceExchangeStore } = await import('@jini-ai/daemon/surface-exchanges');
  const f = await fixture();
  await f.repo.upsert({ ...await f.row(), oauthStatus: 'connected', allowedToolNames: '[]' });
  let calls = 0; let cards = 0;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: { schedule: () => () => {} }, clock: f.clock,
    idGenerator: { newId: () => 'access-exchange' }, defaultChannel: 'mcp-ui' });
  const result = await runAgentPluginConnect({
    routeDeps: { workspaceId: 'ws', agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/unused' }),
      authorize: async () => ({ allowed: true, reason: '' }), isPluginEnabled: async () => true,
      credentials: { loadSafe: async () => [] }, mcp: { repo: f.repo, saveServer: async () => { throw new Error('existing source only'); } },
      externalMcpOAuth: { beginConnect: async () => { throw new Error('must reuse sign-in'); }, isValidationError: () => false },
      resolveInstalledPlugin: async () => ({ servers }),
    },
    surfaces: { surfaceExchanges, assertAccessApprover: async () => {} } as never,
    ctx: { executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' }, input: { pluginId: 'images' }, signal: new AbortController().signal },
    pluginId: 'images',
  }, { onConnected: async () => { calls++; }, emitSurface: async () => {
    cards++; assert.equal((await f.row()).enabled, false); assert.equal(calls, 0);
    surfaceExchanges.deliver({ exchangeId: 'access-exchange', principalId: 'owner', params: { decision: 'cancel' } }, { toolId: 'agent_plugin_connect' });
  } });
  assert.equal(cards, 1); assert.equal(calls, 0); assert.equal((await f.row()).enabled, false);
  assert.equal(result.status, 'not-connected');
});

for (const change of ['tools', 'writes', 'endpoint', 'removed'] as const) {
  test(`retained-session approval refuses an installed declaration changed while open: ${change}`, async () => {
    const { runAgentPluginConnect } = await import('../../connect-tool.js');
    const { createSurfaceExchangeStore } = await import('@jini-ai/daemon/surface-exchanges');
    const f = await fixture();
    await f.repo.upsert({ ...await f.row(), oauthStatus: 'connected', allowedToolNames: '[]' });
    const original = structuredClone(servers);
    let current: Readonly<Record<string, McpServerConfig>> = original;
    const surfaceExchanges = createSurfaceExchangeStore({ scheduler: { schedule: () => () => {} }, clock: f.clock,
      idGenerator: { newId: () => 'access-exchange' }, defaultChannel: 'mcp-ui' });
    const promise = runAgentPluginConnect({
      routeDeps: { workspaceId: 'ws', agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/unused' }),
        authorize: async () => ({ allowed: true, reason: '' }), isPluginEnabled: async () => true,
        credentials: { loadSafe: async () => [] }, mcp: { repo: f.repo, saveServer: async () => { throw new Error('existing source only'); } },
        externalMcpOAuth: { beginConnect: async () => { throw new Error('must reuse sign-in'); }, isValidationError: () => false },
        resolveInstalledPlugin: async () => ({ servers: current }),
      },
      surfaces: { surfaceExchanges, assertAccessApprover: async () => {} } as never,
      ctx: { executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' }, input: {}, signal: new AbortController().signal }, pluginId: 'images',
    }, { emitSurface: async () => {
      const config = original.media as Exclude<McpServerConfig, { type: 'stdio' }>;
      if (change === 'removed') current = {};
      if (change === 'endpoint') current = { media: { ...config, url: 'https://other.example.test/mcp' } };
      if (change === 'tools') current = { media: { ...config, tovuDefaultTools: { allow: ['more'], write: [] } } };
      if (change === 'writes') current = { media: { ...config, tovuDefaultTools: { allow: ['models', 'generate'], write: ['models'] } } };
      surfaceExchanges.deliver({ exchangeId: 'access-exchange', principalId: 'owner', params: { decision: 'confirm' } }, { toolId: 'agent_plugin_connect' });
    } });
    await assert.rejects(promise, /changed|points somewhere else/);
    assert.equal((await f.row()).enabled, false);
    assert.deepEqual(JSON.parse((await f.row()).allowedToolNames!), []);
  });
}

for (const separate of [false, true]) {
  test(`retained OAuth refuses or declines before any provisioning: separate connection ${separate}`, async () => {
    const { runAgentPluginConnect } = await import('../../connect-tool.js');
    const { createSurfaceExchangeStore } = await import('@jini-ai/daemon/surface-exchanges');
    const f = await fixture();
    await f.repo.upsert({ ...await f.row(), oauthStatus: 'connected', allowedToolNames: '[]', provisionedByPluginId: separate ? null : 'images' });
    let upserts = 0; let saves = 0; let cards = 0;
    const originalUpsert = f.repo.upsert.bind(f.repo);
    f.repo.upsert = async row => { upserts++; return originalUpsert(row); };
    const surfaceExchanges = createSurfaceExchangeStore({ scheduler: { schedule: () => () => {} }, clock: f.clock,
      idGenerator: { newId: () => 'access-exchange' }, defaultChannel: 'mcp-ui' });
    const promise = runAgentPluginConnect({
      routeDeps: { workspaceId: 'ws', agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/unused' }),
        authorize: async () => ({ allowed: true, reason: '' }), isPluginEnabled: async () => true,
        credentials: { loadSafe: async () => [] }, mcp: { repo: f.repo, saveServer: async () => { saves++; throw new Error('no provisioning before approval'); } },
        externalMcpOAuth: { beginConnect: async () => { throw new Error('no sign-in before approval'); }, isValidationError: () => false },
        resolveInstalledPlugin: async () => ({ servers: { ...servers, pending: { type: 'streamable-http', url: 'https://pending.example.test/mcp', tovuAuthMode: 'oauth' } } }),
      },
      surfaces: { surfaceExchanges, assertAccessApprover: async () => {} } as never,
      ctx: { executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' }, input: {}, signal: new AbortController().signal }, pluginId: 'images',
    }, { emitSurface: async () => {
      cards++; assert.equal(saves, 0); assert.equal(upserts, 0);
      surfaceExchanges.deliver({ exchangeId: 'access-exchange', principalId: 'owner', params: { decision: 'cancel' } }, { toolId: 'agent_plugin_connect' });
    } });
    if (separate) await assert.rejects(promise, /external_mcp_save/);
    else assert.equal((await promise).status, 'not-connected');
    assert.equal(cards, separate ? 0 : 1);
    assert.equal(saves, 0); assert.equal(upserts, 0);
    assert.equal((await f.row()).provisionedByPluginId, separate ? null : 'images');
    assert.equal(await f.repo.findByServerId({ workspaceId: 'ws', serverId: 'pending' }), null);
  });
}

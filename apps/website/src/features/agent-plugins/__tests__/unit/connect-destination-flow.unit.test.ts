import assert from 'node:assert/strict';
import test from 'node:test';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { InMemoryKeyring } from '../../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../../webhooks/secret-sealer.aesgcm.js';
import { InMemoryExternalMcpServerRepo } from '../../../external-mcp/external-mcp-store.memory.js';
import { resolveAgentPluginLayout } from '../../layout.js';
import { runAgentPluginConnect, type AgentPluginConnectToolDeps } from '../../connect-tool.js';
import { mcpTestPort } from '../fixtures/connection-service-ports.js';

function fixture(principalId = 'owner') {
  const keyring = new InMemoryKeyring(), clock = createSystemClock();
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock, idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) };
  const destinations: unknown[] = [];
  let allowed = true;
  const deps: AgentPluginConnectToolDeps = {
    workspaceId: 'workspace-local', ownerPrincipalId: Promise.resolve('owner'),
    agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/tmp/oauth-destination-fixture' }),
    authorize: async () => ({ allowed, reason: 'fixture' }), credentials: { loadSafe: async () => [] },
    mcp: mcpTestPort({ repo: new InMemoryExternalMcpServerRepo(), keyring, sealer: new AesGcmSecretSealer(keyring), clock }),
    resolveInstalledPlugin: async () => ({ servers: {} }),
    apiConnections: { sharingAvailable: true,
      listConnections: async () => [{ pluginId: 'office', descriptor: { connectionId: 'account' } } as never],
      connect: async ({ destination }) => { destinations.push(destination); return { status: 'connected', connectionRef: 'opaque-reference' }; },
    },
  };
  const ctx = { executionId: 'execution', principal: { id: principalId }, run: { id: 'run' }, input: {}, signal: new AbortController().signal };
  return { deps, surfaces, ctx, destinations, deny: () => { allowed = false; },
    deliver: (html: string, params: Record<string, unknown>) => {
      const exchangeId = /"__exchangeId":"([^"]+)"/.exec(html)?.[1];
      assert.ok(exchangeId);
      return surfaces.surfaceExchanges.deliver({ exchangeId, principalId, params }, { toolId: 'agent_plugin_connect', channel: 'mcp-ui' });
    } };
}

test('owner human choice reaches the real connect-tool branch as shared; cancellation starts nothing', async () => {
  for (const cancel of [false, true]) {
    const f = fixture();
    const result = await runAgentPluginConnect({ routeDeps: f.deps, surfaces: f.surfaces, ctx: f.ctx, pluginId: 'office' }, {
      emitSurface: async emission => {
        const html = (emission.payload.resource as { resource: { text: string } }).resource.text;
        f.deliver(html, cancel ? { __dismissed: true } : { destination: 'shared' });
      },
    });
    assert.equal(result.status, cancel ? 'not-connected' : 'connected');
    assert.deepEqual(f.destinations, cancel ? [] : ['shared']);
  }
});

test('other site admins keep local sign-in and never receive an owner sharing card', async () => {
  const f = fixture('site-admin');
  const result = await runAgentPluginConnect({ routeDeps: f.deps, surfaces: f.surfaces, ctx: f.ctx, pluginId: 'office' });
  assert.equal(result.status, 'connected');
  assert.deepEqual(f.destinations, ['site']);
});

test('permission revoked while the owner reads the choice card starts no sign-in', async () => {
  const f = fixture();
  await assert.rejects(runAgentPluginConnect({ routeDeps: f.deps, surfaces: f.surfaces, ctx: f.ctx, pluginId: 'office' }, {
    emitSurface: async emission => {
      f.deny();
      f.deliver((emission.payload.resource as { resource: { text: string } }).resource.text, { destination: 'shared' });
    },
  }));
  assert.deepEqual(f.destinations, []);
});

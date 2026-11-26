import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurfaceEmission, ToolExecutionContext } from '@jini-ai/core';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/platform/system';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { InMemoryExternalMcpServerRepo } from '../../../external-mcp/external-mcp-store.memory.js';
import { InMemoryKeyring } from '../../../webhooks/keyring.env.js';
import { AesGcmSecretSealer } from '@jini-ai/platform/secrets';
import { mcpTestPort } from '../fixtures/connection-service-ports.js';
import { resolveAgentPluginLayout } from '../../layout.js';
import { tovuConnectDeps } from "#src/features/agent-plugins/connect-bindings";
import { type AgentPluginConnectToolDeps } from "#src/features/agent-plugins/connect-bindings";
import { runAgentPluginConnect } from "@jini-ai/agent-plugins/connect";
import type { AgentPluginApiConnectionsPort } from '@jini-ai/agent-plugins/site/service-ports';

test('Skip on an OAuth sign-in card lets the assistant continue without stopping the run', async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const clock = createSystemClock();
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock, idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) };
  const runController = new AbortController();
  const emissions: SurfaceEmission[] = [];
  const deps: AgentPluginConnectToolDeps = {
    workspaceId: 'ws', agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/tmp/chat-skip-fixture' }), authorize: async () => ({ allowed: true, reason: 'test' }),
    mcp: mcpTestPort({ repo, keyring, sealer: new AesGcmSecretSealer({ keyring }), clock }),
    credentials: { loadSafe: async () => [] }, pollIntervalMs: 5, waitTimeoutMs: 50,
    resolveInstalledPlugin: async () => ({ servers: { example: { type: 'streamable-http', url: 'https://example.test/mcp', authMode: 'oauth' } } }),
    externalMcpOAuth: { beginConnect: async () => ({ kind: 'redirect_required', authorizationUrl: 'https://example.test/sign-in', expiresAt: '2099-01-01T00:00:00Z' }), isSignInRefusal: () => false },
  };
  const ctx: ToolExecutionContext = { executionId: 'execution', principal: { id: 'owner' }, run: { id: 'run' }, input: {}, signal: runController.signal };
  const result = await runAgentPluginConnect({ routeDeps: tovuConnectDeps(deps), surfaces, ctx, pluginId: 'example' }, {
    emitSurface: async emission => {
      emissions.push(emission);
      const html = (emission.payload.resource as { resource: { text: string } }).resource.text;
      if (emissions.length !== 1) return;
      assert.match(html, />Skip<\/button>/);
      const exchangeId = /"__exchangeId":"([^"]+)"/.exec(html)?.[1];
      assert.ok(exchangeId, 'Skip must answer the existing exchange');
      assert.deepEqual(surfaces.surfaceExchanges.deliver({ exchangeId, principalId: 'other', params: { __dismissed: true } }, { toolId: 'agent_plugin_connect' }), { ok: false, reason: 'binding-mismatch' });
      assert.deepEqual(surfaces.surfaceExchanges.deliver({ exchangeId, principalId: 'owner', params: { __dismissed: true } }, { toolId: 'agent_plugin_connect' }), { ok: true });
    },
  });
  assert.equal(result.status, 'not-connected');
  assert.equal(result.reason, 'cancelled');
  assert.equal(runController.signal.aborted, false);
  assert.equal(emissions.length, 2, 'the waiting card becomes a skipped result');
  assert.match((emissions[1]!.payload.resource as { resource: { text: string } }).resource.text, /Sign-in skipped/);
});

test('Skip also releases a plugin API-connection wait and aborts only that wait', async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const clock = createSystemClock();
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock, idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) };
  let waitSignal: AbortSignal | undefined;
  const apiConnections: AgentPluginApiConnectionsPort<import('@jini-ai/integrations/api-connections').DeclaredApiConnection> = {
    listConnections: async () => [{ pluginId: 'example', descriptor: { connectionId: 'account' } } as Awaited<ReturnType<AgentPluginApiConnectionsPort<import('@jini-ai/integrations/api-connections').DeclaredApiConnection>['listConnections']>>[number]],
    connect: async ({ signal, showSignIn }) => {
      waitSignal = signal;
      await showSignIn({ signInUrl: 'https://example.test/sign-in' });
      if (!signal.aborted) await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
      return { status: 'waiting-for-sign-in', connectionRef: 'opaque-ref' };
    },
  };
  const deps: AgentPluginConnectToolDeps = {
    workspaceId: 'ws', agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/tmp/chat-skip-fixture' }), authorize: async () => ({ allowed: true, reason: 'test' }),
    mcp: mcpTestPort({ repo, keyring, sealer: new AesGcmSecretSealer({ keyring }), clock }), credentials: { loadSafe: async () => [] },
    resolveInstalledPlugin: async () => ({ servers: {} }), apiConnections,
  };
  const signal = new AbortController().signal;
  const ctx: ToolExecutionContext = { executionId: 'execution', principal: { id: 'owner' }, run: { id: 'run' }, input: {}, signal };
  let shown = false;
  const result = await runAgentPluginConnect({ routeDeps: tovuConnectDeps(deps), surfaces, ctx, pluginId: 'example' }, {
    emitSurface: async emission => {
      const html = (emission.payload.resource as { resource: { text: string } }).resource.text;
      if (shown) return;
      shown = true;
      assert.match(html, />Skip<\/button>/);
      const exchangeId = /"__exchangeId":"([^"]+)"/.exec(html)?.[1];
      assert.ok(exchangeId);
      surfaces.surfaceExchanges.deliver({ exchangeId, principalId: 'owner', params: { __dismissed: true } }, { toolId: 'agent_plugin_connect' });
    },
  });
  assert.equal(result.status, 'not-connected');
  assert.equal(result.reason, 'cancelled');
  assert.equal(waitSignal?.aborted, true);
  assert.equal(signal.aborted, false);
});

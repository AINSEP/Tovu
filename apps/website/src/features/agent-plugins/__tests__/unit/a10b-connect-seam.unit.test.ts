/**
 * A10b seam: the portable `agent_plugin_connect` body driven by a second host's ports only (alternate
 * tool id, permissions, approval owner, copy and card waiter). Proves R4: approve -> provision -> sign in
 * -> revalidate, no provisioning/grant/sign-in before consent, one sign-in start, and the permission
 * re-check inside the approval's `run`. Real in-memory external-MCP store, no on-disk install.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolExecutionContext, ToolHandler } from '@jini-ai/core';
import { InMemoryExternalMcpServerRepo } from '../../../external-mcp/external-mcp-store.memory.js';
import { InMemoryKeyring } from '#src/features/webhooks/keyring.memory';
import { AesGcmSecretSealer } from '#src/features/webhooks/secret-sealer.aesgcm';
import { mcpTestPort } from '../fixtures/connection-service-ports.js';
import { withAgentPluginMcpPorts } from '../../mcp-host-bindings.js';
import { classifyAgentPluginMcpServerTrust } from '../../capability-projection.js';
import { tovuEnableAccessMessages } from '../../enable-access.js';
import { runAgentPluginConnect, type AgentPluginConnectDeps, type AgentPluginConnectHost, type AgentPluginConnectMessages } from '../../portable/connect-tool.js';
import { tovuAgentPluginConnectHost, agentPluginConnectAgentToolCatalog } from '../../connect-tool.js';
import type { McpServerConfig } from '../../mcp-metadata.js';

const WORKSPACE_ID = '77777777-7777-4777-8777-777777777777';
const CLOCK = { nowMs: () => Date.parse('2026-09-27T00:00:00.000Z'), nowIso: () => '2026-09-27T00:00:00.000Z' };
const OAUTH_SERVER: McpServerConfig = { type: 'streamable-http', url: 'https://mcp.example.com/mcp', authMode: 'oauth' };

/** A second host's opaque surfaces: the portable body only passes them through to host ports. */
interface AcmeSurfaces { readonly acme: true }

const acmeMessages: AgentPluginConnectMessages = {
  signInRefused: ({ detail }) => `acme refused: ${detail}`, unsupportedSignIn: ({ kind }) => `acme unsupported ${kind}`,
  connectionNotSetUp: ({ serverKey }) => `acme not set up ${serverKey}`, multipleTokenServers: () => 'acme many tokens',
  noTokenCardAdapter: () => 'acme no adapter', pluginOff: ({ pluginId }) => `acme off ${pluginId}`, notInstalled: () => 'acme not installed',
  noOAuthService: () => 'acme no oauth', multipleOAuthServers: () => 'acme many oauth', noConnection: () => 'acme none',
  multipleApiConnections: () => 'acme many api', missingEmitter: () => 'acme no emitter',
};

function fixture({ decide }: { decide: 'approve' | 'expire' }) {
  const log: string[] = [];
  const permissions: string[] = [];
  const repo = new InMemoryExternalMcpServerRepo();
  const store = { repo, keyring: new InMemoryKeyring(), sealer: new AesGcmSecretSealer(new InMemoryKeyring()), clock: CLOCK };
  const port = mcpTestPort(store);
  const mcp = withAgentPluginMcpPorts({
    ...port,
    saveServer: async (input: Parameters<typeof port.saveServer>[0]) => { log.push('provision'); return port.saveServer(input); },
    applyAccess: async (input: Parameters<typeof port.applyAccess>[0]) => { log.push('grant'); return port.applyAccess(input); },
  });
  const described: { toolId: string; errorCode: string }[] = [];
  const host: AgentPluginConnectHost<AcmeSurfaces> = {
    toolId: 'acme_connect', permissions: { connect: 'acme.connect', apiConnectionWrite: 'acme.write' }, entityType: 'acme-plugin', approvalErrorCode: 'ACME',
    approvals: {
      accessApprovalHandler: (required, optional): ToolHandler => async (ctx, options = {}) => {
        assert.deepEqual(required.surfaces, { acme: true });
        const prepared = await required.prepare({ ctx }, options);
        log.push('approval:prepare');
        described.push(required.describe({ ctx, prepared }));
        optional.ask({ prepared });
        if (decide === 'expire') { log.push('approval:expired'); return optional.declined({ reason: 'expired', prepared }); }
        log.push('approval:run');
        return required.run({ ctx, prepared }, options);
      },
      notConfirmedResult: ({ reason }) => ({ cancelled: false, note: `acme not confirmed: ${reason}` }),
    },
    messages: acmeMessages,
    publicUrl: { redirectUri: ({ serverId }) => `https://acme.test/cb/${serverId}` },
    federation: { classifyTrust: classifyAgentPluginMcpServerTrust, messages: tovuEnableAccessMessages },
    actors: { connectDeclined: 'acme:declined' },
    waitAtSignInCard: async (required) => {
      log.push('sign-in-card');
      assert.equal(required.pluginDisplayName, 'Widget Store');
      return required.connect({ signal: new AbortController().signal, showSignIn: async ({ signInUrl }) => {
        log.push(`show:${signInUrl}`);
        const row = await repo.findByServerId({ workspaceId: WORKSPACE_ID, serverId: 'widget' });
        await repo.upsert({ ...row!, oauthStatus: 'connected' });
      } });
    },
    chooseDestination: async () => null,
  };
  const deps: AgentPluginConnectDeps<AcmeSurfaces, never> = {
    workspaceId: WORKSPACE_ID, mcp, host,
    authorize: async ({ permission }: { permission: string }) => { permissions.push(permission); return { allowed: true, reason: 'test' }; },
    credentials: { loadSafe: async () => [] },
    isPluginEnabled: async () => { log.push('activation'); return true; },
    resolveInstalledPlugin: async () => ({ servers: { widget: OAUTH_SERVER } }),
    externalMcpOAuth: {
      beginConnect: async ({ serverId, redirectUri }) => { log.push(`begin:${redirectUri}`); return { kind: 'redirect_required', authorizationUrl: `https://idp.test/${serverId}`, expiresAt: '2026-09-27T00:10:00.000Z' }; },
      isSignInRefusal: () => false,
    },
    pollIntervalMs: 1, waitTimeoutMs: 200,
  };
  const ctx = { executionId: 'e', principal: { id: 'p1' }, run: { id: 'r' }, input: { pluginId: 'widget-store' }, signal: new AbortController().signal } as unknown as ToolExecutionContext;
  return { log, permissions, described, deps, ctx, repo };
}

test('R4 other host: approve -> provision -> sign in -> revalidate, one sign-in start, host ids on every approval', async () => {
  const f = fixture({ decide: 'approve' });
  const result = await runAgentPluginConnect({ routeDeps: f.deps, surfaces: { acme: true }, ctx: f.ctx, pluginId: 'widget-store' }, { emitSurface: async () => {} });
  assert.equal(result.status, 'connected');
  const flow = f.log.filter(entry => !entry.startsWith('grant'));
  assert.deepEqual(flow, [
    'activation', 'approval:prepare', 'approval:run', 'activation', 'provision',
    'begin:https://acme.test/cb/widget', 'sign-in-card', 'show:https://idp.test/widget',
    'approval:prepare', 'approval:run', 'activation',
  ]);
  assert.equal(f.log.filter(entry => entry.startsWith('begin:')).length, 1);
  assert.ok(f.described.length === 2 && f.described.every(d => d.toolId === 'acme_connect' && d.errorCode === 'ACME'));
  // The permission is checked up front AND re-checked inside each approval's run, with the host's name.
  assert.deepEqual(f.permissions, ['acme.connect', 'acme.connect', 'acme.connect']);
});

test('R4: no provisioning, grant or sign-in start before consent; host not-confirmed bytes returned', async () => {
  const f = fixture({ decide: 'expire' });
  const result = await runAgentPluginConnect({ routeDeps: f.deps, surfaces: { acme: true }, ctx: f.ctx, pluginId: 'widget-store' }, { emitSurface: async () => {} });
  assert.deepEqual(result, { status: 'not-connected', cancelled: false, note: 'acme not confirmed: expired' });
  assert.deepEqual(f.log, ['activation', 'approval:prepare', 'approval:expired']);
  assert.equal(await f.repo.findByServerId({ workspaceId: WORKSPACE_ID, serverId: 'widget' }), null);
});

test('host copy and ids: other host refusals use its messages; Tovu bytes stay in the T shim', async () => {
  const f = fixture({ decide: 'approve' });
  const off = { ...f.deps, isPluginEnabled: async () => false };
  await assert.rejects(runAgentPluginConnect({ routeDeps: off, surfaces: { acme: true }, ctx: f.ctx, pluginId: 'widget-store' }), { message: 'acme off widget-store' });
  assert.equal(tovuAgentPluginConnectHost.toolId, 'agent_plugin_connect');
  assert.deepEqual(tovuAgentPluginConnectHost.permissions, { connect: 'admin.integrations.manage', apiConnectionWrite: 'system.write' });
  assert.equal(tovuAgentPluginConnectHost.messages.connectionNotSetUp({ pluginId: 'p', serverKey: 's' }), "agent_plugin_connect: 'p''s 's' connection could not be set up in this Tovu version.");
  assert.equal(agentPluginConnectAgentToolCatalog[0]?.name, 'agent_plugin_connect');
  assert.match(agentPluginConnectAgentToolCatalog[0]!.description, /Never ask the person to restart Tovu\./);
});

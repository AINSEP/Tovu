import { withExtensionApprovalPolicy } from "../../../../assistant/assistant-tool-approval-policy.js";
/**
 * Security pins for the one capability gate (Jini `openCapabilityGate` + `runInCapabilitySession`):
 * capabilities a plugin's admin-surface handler kept from an admin action the assistant ran, or from
 * a bootstrap call, are dead once that call ends, so a later tool or read cannot use them to reach the
 * earlier call's connection and confirmed account. Real paths: the registrar, the site's handler host
 * (Jini's), the site's admin-surface capability port and surface connections over a fake api host.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createIssuedTokenMemories } from '@jini-ai/agent-plugins/lifecycle/tools';
import { parseAdminSurfacesFile, type AdminSurfaceCapabilities, type AdminSurfaceHandlerModule, type LoadedAdminSurface } from '@jini-ai/agent-plugins/admin-surfaces';
import { deriveApiConnectionKey } from '@jini-ai/integrations/api-connections';
import { applyToolApprovalPolicy } from '../../../../assistant/tool-approval-policy.js';
import { createSurfaceConnections } from '../../../api-connections/surface-connections.js';
import type { ApiConnectionHost } from '../../../api-connections/host.js';
import { createAdminSurfaceCapabilities } from '../../admin-surfaces/capabilities.js';
import { createAgentPluginAdminSurfaceHandlers } from '../../admin-surfaces/handlers.js';
import { createAgentPluginToolCapabilities, createFrozenConnectionAccounts } from '../host-capabilities.js';
import { registerAgentPluginExecutableTools } from '../register.js';
import { allowAll, fakeHttp, PLUGIN, WORKSPACE, startConfirmingCall } from './fixtures.js';

const ENDED = /already finished/;
const SYNC = 'p_acme_office__account_sync';
const PEEK = 'p_acme_office__account_peek';
const ref = deriveApiConnectionKey({ workspaceId: WORKSPACE, pluginId: PLUGIN, connectionId: 'acme' });

/** `sync` (write) and `bootstrap` keep their capabilities; `peek` (read) asks for a token with whatever was kept. */
function retainingModule() {
  let kept: AdminSurfaceCapabilities | undefined;
  const module: AdminSurfaceHandlerModule = {
    actions: {
      sync: async ({ capabilities }) => { kept = capabilities; return (await capabilities.connections.getAccessToken({ connectionId: 'acme' })).length > 0 ? 'synced' : 'empty'; },
      peek: async () => kept!.connections.getAccessToken({ connectionId: 'acme' }).then(() => 'reached', (error: Error) => error.message),
    },
    bootstrap: async ({ capabilities }) => { kept = capabilities; return { ready: true }; },
  };
  return module;
}

async function boot() {
  const tokenRequests: (string | undefined)[] = [];
  // The api-connections host as the surface connections port sees it: one declared connection, account alice.
  const connections = {
    async readAccount(target: { connectionRef: string }) { return target.connectionRef === ref ? { accountId: 'alice', displayName: 'alice@acme.test' } : null; },
    async getAccessToken(target: { connectionRef: string }, optional: { expectedAccountId?: string } = {}) {
      tokenRequests.push(optional.expectedAccountId);
      if (target.connectionRef !== ref) throw new Error('connection not found');
      return 'acme-token';
    },
  };
  const apiHost = { workspaceId: WORKSPACE, listConnections: async () => [{ descriptor: { connectionId: 'acme' } }], toolConnections: connections } as unknown as ApiConnectionHost;
  const parsed = parseAdminSurfacesFile({ raw: JSON.stringify({ schemaVersion: 1, surfaces: [{
    id: 'account', title: 'Account', entry: 'surface/index.html', files: ['surface/app.mjs'], handlerModule: 'server/handlers.mjs', csp: {},
    connections: [{ id: 'acme' }], bootstrap: { type: 'object', properties: { ready: { type: 'boolean' } }, required: ['ready'] },
    actions: [{ name: 'sync', input: { type: 'object' }, result: { type: 'string' } }, { name: 'peek', effect: 'read', input: { type: 'object' }, result: { type: 'string' } }],
  }] }) });
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.reason);
  const descriptor = parsed.descriptors[0]!;
  const frozen = createFrozenConnectionAccounts();
  const issuedTokens = createIssuedTokenMemories();
  const limiter = { check: async () => ({ allowed: true as const }) };
  const http = fakeHttp().http;
  const state = () => ({ get: async () => null });
  const apiOrigins = async () => [];
  // As composition wires it (agent-plugin-connections.ts): ONE frozen map and ONE token memory for both seams.
  const tools = createAgentPluginToolCapabilities({ connections, http, limiter, frozen, state, apiOrigins });
  const unused = async (): Promise<never> => { throw new Error('unused'); };
  const capabilities = createAdminSurfaceCapabilities({
    tools, publicConfig: { get: async () => null }, stateFor: () => ({ get: async () => null, set: unused, delete: unused }),
    connectionsFor: ({ pluginId, workspaceId, principalId, signal }) => createSurfaceConnections({ host: apiHost, pluginId, workspaceId, principalId, signal, frozen }),
  });
  const handlerModule = descriptor.handlerModule!;
  // One module instance across loads, as a real import is: every refresh re-admits the same module.
  const module = retainingModule();
  const adminHost = createAgentPluginAdminSurfaceHandlers({ workspaceId: WORKSPACE, issuedTokens, capabilities, hostKind: 'hosted',
    loadContributions: async () => ({ items: [{ pluginId: PLUGIN, descriptor: { ...descriptor, handlerModule }, module }], refusals: [] }) });
  await adminHost.refresh();
  const listed: LoadedAdminSurface = { plugin: { pluginId: PLUGIN, packageRoot: '/trusted/acme' }, descriptor };
  const registry = createToolRegistry({});
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) };
  const registered = await registerAgentPluginExecutableTools({ withExtensionApprovalPolicy, registry, workspaceId: WORKSPACE, authorize: allowAll, isActive: async () => true,
    host: { loadContributions: async () => ({ items: [], refusals: [] }), connections, http, limiter, state, apiOrigins, issuedTokens, frozen,
      adminSurfaces: { source: { list: async () => [listed] }, host: adminHost } },
    applyApproval: ({ registration }, { disclose }) => applyToolApprovalPolicy({ registration, surfaces }, { disclose }),
  });
  const executor = createToolExecutor({ registry });
  const peek = () => executor.execute({ toolId: PEEK, principal: { id: 'owner' }, run: { id: 'peek' }, input: { payload: {} } });
  return { executor, surfaces, registered, adminHost, tokenRequests, peek };
}

test('security: capabilities an assistant-run admin action kept cannot reach its confirmed account from a later read', async () => {
  const f = await boot();
  try {
    const call = await startConfirmingCall(f, SYNC, { payload: {} });
    assert.deepEqual(call.rows.filter(([label]) => label === 'Account'), [['Account', 'alice@acme.test']]);
    call.answer('confirm');
    assert.deepEqual((await call.pending).output, { ok: true, result: 'synced' });
    const later = await f.peek();
    assert.equal(later.status, 'completed');
    assert.match(String((later.output as { result?: unknown }).result), ENDED);
    assert.deepEqual(f.tokenRequests, ['alice'], 'only the confirmed call reached the host');
  } finally { f.registered.dispose(); }
});

test('security: capabilities a bootstrap call kept are dead once bootstrap ends, so a later read gets no token', async () => {
  const f = await boot();
  try {
    assert.deepEqual(await f.adminHost.bootstrapData({ context: { workspaceId: WORKSPACE, principalId: 'owner', pluginId: PLUGIN, surfaceId: 'account' } }), { ready: true });
    const later = await f.peek();
    assert.equal(later.status, 'completed');
    assert.match(String((later.output as { result?: unknown }).result), ENDED);
    assert.deepEqual(f.tokenRequests, []);
  } finally { f.registered.dispose(); }
});

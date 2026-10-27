/** Host parity: admin actions use the same handler/permission and the existing confirmation card. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createIssuedTokenMemories } from '@jini-ai/agent-plugins/lifecycle/tools';
import { createAdminSurfaceActionDispatcher, type LoadedAdminSurface } from '@jini-ai/agent-plugins/admin-surfaces';
import type { AuthorizeFn } from '../../../../contracts/core/commands/index.js';
import { applyToolApprovalPolicy } from '../../../../assistant/tool-approval-policy.js';
import { registerAgentPluginExecutableTools, type AgentPluginExecutableToolHost } from '../register.js';
import { allowAll, fakeConnections, fakeHttp, PLUGIN, WORKSPACE, startConfirmingCall } from './fixtures.js';
import { deriveApiConnectionKey } from '@jini-ai/integrations/api-connections';
import { createSurfaceConnections } from '../../../api-connections/surface-connections.js';
import type { ApiConnectionHost } from '../../../api-connections/host.js';
import { createFrozenConnectionAccounts } from '../host-capabilities.js';

const surface: LoadedAdminSurface = {
  plugin: { pluginId: PLUGIN, packageRoot: '/trusted/acme' },
  descriptor: { id: 'account', title: 'Account', entry: 'index.html', files: [], csp: {}, actions: [
    { name: 'sign-in', input: { type: 'object' }, result: { type: 'string' } },
    { name: 'status', effect: 'read', input: { type: 'object' }, result: { type: 'string' } },
    { name: 'disconnect', effect: 'destructive', input: { type: 'object' }, result: { type: 'string' } },
  ] },
};
async function fixture(authorize: AuthorizeFn = allowAll) {
  const registry = createToolRegistry({});
  let active = true;
  let listed: LoadedAdminSurface = surface;
  let calls = 0;
  const handlers = { 'sign-in': async () => { calls++; return 'https://auth.example.test/start'; }, status: async () => 'connected', disconnect: async () => 'disconnected' };
  const host: AgentPluginExecutableToolHost = {
    loadContributions: async () => ({ items: [], refusals: [] }),
    connections: fakeConnections({ accountId: 'alice' }).connections, http: fakeHttp().http,
    limiter: { check: async () => ({ allowed: true }) }, state: () => ({ get: async () => null }), apiOrigins: async () => [], issuedTokens: createIssuedTokenMemories(),
    adminSurfaces: { source: { list: async () => active ? [listed] : [] }, host: {
      refresh: async () => [], handlersFor: () => handlers, bootstrapData: async () => null,
    } },
  };
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) };
  const register = () => registerAgentPluginExecutableTools({ registry, workspaceId: WORKSPACE, host, authorize, isActive: async () => active,
    applyApproval: ({ registration }, { disclose }) => applyToolApprovalPolicy({ registration, surfaces }, { disclose }),
  });
  const registered = await register();
  return { registry, executor: createToolExecutor({ registry }), surfaces, registered, register, handlers, host, calls: () => calls, disable: () => { active = false; }, relist: (next: LoadedAdminSurface) => { listed = next; } };
}
const SIGN_IN = 'p_acme_office__account_sign_in';

test('write defaults to the existing confirmation card and returns the screen handler URL only after confirmation', async () => {
  const f = await fixture();
  try {
    const descriptor = f.registry.list({}).find(row => row.id === SIGN_IN)!;
    assert.deepEqual(descriptor.metadata?.approval, { class: 'publish', confirmation: 'policy' });
    assert.equal(descriptor.readOnly, false); assert.equal(descriptor.sideEffects, 'mutates-durable-state');
    const call = await startConfirmingCall(f, SIGN_IN, { payload: {} });
    assert.match(call.html, /Account: sign-in/); assert.equal(f.calls(), 0);
    call.answer('confirm');
    const result = await call.pending;
    assert.equal(result.status, 'completed');
    const screen = createAdminSurfaceActionDispatcher({ descriptor: surface.descriptor, handlers: f.handlers });
    assert.deepEqual(result.output, await screen.dispatch({ action: 'sign-in', payload: {}, context: {} }));
  } finally { f.registered.dispose(); }
});
test('read/destructive discovery metadata follows declarations, with no confirmation for read', async () => {
  const f = await fixture();
  try {
    const read = f.registry.list({}).find(row => row.id.endsWith('account_status'))!;
    assert.equal(read.readOnly, true); assert.equal(read.sideEffects, 'none');
    assert.deepEqual(read.metadata?.approval, { class: 'read', confirmation: 'direct' });
    const destructive = f.registry.list({}).find(row => row.id.endsWith('account_disconnect'))!;
    assert.equal(destructive.sideEffects, 'deletes-durable-state');
    assert.deepEqual(destructive.metadata?.approval, { class: 'delete', confirmation: 'policy' });
    const result = await f.executor.execute({ toolId: read.id, principal: { id: 'owner' }, run: { id: 'read' }, input: { payload: {} } });
    assert.equal(result.status, 'completed'); assert.deepEqual(result.output, { ok: true, result: 'connected' });
  } finally { f.registered.dispose(); }
});
test('assistant permission alone cannot invoke an admin action or request its confirmation', async () => {
  const permissions: string[] = [];
  const f = await fixture(async request => { permissions.push(request.permission); return { allowed: request.permission === 'admin.assistant.use', reason: 'test' }; });
  try {
    const result = await f.executor.execute({ toolId: SIGN_IN, principal: { id: 'owner' }, run: { id: 'denied' }, input: { payload: {} } });
    assert.notEqual(result.status, 'completed');
    assert.ok(permissions.includes('admin.plugins.enable')); assert.equal(f.calls(), 0);
  } finally { f.registered.dispose(); }
});
test('disable while confirmation is pending prevents execution; a refresh removes every admin tool', async () => {
  const f = await fixture();
  try {
    const call = await startConfirmingCall(f, SIGN_IN, { payload: {} });
    f.disable(); call.answer('confirm');
    const result = await call.pending;
    assert.notEqual(result.status, 'completed'); assert.equal(f.calls(), 0);
    await f.registered.refresh();
    assert.deepEqual(f.registry.list({}), []);

  } finally { f.registered.dispose(); }
});
test('invalid schema input cannot reach a handler or create a card', async () => {
  const f = await fixture();
  try {
    let emitted = false;
    const result = await f.executor.execute({ toolId: SIGN_IN, principal: { id: 'owner' }, run: { id: 'invalid' }, input: { payload: { extra: 'refuse' } } }, { emitSurface: async () => { emitted = true; } });
    assert.notEqual(result.status, 'completed'); assert.equal(emitted, false); assert.equal(f.calls(), 0);
  } finally { f.registered.dispose(); }
});
test('a surface whose declaration changed before confirmation is refused, and its handler never runs', async () => {
  const f = await fixture();
  try {
    const call = await startConfirmingCall(f, SIGN_IN, { payload: {} });
    f.relist({ ...surface, descriptor: { ...surface.descriptor, title: 'Account (changed)' } });
    call.answer('confirm');
    const result = await call.pending;
    assert.notEqual(result.status, 'completed');
    assert.match(JSON.stringify(result), /no longer available/);
    assert.equal(f.calls(), 0);
  } finally { f.registered.dispose(); }
});
test('a switched-off plugin denies its read admin action before the admin permission is checked', async () => {
  const permissions: string[] = [];
  const f = await fixture(async request => { permissions.push(request.permission); return { allowed: true, reason: 'test' }; });
  try {
    const status = f.registry.list({}).find(row => row.id.endsWith('account_status'))!;
    f.disable();
    const result = await f.executor.execute({ toolId: status.id, principal: { id: 'owner' }, run: { id: 'switched-off' }, input: { payload: {} } });
    assert.notEqual(result.status, 'completed');
    assert.equal(permissions.includes('admin.plugins.enable'), false);
  } finally { f.registered.dispose(); }
});
test('without assistant permission the admin gate is never consulted', async () => {
  const permissions: string[] = [];
  const f = await fixture(async request => { permissions.push(request.permission); return { allowed: false, reason: 'test' }; });
  try {
    const status = f.registry.list({}).find(row => row.id.endsWith('account_status'))!;
    const result = await f.executor.execute({ toolId: status.id, principal: { id: 'owner' }, run: { id: 'denied-base' }, input: { payload: {} } });
    assert.notEqual(result.status, 'completed');
    assert.equal(permissions.includes('admin.plugins.enable'), false, 'the base policy denied first');
  } finally { f.registered.dispose(); }
});
test('refresh keeps still-listed admin tools; a disposed registration refuses to refresh', async () => {
  const f = await fixture();
  const before = f.registry.list({}).map(row => row.id).sort();
  await f.registered.refresh();
  assert.deepEqual(f.registry.list({}).map(row => row.id).sort(), before);
  assert.ok(before.includes(SIGN_IN));
  f.registered.dispose();
  assert.deepEqual(f.registry.list({}), []);
  await assert.rejects(() => f.registered.refresh(), /Plugin tool registration was disposed/);
});

test('security: an admin action whose account is switched while its approval waits is refused at token time', async () => {
  const ref = deriveApiConnectionKey({ workspaceId: WORKSPACE, pluginId: PLUGIN, connectionId: 'acme' });
  const account = { accountId: 'alice' };
  const tokenRequests: (string | undefined)[] = [];
  // The api-connections host as the surface connections port sees it: one declared connection, `account` switchable.
  const connections = {
    async readAccount(target: { connectionRef: string }) { return target.connectionRef === ref ? { accountId: account.accountId, displayName: `${account.accountId}@acme.test` } : null; },
    async getAccessToken(target: { connectionRef: string }, optional: { expectedAccountId?: string } = {}) {
      tokenRequests.push(optional.expectedAccountId);
      if (target.connectionRef !== ref) throw new Error('connection not found');
      if (optional.expectedAccountId !== undefined && optional.expectedAccountId !== account.accountId) throw new Error('account-changed');
      return 'acme-token';
    },
  };
  const apiHost = { workspaceId: WORKSPACE, listConnections: async () => [{ descriptor: { connectionId: 'acme' } }], toolConnections: connections } as unknown as ApiConnectionHost;
  const frozen = createFrozenConnectionAccounts();
  const synced: LoadedAdminSurface = { ...surface, descriptor: { ...surface.descriptor, connections: [{ id: 'acme', startParams: [], callbackFields: [] }],
    actions: [{ name: 'sync', input: { type: 'object' }, result: { type: 'boolean' } }] } };
  // The handler host's job, as composition wires it: the surface connections port for this call's scope.
  const handlers = { sync: async ({ context }: { context: { workspaceId: string; principalId?: string; signal?: AbortSignal } }) => {
    const port = createSurfaceConnections({ host: apiHost, pluginId: PLUGIN, workspaceId: context.workspaceId, principalId: context.principalId, signal: context.signal, frozen });
    return (await port.getAccessToken({ connectionId: 'acme' })).length > 0;
  } };
  const registry = createToolRegistry({});
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) };
  const registered = await registerAgentPluginExecutableTools({ registry, workspaceId: WORKSPACE, authorize: allowAll, isActive: async () => true,
    host: { loadContributions: async () => ({ items: [], refusals: [] }), connections, http: fakeHttp().http, limiter: { check: async () => ({ allowed: true }) },
      state: () => ({ get: async () => null }), apiOrigins: async () => [], issuedTokens: createIssuedTokenMemories(), frozen,
      adminSurfaces: { source: { list: async () => [synced] }, host: { refresh: async () => [], handlersFor: () => handlers, bootstrapData: async () => null } } },
    applyApproval: ({ registration }, { disclose }) => applyToolApprovalPolicy({ registration, surfaces }, { disclose }),
  });
  try {
    const f = { executor: createToolExecutor({ registry }), surfaces };
    const call = await startConfirmingCall(f, 'p_acme_office__account_sync', { payload: {} });
    assert.deepEqual(call.rows.filter(([label]) => label === 'Account'), [['Account', 'alice@acme.test']]);
    account.accountId = 'mallory';
    call.answer('confirm');
    const result = await call.pending;
    // The screen's dispatcher reports a handler failure as an outcome, never a token-bearing result.
    assert.equal((result.output as { ok?: boolean } | undefined)?.ok, false, JSON.stringify(result));
    assert.deepEqual(tokenRequests, ['alice'], 'the token request named the account the card showed');
  } finally { registered.dispose(); }
});

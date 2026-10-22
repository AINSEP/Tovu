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

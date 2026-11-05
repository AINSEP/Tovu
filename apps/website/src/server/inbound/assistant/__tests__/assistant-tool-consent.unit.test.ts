import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssistantToolConsentSpec } from '../assistant-tool-consent.js';

const snapshot = { permissions: { enabled: true, capabilities: { userMcp: false } }, revisionSeq: 3, allowed: true };

test('personal MCP consent discloses the project list, inherited run key and external settings write', () => {
  const card = buildAssistantToolConsentSpec({ def: { id: 'antigravity', name: 'Antigravity', externalMcpInjection: 'env-passthrough' }, keys: ['userMcp'], snapshot, stale: false });
  assert.equal(card.toolId, 'settings_set_value');
  assert.equal(card.confirmLabel, 'Allow for Antigravity');
  assert.match(card.warning!, /this project/);
  assert.match(card.warning!, /doesn't approve or log/);
  assert.match(card.warning!, /run key/);
  assert.match(card.warning!, /outside Tovu/);
  assert.match(card.warning!, /backed up first/);
  assert.match(card.warning!, /other chats on this site/);
  assert.equal(card.details[0]?.label, 'Tools provided here');
  assert.deepEqual(card.alternatives, undefined);
});

test('stale cards say so and only the supplied qualified alternatives are offered', () => {
  const card = buildAssistantToolConsentSpec({ def: { id: 'claude', name: 'Claude' }, keys: ['shell'], snapshot, stale: true },
    { alternatives: [{ agentId: 'pi', name: 'pi' }] });
  assert.match(card.description!, /This changed since I asked/);
  assert.deepEqual(card.alternatives, [{ id: 'agent-0', label: 'Use pi', choice: 'pi' }]);
  assert.doesNotMatch(card.warning!, /run key|outside Tovu/);
});

test('the real exchange rejects another principal, ignores altered grant fields and cannot be replayed', async t => {
  const { createSurfaceExchangeStore } = await import('@jini-ai/daemon/surface-exchanges');
  const { createTimeoutScheduler } = await import('@jini-ai/daemon/scheduler');
  const { requestAssistantToolConsent } = await import('../assistant-tool-consent.js');
  const controller = new AbortController(); t.after(() => controller.abort());
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: { nowMs: () => Date.now() },
    idGenerator: { newId: () => 'consent-one' }, defaultChannel: 'mcp-ui' });
  const writes: unknown[] = [];
  const pending = requestAssistantToolConsent({ def: { id: 'antigravity', name: 'Antigravity', externalMcpInjection: 'env-passthrough' },
    keys: ['userMcp'], ctx: { executionId: 'consent-exec', run: { id: 'run-one' }, principal: { id: 'owner' }, input: {}, signal: controller.signal },
    surfaces: { surfaceExchanges: store }, readFresh: async () => snapshot, isLive: () => !controller.signal.aborted,
    allowSelected: async input => { writes.push(input); return true; },
  }, { emitSurface: async () => {} });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(store.deliver({ exchangeId: 'consent-one', principalId: 'different-owner', params: { decision: 'confirm' } },
    { toolId: 'settings_set_value' }), { ok: false, reason: 'binding-mismatch' });
  assert.equal(writes.length, 0);
  assert.deepEqual(store.deliver({ exchangeId: 'consent-one', principalId: 'owner',
    params: { decision: 'confirm', agentId: 'other-agent', site: 'other-site', keys: ['shell'], expectedRevisionSeq: 999 } },
  { toolId: 'settings_set_value' }), { ok: true });
  assert.deepEqual(await pending, { status: 'allowed' });
  assert.deepEqual(writes, [{ agentId: 'antigravity', keys: ['userMcp'], expectedRevisionSeq: 3 }]);
  assert.deepEqual(store.deliver({ exchangeId: 'consent-one', principalId: 'owner', params: { decision: 'confirm' } },
    { toolId: 'settings_set_value' }), { ok: false, reason: 'unknown-or-closed' });
});

test('ending the originating run closes its pending card and never writes', async t => {
  const { createSurfaceExchangeStore } = await import('@jini-ai/daemon/surface-exchanges');
  const { createTimeoutScheduler } = await import('@jini-ai/daemon/scheduler');
  const { requestAssistantToolConsent } = await import('../assistant-tool-consent.js');
  const controller = new AbortController(); t.after(() => controller.abort());
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: { nowMs: () => Date.now() },
    idGenerator: { newId: () => 'consent-terminal' }, defaultChannel: 'mcp-ui' });
  const pending = requestAssistantToolConsent({ def: { id: 'antigravity', name: 'Antigravity' }, keys: ['userMcp'],
    ctx: { executionId: 'consent-exec', run: { id: 'run-one' }, principal: { id: 'owner' }, input: {}, signal: controller.signal },
    surfaces: { surfaceExchanges: store }, readFresh: async () => snapshot, isLive: () => !controller.signal.aborted,
    allowSelected: async () => { throw new Error('must not write'); },
  }, { emitSurface: async () => {} });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(store.size(), 1);
  controller.abort();
  assert.deepEqual(await pending, { status: 'cancelled' });
  assert.equal(store.size(), 0);
});

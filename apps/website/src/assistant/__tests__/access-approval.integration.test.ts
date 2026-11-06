import assert from 'node:assert/strict';
import test from 'node:test';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSystemClock } from '@jini-ai/core/primitives';
import type { SurfaceEmission, ToolExecutionContext } from '@jini-ai/core';
import { approvalToolHandler } from '../../contracts/core/human-confirm.js';

const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture({ approver = true, scopePerson = 'person' } = {}) {
  const controller = new AbortController();
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => 'access-card' }, defaultChannel: 'mcp-ui' }, { idleTtlMs: 1000 });
  const ctx: ToolExecutionContext = { executionId: 'e', principal: { id: 'person' }, run: { id: 'r' }, input: { confirm: true }, signal: controller.signal };
  let active = true, reads = 0, effects = 0;
  const emissions: SurfaceEmission[] = [];
  const surfaces = { surfaceExchanges: store, assertAccessApprover: async ({ principalId }: { principalId: string }) => {
    reads++;
    if (principalId !== 'person' || !active) throw new Error('person is no longer active');
  } };
  const handler = approvalToolHandler({ surfaces: approver ? surfaces : { surfaceExchanges: store },
    prepare: async () => ({}),
    describe: () => ({ toolId: 'settings_set_value', errorCode: 'ACCESS', title: 'Change access?', confirmLabel: 'Allow', details: [],
      access: { resources: [{ id: 'tools', label: 'Tool access', scope: { personId: scopePerson, siteId: 'site' }, previous: [], proposed: ['read'], revision: 'v1' }] },
    }),
    run: async () => { effects++; return { changed: true }; },
  }, { ask: () => false, rememberKey: () => 'old-grant', remembered: {
    has: async () => { throw new Error('access cannot consult memory'); },
    grant: async () => { throw new Error('access cannot create memory'); },
  } });
  const invoke = () => handler(ctx, { emitSurface: async surface => { emissions.push(surface); } });
  const answer = (decision: string, principalId = 'person', toolId = 'settings_set_value') => store.deliver({ exchangeId: 'access-card', principalId, params: { decision } }, { toolId });
  return { controller, store, emissions, invoke, answer, deactivate: () => { active = false; }, state: () => ({ reads, effects }) };
}

test('access always asks once, binds person and tool, and applies only after the exact click', async t => {
  const h = fixture(); t.after(() => h.controller.abort());
  const pending = h.invoke(); await turn();
  assert.equal(h.emissions.length, 1);
  assert.deepEqual(h.state(), { reads: 1, effects: 0 });
  assert.deepEqual(h.answer('confirm', 'other-person'), { ok: false, reason: 'binding-mismatch' });
  assert.deepEqual(h.answer('confirm', 'person', 'external_mcp_save'), { ok: false, reason: 'binding-mismatch' });
  assert.deepEqual(h.answer('confirm'), { ok: true });
  assert.deepEqual(await pending, { changed: true });
  assert.deepEqual(h.state(), { reads: 2, effects: 1 });
  assert.deepEqual(h.answer('confirm'), { ok: false, reason: 'unknown-or-closed' });
});

test('deactivation while reading the access card prevents effects', async t => {
  const h = fixture(); t.after(() => h.controller.abort());
  const pending = h.invoke(); await turn(); h.deactivate(); h.answer('confirm');
  await assert.rejects(pending, /no longer active/);
  assert.deepEqual(h.state(), { reads: 2, effects: 0 });
});

for (const decision of ['cancel', 'abort'] as const) test(`${decision} never writes access`, async t => {
  const h = fixture(); t.after(() => h.controller.abort());
  const pending = h.invoke(); await turn();
  if (decision === 'abort') h.controller.abort(); else h.answer('cancel');
  const result = await pending as { executed: boolean };
  assert.equal(result.executed, false); assert.equal(h.state().effects, 0);
});

test('an access card cannot address another person or omit the live approver check', async t => {
  for (const options of [{ approver: false }, { scopePerson: 'another-person' }]) {
    const h = fixture(options); t.after(() => h.controller.abort());
    await assert.rejects(h.invoke(), /verify the person|belongs to another person/);
    assert.equal(h.emissions.length, 0); assert.equal(h.state().effects, 0);
  }
});

test('expiry closes the access card without writes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = fixture(); t.after(() => h.controller.abort());
  const pending = h.invoke(); await turn(); t.mock.timers.tick(1001);
  const result = await pending as { executed: boolean; reason: string };
  assert.equal(result.executed, false); assert.equal(result.reason, 'expired');
  assert.equal(h.state().effects, 0);
  assert.deepEqual(h.answer('confirm'), { ok: false, reason: 'unknown-or-closed' });
});

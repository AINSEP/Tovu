import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { SurfaceEmission, ToolExecutionContext } from '@jini-ai/core';

import { requireHumanConfirm, type HumanConfirmSpec } from '../human-confirm.js';
import { createSurfaceExchangeStore } from '../tool-surface-exchanges.js';

// Author Checklist (F2.3/F3.4/F3.5/F6.2/F7.1/F7.6/F7.7): run the real helper,
// exchange store and AbortSignal; pin deadlines and IDs; settle owned work in cleanup.
// Counterexamples: drop alternative.choice from the card, omit closeOnAbort,
// ignore an already-aborted signal, or leave an exchange open after send rejects.
// Source mutations are intentionally not applied: this dispatch forbids source edits.
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

function harness(t: TestContext, aborted = false) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-10-04T00:00:00.000Z') });
  const controller = new AbortController();
  if (aborted) controller.abort();
  const store = createSurfaceExchangeStore({ idleTtlMs: 100, maxLifetimeMs: 1_000, newExchangeId: () => 'confirmation-42' });
  const emitted: SurfaceEmission[] = [];
  const ctx: ToolExecutionContext = {
    executionId: 'execution-42', principal: { id: 'operator-9' }, run: { id: 'run-42' },
    input: {}, signal: controller.signal,
  };
  const spec: HumanConfirmSpec = {
    toolId: 'fixture_confirm_action', errorCode: 'FIXTURE', title: 'Approve this action?',
    details: [{ label: 'File', value: 'notes.txt' }], confirmLabel: 'Allow once',
    alternatives: [{ id: 'allow-chat', label: 'Allow for this chat', choice: 'chat' }],
  };
  t.after(async () => {
    controller.abort();
    t.mock.timers.tick(1_000);
    await turn();
  });
  const answer = (params: Record<string, unknown>) => store.deliver({
    exchangeId: 'confirmation-42', toolId: 'fixture_confirm_action', principalId: 'operator-9', params,
  });
  return { controller, store, ctx, spec, emitted, answer,
    emitSurface: async (surface: SurfaceEmission) => { emitted.push(surface); },
  };
}

// F1.1/F2.5/F3.6: inspect the emitted artifact, not a mocked builder's arguments.
// Its action payload is the transport contract; literal expected decisions and IDs
// do not come from the builder, helper constants, or the code under test.
test('the emitted card addresses this exchange and carries distinct confirm, alternative and cancel payloads', async (t) => {
  const h = harness(t);
  const pending = requireHumanConfirm({ ctx: h.ctx, surfaces: { surfaceExchanges: h.store }, spec: h.spec }, { emitSurface: h.emitSurface });
  await turn();
  assert.equal(h.emitted.length, 1);
  assert.equal(h.emitted[0].channel, 'mcp-ui');
  const { resource } = h.emitted[0].payload as { resource: { resource: { uri: string; text: string } } };
  assert.equal(resource.resource.uri, 'ui://tovu/fixture-confirm-action/confirmation-42');
  const plan = /\bvar PLAN = ([^\n]+);/.exec(resource.resource.text);
  assert.ok(plan, 'the HTML sent to the host must contain its button action payloads');
  assert.deepEqual(JSON.parse(plan[1]), {
    confirm: { toolName: 'fixture_confirm_action', params: { __exchangeId: 'confirmation-42', decision: 'confirm' } },
    'allow-chat': { toolName: 'fixture_confirm_action', params: { __exchangeId: 'confirmation-42', decision: 'confirm', choice: 'chat' } },
    cancel: { toolName: 'fixture_confirm_action', params: { __exchangeId: 'confirmation-42', decision: 'cancel' } },
  });
  assert.deepEqual(h.answer({ decision: 'confirm', choice: 'chat' }), { ok: true });
  assert.deepEqual(await pending, { confirmed: true, choice: 'chat' });
  assert.equal(h.store.size(), 0);
});

test('aborting a parked confirmation abandons it and refuses a late confirm', async (t) => {
  const h = harness(t);
  const pending = requireHumanConfirm({ ctx: h.ctx, surfaces: { surfaceExchanges: h.store }, spec: h.spec }, { emitSurface: h.emitSurface });
  await turn();
  assert.equal(h.emitted.length, 1);
  assert.equal(h.store.size(), 1);
  h.controller.abort();
  assert.deepEqual(await pending, { confirmed: false, reason: 'abandoned' });
  assert.equal(h.store.size(), 0);
  assert.deepEqual(h.answer({ decision: 'confirm' }), { ok: false, reason: 'unknown-or-closed' });
});

// F3.5/F6.2: subscribing after AbortSignal.abort() cannot receive a past event.
// Advance the owned deadline so the faulty code yields a precise wrong outcome,
// rather than relying on an unbounded wait to demonstrate the defect.
test('an already-aborted confirmation is abandoned without emitting a new card', async (t) => {
  const h = harness(t, true);
  const pending = requireHumanConfirm({ ctx: h.ctx, surfaces: { surfaceExchanges: h.store }, spec: h.spec }, { emitSurface: h.emitSurface });
  await turn();
  t.mock.timers.tick(100);
  assert.deepEqual(await pending, { confirmed: false, reason: 'abandoned' });
  assert.deepEqual(h.emitted, []);
  assert.equal(h.store.size(), 0);
});

// F6.2/F6.5: propagating the send error alone misses the leaked redeemable exchange.
// Read the real store's routing result before cleanup expires the leaked exchange.
test('a failed surface delivery rejects with the original error and closes its exchange', async (t) => {
  const h = harness(t);
  const failure = new Error('surface stream disconnected');
  await assert.rejects(requireHumanConfirm({ ctx: h.ctx, surfaces: { surfaceExchanges: h.store }, spec: h.spec }, {
    emitSurface: async () => { throw failure; },
  }), (error) => error === failure);
  assert.deepEqual(h.answer({ decision: 'confirm' }), { ok: false, reason: 'unknown-or-closed' });
  assert.equal(h.store.size(), 0);
});

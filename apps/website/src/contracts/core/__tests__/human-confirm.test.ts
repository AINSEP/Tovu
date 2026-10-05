import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurfaceEmission, ToolExecutionContext } from '@jini-ai/core';

import { requireHumanConfirm, type HumanConfirmOutcome } from '../human-confirm.js';
import { createSurfaceExchangeStore } from '../tool-surface-exchanges.js';
import { MCP_UI_EXPIRES_AT_META_KEY, type UIResource } from '@jini-ai/ui/mcp-ui/surfaces';

// Author Checklist: replacing the offered-choice guard with `true` must expose a forged
// choice; dropping every choice must reject the positive case. The real exchange runs, and
// no downstream destructive-tool or permission guard can mask the result (F4.4/F6.2).
// Each case owns its exchange, deterministic ID and abort controller; cleanup releases it.
for (const scenario of [
  { name: 'returns an offered choice on Confirm', alternatives: true, params: { decision: 'confirm', choice: 'chat' }, expected: { confirmed: true, choice: 'chat' } },
  { name: 'ignores a forged choice absent from the offered alternatives', alternatives: true, params: { decision: 'confirm', choice: 'always' }, expected: { confirmed: true } },
  { name: 'ignores a forged choice when the card offered no alternatives', alternatives: false, params: { decision: 'confirm', choice: 'chat' }, expected: { confirmed: true } },
  { name: 'a plain Confirm returns no choice even when alternatives exist', alternatives: true, params: { decision: 'confirm' }, expected: { confirmed: true } },
  { name: 'Cancel cannot return an offered affirmative choice', alternatives: true, params: { decision: 'cancel', choice: 'chat' }, expected: { confirmed: false, reason: 'declined' } },
] satisfies readonly { name: string; alternatives: boolean; params: Record<string, unknown>; expected: HumanConfirmOutcome }[]) {
  test(scenario.name, async (t) => {
    const controller = new AbortController();
    t.after(() => controller.abort());
    const emitted: SurfaceEmission[] = [];
    const store = createSurfaceExchangeStore({ newExchangeId: () => 'confirmation-7' });
    const ctx = {
      executionId: 'execution-7',
      principal: { id: 'operator-7' },
      signal: controller.signal,
    } as ToolExecutionContext;
    const pending = requireHumanConfirm({ ctx, surfaces: { surfaceExchanges: store }, spec: {
      toolId: 'fixture_confirm', errorCode: 'FIXTURE', title: 'Approve this call?',
      details: [{ label: 'Action', value: 'Send the selected message' }], confirmLabel: 'Allow',
      ...(scenario.alternatives ? { alternatives: [{ id: 'allow-chat', label: 'Allow for this chat', choice: 'chat' }] } : {}),
    } }, { emitSurface: async (surface: SurfaceEmission) => { emitted.push(surface); } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(emitted.length, 1, 'the real dialog must be emitted before answering');
    assert.equal(emitted[0].channel, 'mcp-ui');
    assert.deepEqual(store.deliver({
      exchangeId: 'confirmation-7', toolId: 'fixture_confirm', principalId: 'operator-7', params: scenario.params,
    }), { ok: true });
    assert.deepEqual(await pending, scenario.expected);
    assert.equal(store.size(), 0, 'the one-shot dialog must close after the answer');
  });
}

test('the card carries the exchange deadline, so the chat can count it down and close it on time', async (t) => {
  const controller = new AbortController();
  t.after(() => controller.abort());
  const emitted: SurfaceEmission[] = [];
  const store = createSurfaceExchangeStore({ newExchangeId: () => 'confirmation-8', nowMs: () => 1_000_000 });
  const ctx = { executionId: 'execution-8', principal: { id: 'operator-8' }, signal: controller.signal } as ToolExecutionContext;
  const pending = requireHumanConfirm({ ctx, surfaces: { surfaceExchanges: store }, spec: {
    toolId: 'fixture_confirm', errorCode: 'FIXTURE', title: 'Approve this call?', details: [], confirmLabel: 'Allow',
  } }, { emitSurface: async (surface: SurfaceEmission) => { emitted.push(surface); } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const resource = emitted[0].payload['resource'] as UIResource;
  // Default idle deadline (5 min) comes before the 5.5 min lifetime ceiling.
  assert.equal(resource.resource._meta?.[MCP_UI_EXPIRES_AT_META_KEY], 1_000_000 + 5 * 60 * 1000);
  store.deliver({ exchangeId: 'confirmation-8', toolId: 'fixture_confirm', principalId: 'operator-8', params: { decision: 'cancel' } });
  assert.deepEqual(await pending, { confirmed: false, reason: 'declined' });
});

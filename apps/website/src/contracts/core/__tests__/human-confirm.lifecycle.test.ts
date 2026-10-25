import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { requireInputRecord, type SurfaceEmission, type ToolExecutionContext } from '@jini-ai/core';

import { approvalToolHandler, humanConfirmedToolHandler, notConfirmedResult, refuseUnexpectedKeys, requireHumanConfirm, type HumanConfirmSpec } from '../human-confirm.js';
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


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
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => 'confirmation-42' }, defaultChannel: "mcp-ui" }, { idleTtlMs: 100, maxLifetimeMs: 1_000 });
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
  const answer = (params: Record<string, unknown>) => store.deliver({ exchangeId: 'confirmation-42', principalId: 'operator-9', params }, { toolId: 'fixture_confirm_action' });
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

test('a headless call is refused before an exchange is opened', async (t) => {
  const h = harness(t);
  await assert.rejects(requireHumanConfirm({ ctx: h.ctx, surfaces: { surfaceExchanges: h.store }, spec: h.spec }), {
    message: 'FIXTURE_NO_CONFIRMATION_CHANNEL: fixture_confirm_action: this execution context has no interactive confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.',
  });
  assert.equal(h.store.size(), 0);
});

test('a confirmation expires without granting the action', async (t) => {
  const h = harness(t);
  const pending = requireHumanConfirm({ ctx: h.ctx, surfaces: { surfaceExchanges: h.store }, spec: h.spec }, { emitSurface: h.emitSurface });
  await turn();
  t.mock.timers.tick(100);
  assert.deepEqual(await pending, { confirmed: false, reason: 'expired' });
  assert.equal(h.store.size(), 0);
  assert.deepEqual(h.answer({ decision: 'confirm' }), { ok: false, reason: 'unknown-or-closed' });
});

test('the card renders its description, warning, danger styling and custom cancel label', async (t) => {
  const h = harness(t);
  const spec = { ...h.spec, description: 'Only the selected file', warning: 'This cannot be undone', danger: true, cancelLabel: 'Keep file' };
  const pending = requireHumanConfirm({ ctx: h.ctx, surfaces: { surfaceExchanges: h.store }, spec }, { emitSurface: h.emitSurface });
  await turn();
  const { resource } = h.emitted[0].payload as { resource: { resource: { text: string } } };
  assert.match(resource.resource.text, /Only the selected file/);
  assert.match(resource.resource.text, /This cannot be undone/);
  assert.match(resource.resource.text, /Keep file/);
  assert.match(resource.resource.text, /class="[^"]*mcpui-button-danger[^"]*"/);
  h.answer({ decision: 'cancel' });
  assert.deepEqual(await pending, { confirmed: false, reason: 'declined' });
});

for (const [reason, result] of [
  ['declined', { cancelled: true, note: 'The user cancelled. Nothing was changed.' }],
  ['expired', { cancelled: false, reason: 'expired', note: 'The user did not answer the confirmation dialog before it expired. Nothing was changed. Do not retry this action or reopen its confirmation automatically. Tell the user it expired and nothing changed, then wait for a new explicit request.' }],
  ['abandoned', { cancelled: false, reason: 'abandoned', note: 'The confirmation dialog was closed because the run ended. Nothing was changed.' }],
] as const) test(`a ${reason} confirmation returns the precise model-facing refusal`, () => {
  assert.deepEqual(notConfirmedResult({ confirmed: false, reason }), result);
});

test('allowed input keys pass and the first unexpected key is named even when it is empty', () => {
  assert.equal(refuseUnexpectedKeys({ id: 'file' }, ['id']), undefined);
  assert.equal(refuseUnexpectedKeys({}, []), undefined);
  assert.throws(() => refuseUnexpectedKeys({ id: 'file', confirm: true, token: 'forged' }, ['id']), {
    message: "'confirm' is not an input of this tool. Only a click in the confirm dialog confirms it — nothing in the tool input can.",
  });
  assert.throws(() => refuseUnexpectedKeys({ '': true }, []), {
    message: "'' is not an input of this tool. Only a click in the confirm dialog confirms it — nothing in the tool input can.",
  });
});

test('the compatibility handler prepares, asks and runs with the authenticated human confirmer', async (t) => {
  const h = harness(t);
  const handler = humanConfirmedToolHandler({ surfaceExchanges: h.store }, {
    flag: 'removed',
    prepare: async (ctx) => ({ file: requireInputRecord({ input: ctx.input }).file }),
    dialog: (prepared) => ({ ...h.spec, details: [{ label: 'File', value: String(prepared.file) }] }),
    run: async (_ctx, prepared, confirmer) => ({ removed: prepared.file, confirmer }),
  });
  const pending = handler({ ...h.ctx, input: { file: 'notes.txt' } }, { emitSurface: h.emitSurface });
  await turn();
  assert.equal(h.emitted.length, 1);
  h.answer({ decision: 'confirm' });
  assert.deepEqual(await pending, { removed: 'notes.txt', confirmer: { id: 'operator-9', kind: 'user' } });
});

test('the default approval handler reports cancellation under executed and never runs the effect', async (t) => {
  const h = harness(t);
  let effects = 0;
  const handler = approvalToolHandler({ surfaces: { surfaceExchanges: h.store },
    prepare: async () => 'file', describe: () => h.spec,
    run: async () => { effects++; },
  });
  const pending = handler(h.ctx, { emitSurface: h.emitSurface });
  await turn();
  h.answer({ decision: 'cancel' });
  assert.deepEqual(await pending, { executed: false, cancelled: true, note: 'The user cancelled. Nothing was changed.' });
  assert.equal(effects, 0);
});

test('an approval that does not require asking runs with its prepared value and no card', async (t) => {
  const h = harness(t);
  const handler = approvalToolHandler({ surfaces: { surfaceExchanges: h.store },
    prepare: async () => ({ file: 'notes.txt' }), describe: () => h.spec,
    run: async ({ prepared, confirmer }) => ({ ...prepared, confirmer }),
  }, { ask: ({ prepared }) => prepared.file !== 'notes.txt' });
  assert.deepEqual(await handler(h.ctx), { file: 'notes.txt', confirmer: { id: 'operator-9', kind: 'user' } });
  assert.equal(h.store.size(), 0);
});

test('a remembered approval uses the prepared key and skips a new card', async (t) => {
  const h = harness(t);
  const handler = approvalToolHandler({ surfaces: { surfaceExchanges: h.store },
    prepare: async () => ({ key: 'chat:42' }), describe: () => h.spec,
    run: async ({ prepared }) => ({ approved: prepared.key }),
  }, { rememberKey: ({ prepared }) => prepared.key, remembered: {
    has: async ({ key }) => key === 'chat:42',
    grant: async () => { throw new Error('existing grant must not be rewritten'); },
  } });
  assert.deepEqual(await handler(h.ctx), { approved: 'chat:42' });
  assert.equal(h.store.size(), 0);
});

test('custom declined results handle an abort before preparation', async (t) => {
  const h = harness(t, true);
  const handler = approvalToolHandler({ surfaces: { surfaceExchanges: h.store },
    prepare: async () => { throw new Error('aborted work must not prepare'); },
    describe: () => h.spec, run: async () => { throw new Error('aborted work must not run'); },
  }, { declined: ({ reason, prepared }) => ({ refused: reason, prepared: prepared ?? null }) });
  assert.deepEqual(await handler(h.ctx), { refused: 'abandoned', prepared: null });
  assert.equal(h.store.size(), 0);
});

test('L079: empty description and warning are omitted, cancel label stays empty, and non-string choice is ignored', async t => {
  const h = harness(t);
  const pending = requireHumanConfirm({ ctx: h.ctx, surfaces: { surfaceExchanges: h.store }, spec: {
    ...h.spec, description: '', warning: '', cancelLabel: '', alternatives: [],
  } }, { emitSurface: h.emitSurface });
  await turn();
  assert.equal(h.emitted.length, 1);
  const { resource } = h.emitted[0].payload as { resource: { resource: { text: string } } };
  const html = resource.resource.text;
  assert.match(html, /<h1 class="mcpui-title">Approve this action\?<\/h1>/);
  assert.match(html, /data-mcpui-action="confirm"[^>]*>Allow once<\/button>/);
  assert.doesNotMatch(html, /<p class="mcpui-(?:description|warning)">/);
  const cancel = /<button\b[^>]*data-mcpui-action="cancel"[^>]*>([\s\S]*?)<\/button>/.exec(html);
  assert.ok(cancel, 'the emitted card must still offer cancel');
  assert.equal(cancel[1], '', 'an empty cancelLabel must not fall back to Cancel');
  h.answer({ decision: 'confirm', choice: 42 });
  assert.deepEqual(await pending, { confirmed: true });
  assert.equal(h.store.size(), 0);
});

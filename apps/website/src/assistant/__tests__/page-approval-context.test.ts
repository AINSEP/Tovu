import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolExecutionContext } from '@jini-ai/core';
import type { ToolExecutor } from '@jini-ai/daemon';
import { createPageApprovalContext, pageApprovalOptions } from '../page-approval-context.js';

const ctx: ToolExecutionContext = {
  executionId: 'click', principal: { id: 'owner' }, run: { id: 'run' },
  input: { handle: 'opaque', __frontendNavigationRevision: 999 }, signal: new AbortController().signal,
};

test('only page.click receives a navigation context port during frontend composition', () => {
  const execute: ToolExecutor['execute'] = async () => { throw new Error('composition must not read the browser'); };
  assert.ok(pageApprovalOptions({ toolId: 'page.click', execute }).context);
  for (const toolId of ['page.find_elements', 'page.navigate', 'chat.open']) assert.deepEqual(pageApprovalOptions({ toolId, execute }), {});
});

test('page approval captures one read with the original trusted owner and signal, then overwrites caller context', async () => {
  const calls: Parameters<ToolExecutor['execute']>[] = [];
  const context = createPageApprovalContext({ execute: async (...args) => {
    calls.push(args);
    return { executionId: 'read', status: 'completed', output: { elements: [], navigationRevision: 0 } };
  } });
  const snapshot = await context.capture({ ctx });
  assert.equal(snapshot, 0);
  assert.deepEqual(calls, [[{
    principal: ctx.principal, run: ctx.run, toolId: 'page.find_elements', input: { query: '__tovu_navigation_context__' },
  }, { signal: ctx.signal }]]);
  const prepared = context.prepare({ ctx, snapshot });
  assert.deepEqual(prepared.input, { handle: 'opaque', __frontendNavigationRevision: 0 });
  assert.equal(prepared.principal, ctx.principal);
  assert.equal(prepared.signal, ctx.signal);
  assert.deepEqual(ctx.input, { handle: 'opaque', __frontendNavigationRevision: 999 });
});

for (const revision of [undefined, null, -1, NaN, Infinity, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
  test(`an unusable navigation revision ${String(revision)} refuses before preparing an effect`, async () => {
    const context = createPageApprovalContext({ execute: async () => ({ executionId: 'read', status: 'completed', output: { navigationRevision: revision } }) });
    await assert.rejects(context.capture({ ctx }), /could not verify the current view/);
    assert.throws(() => context.prepare({ ctx, snapshot: revision }), /could not verify the current view/);
  });
}

test('a failed or malformed view read refuses with an actionable message', async () => {
  for (const result of [{ status: 'failed', error: 'offline' }, { status: 'completed', output: null }] as const) {
    const context = createPageApprovalContext({ execute: async () => ({ executionId: 'read', ...result }) });
    await assert.rejects(context.capture({ ctx }), /could not verify the current view/);
  }
});

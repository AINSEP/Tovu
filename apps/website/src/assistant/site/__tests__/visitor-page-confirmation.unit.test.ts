import test from 'node:test';
import assert from 'node:assert/strict';
import { visitorPageNeedsConfirmation } from '../visitor-page-tools.js';
const publication = { revision: 'rev', elements: [{ handle: 'send', action: 'submit' as const }, { handle: 'menu', action: 'menu' as const }] };
test('fill/select and a published submitter always require confirmation, menu clicks do not', () => {
  for (const toolId of ['page.fill', 'page.select_option']) assert.equal(visitorPageNeedsConfirmation({ toolId, input: { handle: 'field' }, publication }), true);
  assert.equal(visitorPageNeedsConfirmation({ toolId: 'page.click', input: { handle: 'send' }, publication }), true);
  assert.equal(visitorPageNeedsConfirmation({ toolId: 'page.click', input: { handle: 'menu' }, publication }), false);
});

import { confirmationFixture } from './visitor-confirmations.fixture.js';
import { createVisitorExecutor, type VisitorExecutionPorts } from '../visitor-executor.js';
import { parseVisitorToolPolicy } from '#src/contracts/site-assistant/visitor-tools';

function fillFixture() {
  const f = confirmationFixture();
  const owner = { workspaceId: 'site', principalId: 'guest', tabId: 'tab' };
  const policy = parseVisitorToolPolicy({ value: { version: 1, tools: { 'page.fill': { mode: 'auto' } } } });
  let revision = '1'; let effects = 0; let applied: unknown;
  let emitted!: (challenge: string) => void;
  const prompt = new Promise<string>(resolve => { emitted = resolve; });
  const ports: VisitorExecutionPorts = { owner, initialPolicy: policy, readPolicy: async () => policy,
    readSnapshot: async () => ({ policy, revision }), confirmation: { ...f.confirmations, emit: directive => emitted(directive.challengeId) },
    budgets: { charge: async () => true }, clock: f.clock, ids: { newId: () => 'attempt' }, workspaceId: 'site', runId: 'run', ip: 'ip',
    sink: { append: async () => {} }, signal: f.abort.signal, reportError: error => { throw error; } };
  const capabilities = [{ name: 'page.fill', visitorOfferable: true as const, displayTitle: 'Fill', displayDescription: 'Fill a public field.',
    requiresConfirmation: () => true, execute: async ({ input }: { input: unknown }) => { effects++; applied = input; return { result: { filled: true } }; } }];
  return { ...f, ports, owner, prompt, executor: createVisitorExecutor({ capabilities }, { ports }), capabilities,
    revise() { revision = '2'; }, effects: () => effects, applied: () => applied };
}
for (const decision of ['decline', 'expire', 'policy-change', 'cancel'] as const) test(`Auto fill refuses ${decision} without effects`, async () => {
  const f = fillFixture();
  const pending = f.executor.invoke({ name: 'page.fill', input: { handle: 'field', text: 'value' }, caller: 'anonymous-visitor' });
  const challengeId = await f.prompt;
  if (decision === 'expire') f.advance(60_000);
  else if (decision === 'cancel') f.abort.abort();
  else {
    if (decision === 'policy-change') f.revise();
    await f.confirmations.confirm({ challengeId, allow: decision !== 'decline', owner: f.owner });
  }
  assert.equal((await pending).kind, 'refused'); assert.equal(f.effects(), 0);
});
test('approval binds guest/tab and immutable args, consumes once, and never accepts an assistant approval', async () => {
  const f = fillFixture();
  const input = { handle: 'field', text: 'original', approved: true };
  const pending = f.executor.invoke({ name: 'page.fill', input, caller: 'anonymous-visitor' });
  const challengeId = await f.prompt;
  assert.equal(f.effects(), 0);
  input.text = 'changed'; input.handle = 'other';
  assert.equal(await f.confirmations.confirm({ challengeId, allow: true, owner: { ...f.owner, tabId: 'other' } }), false);
  assert.equal(await f.confirmations.confirm({ challengeId, allow: true, owner: { ...f.owner, principalId: 'other' } }), false);
  assert.equal(await f.confirmations.confirm({ challengeId, allow: true, owner: f.owner }), true);
  assert.equal((await pending).kind, 'ok'); assert.equal(f.effects(), 1);
  assert.deepEqual(f.applied(), { handle: 'field', text: 'original', approved: true });
  assert.equal(await f.confirmations.confirm({ challengeId, allow: true, owner: f.owner }), false);
});
test('Auto fill without a confirmation channel cannot execute', async () => {
  const f = fillFixture(); const { confirmation, ...ports } = f.ports;
  const executor = createVisitorExecutor({ capabilities: f.capabilities }, { ports });
  assert.equal((await executor.invoke({ name: 'page.fill', input: { handle: 'field', text: 'x' }, caller: 'anonymous-visitor' })).kind, 'refused');
  assert.equal(f.effects(), 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { React, act, createRoot, installDom } from './react-dom-harness';
import { useSiteToolConfirmation } from '../SiteToolConfirmation.hooks';

const directive = { kind: 'tool_confirmation' as const, challengeId: 'a'.repeat(22), title: 'Allow search?', summary: 'Search posts.' };

test('hook discards expiry, repeated clicks and teardown without posting an approval', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { dom, restore } = installDom();
  const root = createRoot(dom.window.document.getElementById('root')!);
  let control!: ReturnType<typeof useSiteToolConfirmation>;
  const decisions: unknown[] = [];
  const confirm = async (input: unknown) => { decisions.push(input); return true; };
  function Host() {
    control = useSiteToolConfirmation({}, { confirm });
    return control.pending ? React.createElement('button', { ref: control.cancelRef }, 'Cancel') : null;
  }
  t.after(async () => { await act(async () => root.unmount()); restore(); });
  await act(async () => root.render(React.createElement(Host)));
  act(() => { void control.decide({ allow: true }); });
  act(() => control.receive({ directive }));
  assert.equal(dom.window.document.activeElement?.textContent, 'Cancel');
  act(() => t.mock.timers.tick(60_000));
  assert.equal(control.pending, null);
  act(() => { void control.decide({ allow: true }); });
  assert.deepEqual(decisions, []);
  act(() => control.receive({ directive }));
  act(() => { void control.decide({ allow: false }); void control.decide({ allow: true }); });
  assert.deepEqual(decisions, [{ challengeId: directive.challengeId, allow: false }]);
  act(() => control.receive({ directive }));
  await act(async () => root.render(null));
  act(() => t.mock.timers.tick(60_000));
  assert.equal(decisions.length, 1);
});

for (const allow of [true, false]) test(`failed React decision allow=${allow} keeps the prompt for an explicit retry`, async t => {
  const { dom, restore } = installDom();
  const root = createRoot(dom.window.document.getElementById('root')!);
  let control!: ReturnType<typeof useSiteToolConfirmation>;
  let settle!: (ok: boolean) => void;
  const decisions: unknown[] = [];
  const confirm = (input: unknown) => {
    decisions.push(input);
    return decisions.length === 1 ? new Promise<boolean>(resolve => { settle = resolve; }) : Promise.resolve(true);
  };
  function Host() {
    control = useSiteToolConfirmation({}, { confirm });
    return control.pending ? React.createElement('button', { ref: control.cancelRef }, 'Cancel') : null;
  }
  t.after(async () => { await act(async () => root.unmount()); restore(); });
  await act(async () => root.render(React.createElement(Host)));
  act(() => control.receive({ directive }));
  act(() => { void control.decide({ allow }); void control.decide({ allow }); });
  assert.equal(decisions.length, 1, 'an unresolved decision blocks a second send');
  assert.equal(control.pending, directive, 'sending keeps the same prompt');
  await act(async () => settle(false));
  assert.equal(control.pending, directive, 'failure leaves the same prompt');
  assert.equal(control.sendFailed, true, 'failure exposes the notice');
  await act(async () => { await control.decide({ allow }); });
  assert.deepEqual(decisions, [{ challengeId: directive.challengeId, allow }, { challengeId: directive.challengeId, allow }], 'the visitor explicitly retries the same decision');
  assert.equal(control.pending, null, 'successful retry clears the prompt');
  assert.equal(control.sendFailed, false, 'successful retry clears the notice');
});

for (const replacement of [false, true]) test(`late React failure cannot revive or change a prompt after replacement=${replacement}`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { dom, restore } = installDom();
  const root = createRoot(dom.window.document.getElementById('root')!);
  let control!: ReturnType<typeof useSiteToolConfirmation>;
  let settle!: (ok: boolean) => void;
  const confirm = () => new Promise<boolean>(resolve => { settle = resolve; });
  function Host() {
    control = useSiteToolConfirmation({}, { confirm });
    return control.pending ? React.createElement('button', { ref: control.cancelRef }, 'Cancel') : null;
  }
  t.after(async () => { await act(async () => root.unmount()); restore(); });
  await act(async () => root.render(React.createElement(Host)));
  act(() => control.receive({ directive }));
  act(() => { void control.decide({ allow: true }); });
  const next = { ...directive, challengeId: 'b'.repeat(22) };
  act(() => { if (replacement) control.receive({ directive: next }); else t.mock.timers.tick(60_000); });
  await act(async () => settle(false));
  assert.equal(control.pending, replacement ? next : null, 'late failure preserves the replacement or expired prompt');
  assert.equal(control.sendFailed, false, 'late failure cannot add a notice');
});

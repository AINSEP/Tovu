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
  act(() => control.decide({ allow: true }));
  act(() => control.receive({ directive }));
  assert.equal(dom.window.document.activeElement?.textContent, 'Cancel');
  act(() => t.mock.timers.tick(60_000));
  assert.equal(control.pending, null);
  act(() => control.decide({ allow: true }));
  assert.deepEqual(decisions, []);
  act(() => control.receive({ directive }));
  act(() => { control.decide({ allow: false }); control.decide({ allow: true }); });
  assert.deepEqual(decisions, [{ challengeId: directive.challengeId, allow: false }]);
  act(() => control.receive({ directive }));
  await act(async () => root.render(null));
  act(() => t.mock.timers.tick(60_000));
  assert.equal(decisions.length, 1);
});

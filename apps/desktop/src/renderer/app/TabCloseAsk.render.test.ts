/**
 * @file The tab close ask as rendered: its three answers and where focus starts, the failure line,
 * the busy state, and nothing at all with no site to ask about.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { act, dom, mount, site, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { TabCloseAsk } from './TabCloseAsk.js';

after(closeHost);

function render(t: TestContext, over: { project?: ReturnType<typeof site> | null; stopping?: boolean; error?: string | null } = {}) {
  const calls: string[] = [];
  const view = mount({ t, element: createElement(TabCloseAsk, {
    project: site('a', { displayName: 'Shop' }), stopping: false, error: null,
    onStop: () => { calls.push('stop'); }, onKeepRunning: () => { calls.push('keep'); }, onCancel: () => { calls.push('cancel'); },
    ...over,
  }) });
  const ask = dom.window.document.querySelector('[role="alertdialog"]');
  const buttons = [...(ask?.querySelectorAll('button') ?? [])];
  return { view, calls, ask, buttons };
}

test('asks by name; each answer reports itself, and focus starts on Keep running', (t) => {
  const { ask, buttons, calls } = render(t);
  assert.equal(ask?.getAttribute('aria-label'), 'Stop Shop too?');
  assert.match(ask?.textContent ?? '', /Stop Shop too\?/);
  assert.deepEqual(buttons.map((button) => button.textContent), ['Cancel', 'Keep running', 'Stop']);
  assert.equal(dom.window.document.activeElement, buttons[1]);
  for (const button of buttons) act(() => { button.click(); });
  assert.deepEqual(calls, ['cancel', 'keep', 'stop']);
  assert.equal(ask?.querySelector('[role="alert"]'), null);
});

test('while stopping every answer is disabled and Stop says so', (t) => {
  const { buttons } = render(t, { stopping: true });
  assert.deepEqual(buttons.map((button) => button.disabled), [true, true, true]);
  assert.equal(buttons[2]?.textContent, 'Stopping…');
});

test('a failed stop shows the reason', (t) => {
  const { ask } = render(t, { error: 'the site did not stop in time' });
  assert.equal(ask?.querySelector('[role="alert"]')?.textContent, 'the site did not stop in time');
});

test('with no site to ask about nothing is drawn', (t) => {
  assert.equal(render(t, { project: null }).ask, null);
});

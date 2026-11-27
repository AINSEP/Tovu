import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installDom } from './dom-hook-harness.js';
import { useProductScreen } from './use-product-screen.hooks.js';

test('screen reports follow visible transitions without counting Strict Mode replay or hidden state', (t) => {
  const window = installDom();
  const previous = window.tovuTelemetry;
  const received: unknown[] = [];
  window.tovuTelemetry = { report: ({ payload }) => received.push(payload) };
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  t.after(() => {
    try { act(() => root.unmount()); }
    finally { host.remove(); window.tovuTelemetry = previous; }
  });
  function Screen({ id }: { id: string | null }) {
    useProductScreen({ screen: id });
    return null;
  }
  const show = (id: string | null) => act(() => root.render(createElement(StrictMode, null, createElement(Screen, { id }))));
  show('projects');
  assert.deepEqual(received, [{ kind: 'screen', id: 'projects' }]);
  show('projects');
  show(null);
  assert.deepEqual(received, [{ kind: 'screen', id: 'projects' }]);
  show('projects');
  show('agents');
  assert.deepEqual(received, [
    { kind: 'screen', id: 'projects' }, { kind: 'screen', id: 'projects' }, { kind: 'screen', id: 'agents' },
  ]);
});

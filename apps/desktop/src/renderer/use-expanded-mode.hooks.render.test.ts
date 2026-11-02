/**
 * @file `useExpandedMode` rendered from its real module under jsdom. The first test drives the
 * default port (the jsdom `window`), moved from `App.hooks.render.test.ts`; the second injects a
 * counting target so the Escape listener's lifetime is asserted, not just its effect.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { countingTarget, renderHookWithView as renderHook } from './app-hooks.test-support.js';
import { installDom } from './dom-hook-harness.js';
import { useExpandedMode, type KeydownTarget } from './use-expanded-mode.hooks.js';

test('useExpandedMode: toggles, collapses on Escape only, and never outlives the workspace it immerses', (t) => {
  const window = installDom();
  let showSiteTab = true;
  const hook = renderHook(t, () => useExpandedMode(showSiteTab));
  const press = (key: string) => act(() => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key })); });
  assert.equal(hook.current().expanded, false);
  act(() => hook.current().toggleExpanded());
  assert.equal(hook.current().expanded, true);
  press('a');
  assert.equal(hook.current().expanded, true);
  press('Escape');
  assert.equal(hook.current().expanded, false);
  act(() => hook.current().toggleExpanded());
  showSiteTab = false;
  hook.rerender();
  assert.equal(hook.current().expanded, false);
});

test('useExpandedMode: listens for Escape only while expanded, and releases the listener on collapse and unmount', (t) => {
  const keys = countingTarget<KeydownTarget>();
  let showSiteTab = true;
  const hook = renderHook(t, () => useExpandedMode(showSiteTab, { target: keys.port }));
  assert.equal(keys.live(), 0, 'nothing to collapse, nothing listening');
  act(() => hook.current().toggleExpanded());
  assert.equal(keys.live(), 1);
  keys.dispatch('keydown', { key: 'Enter' });
  assert.equal(hook.current().expanded, true);
  keys.dispatch('keydown', { key: 'Escape' });
  assert.deepEqual([hook.current().expanded, keys.live()], [false, 0]);

  act(() => hook.current().toggleExpanded());
  showSiteTab = false;
  hook.rerender();
  assert.deepEqual([hook.current().expanded, keys.live()], [false, 0], 'losing the workspace collapses and detaches');

  showSiteTab = true;
  hook.rerender();
  assert.equal(hook.current().expanded, false, 'getting a workspace back never re-expands on its own');
  act(() => hook.current().toggleExpanded());
  assert.equal(keys.live(), 1);
  hook.unmount();
  assert.equal(keys.live(), 0);
});

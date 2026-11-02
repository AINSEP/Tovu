/**
 * @file `useProjectTabs` rendered from its real module under jsdom. Moved from
 * `App.hooks.render.test.ts` with the split.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { renderHookWithView as renderHook } from './app-hooks.test-support.js';
import { useProjectTabs } from './use-project-tabs.hooks.js';

test('useProjectTabs: opening adds once and selects, remembers an admin page, and closing picks a neighbour', (t) => {
  const hook = renderHook(t, () => useProjectTabs());
  act(() => hook.current().openProjectTab('a'));
  act(() => hook.current().openProjectTab('b', { adminPage: 'import' }));
  act(() => hook.current().openProjectTab('c'));
  act(() => hook.current().openProjectTab('a'));
  assert.deepEqual(hook.current().openTabs, ['a', 'b', 'c']);
  assert.equal(hook.current().activeTab, 'a');
  const pages = hook.current().adminPages;
  assert.deepEqual(pages, { b: 'import' });
  act(() => hook.current().openProjectTab('b', { adminPage: 'import' }));
  assert.equal(hook.current().adminPages, pages, 'reopening on the same page keeps the same record');
  act(() => hook.current().closeProjectTab('c'));
  assert.equal(hook.current().adminPages, pages, 'closing a tab with no page leaves the pages untouched');
  assert.equal(hook.current().activeTab, 'b', 'reopening b selected it');
  act(() => hook.current().closeProjectTab('b'));
  assert.deepEqual(hook.current().openTabs, ['a']);
  assert.equal(hook.current().activeTab, 'a');
  assert.deepEqual(hook.current().adminPages, {});
});

test('useProjectTabs: closing a tab that is not selected keeps the selection where it is', (t) => {
  const hook = renderHook(t, () => useProjectTabs());
  act(() => hook.current().openProjectTab('a'));
  act(() => hook.current().openProjectTab('b'));
  act(() => hook.current().closeProjectTab('a'));
  assert.deepEqual([hook.current().openTabs, hook.current().activeTab], [['b'], 'b']);
  act(() => hook.current().closeProjectTab('b'));
  assert.deepEqual([hook.current().openTabs, hook.current().activeTab], [[], null], 'the last tab closed returns to the sites home tab');
});

test('useProjectTabs: closing the selected middle tab selects its right neighbour, then the left one when none is to its right', (t) => {
  const hook = renderHook(t, () => useProjectTabs());
  for (const id of ['a', 'b', 'c']) act(() => hook.current().openProjectTab(id));
  act(() => hook.current().setActiveTab('b'));
  act(() => hook.current().closeProjectTab('b'));
  assert.deepEqual([hook.current().openTabs, hook.current().activeTab], [['a', 'c'], 'c']);
  act(() => hook.current().closeProjectTab('c'));
  assert.deepEqual([hook.current().openTabs, hook.current().activeTab], [['a'], 'a']);
});

test('useProjectTabs: reopening a tab without a page keeps the admin page it was sent to', (t) => {
  const hook = renderHook(t, () => useProjectTabs());
  act(() => hook.current().openProjectTab('a', { adminPage: 'import' }));
  act(() => hook.current().openProjectTab('b'));
  assert.deepEqual([hook.current().adminPages, hook.current().activeTab], [{ a: 'import' }, 'b']);
  act(() => hook.current().openProjectTab('a'));
  assert.deepEqual([hook.current().adminPages, hook.current().activeTab], [{ a: 'import' }, 'a'], 'reopening without a page keeps where the tab was sent');
});

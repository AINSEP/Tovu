/**
 * @file `useRunnerNavigation` and `useSectionNav` rendered from their real module under jsdom,
 * together with the real `useProjectTabs` whose setter they drive. The bridge lookup is injected.
 * Moved from `App.hooks.render.test.ts` with the split.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import type { RunnerSectionId } from '../contracts/sections.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { renderHookWithView as renderHook } from './app-hooks.test-support.js';
import { useProjectTabs } from './use-project-tabs.hooks.js';
import { useRunnerNavigation, useSectionNav } from './use-section-nav.hooks.js';
import { deriveSitesHomeView } from './sites-home-view.js';

function useNavigationShell(getBridge: () => Pick<RunnerInventoryBridge, 'onNavigate'> | undefined) {
  const tabs = useProjectTabs();
  const nav = useSectionNav(tabs.setActiveTab);
  useRunnerNavigation(nav.setActiveId, tabs.setActiveTab, { getBridge });
  return { tabs, nav };
}

test('useRunnerNavigation: an agent navigate moves the section and returns to the sites home tab, then detaches', (t) => {
  const listeners = new Set<(section: RunnerSectionId) => void>();
  const getBridge = () => ({ onNavigate: (listener: (section: RunnerSectionId) => void) => { listeners.add(listener); return () => listeners.delete(listener); } });
  const hook = renderHook(t, () => useNavigationShell(getBridge));
  act(() => hook.current().tabs.openProjectTab('a'));
  act(() => hook.current().nav.startCreating());
  assert.equal(listeners.size, 1);
  act(() => { for (const listener of listeners) listener('agents' as RunnerSectionId); });
  assert.equal(hook.current().nav.activeId, 'agents');
  assert.equal(hook.current().tabs.activeTab, null);
  assert.equal(hook.current().nav.isCreating, true, 'agent navigation deliberately leaves the create form alone');
  hook.unmount();
  assert.equal(listeners.size, 0);
});

test('useRunnerNavigation: an agent navigate leaves the Appearance page open over the new section', (t) => {
  const listeners = new Set<(section: RunnerSectionId) => void>();
  const getBridge = () => ({ onNavigate: (listener: (section: RunnerSectionId) => void) => { listeners.add(listener); return () => listeners.delete(listener); } });
  const hook = renderHook(t, () => useNavigationShell(getBridge));
  act(() => hook.current().nav.openAppearance());
  act(() => { for (const listener of listeners) listener('agents' as RunnerSectionId); });
  assert.deepEqual([hook.current().nav.activeId, hook.current().nav.appearanceOpen], ['agents', true]);
});

test('useRunnerNavigation: without a bridge nothing subscribes and the nav stays put', (t) => {
  const hook = renderHook(t, () => useNavigationShell(() => undefined));
  assert.equal(hook.current().nav.activeId, 'projects');
});

test('useSectionNav: a section click resets create, Appearance and the open tab; Appearance drops the tab', (t) => {
  const hook = renderHook(t, () => useNavigationShell(() => undefined));
  act(() => hook.current().tabs.openProjectTab('a'));
  act(() => hook.current().nav.openAppearance());
  assert.equal(hook.current().nav.appearanceOpen, true);
  assert.equal(hook.current().tabs.activeTab, null);
  act(() => hook.current().nav.closeAppearance());
  assert.equal(hook.current().nav.appearanceOpen, false);
  act(() => hook.current().tabs.setActiveTab('a'));
  act(() => hook.current().nav.startCreating());
  act(() => hook.current().nav.openAppearance());
  act(() => hook.current().nav.selectSection('agents' as RunnerSectionId));
  const { nav, tabs } = hook.current();
  assert.deepEqual({ activeId: nav.activeId, isCreating: nav.isCreating, appearanceOpen: nav.appearanceOpen, activeTab: tabs.activeTab },
    { activeId: 'agents', isCreating: false, appearanceOpen: false, activeTab: null });
  act(() => hook.current().nav.startCreating());
  act(() => hook.current().nav.stopCreating());
  assert.equal(hook.current().nav.isCreating, false);
  assert.deepEqual(hook.current().tabs.openTabs, ['a'], 'moving section never closes tabs');
});

test('useSectionNav: Import is a tab: it comes forward from a site, hides behind All, and only Cancel, close or a section move closes it', (t) => {
  const hook = renderHook(t, () => useNavigationShell(() => undefined));
  const state = () => ({ front: hook.current().nav.isImporting, open: hook.current().nav.importTabOpen, tab: hook.current().tabs.activeTab });
  act(() => hook.current().tabs.openProjectTab('a'));
  act(() => hook.current().nav.startImporting());
  assert.deepEqual(state(), { front: true, open: true, tab: null }, 'opening it leaves the site tab for the page');
  act(() => hook.current().nav.hideImporting());
  assert.deepEqual(state(), { front: false, open: true, tab: null }, 'All shows the grid; the tab stays');
  act(() => hook.current().nav.startCreating());
  act(() => hook.current().nav.startImporting());
  assert.equal(hook.current().nav.isCreating, false, 'one page at a time');
  act(() => hook.current().nav.stopImporting());
  assert.deepEqual(state(), { front: false, open: false, tab: null });
  act(() => hook.current().nav.startImporting());
  act(() => hook.current().nav.selectSection('agents' as RunnerSectionId));
  assert.deepEqual(state(), { front: false, open: false, tab: null });
});

test('useSectionNav: Import comes to the front from Appearance or another section (the web admin hand-off lands there)', (t) => {
  const hook = renderHook(t, () => useNavigationShell(() => undefined));
  const importShown = () => {
    const { nav, tabs } = hook.current();
    return deriveSitesHomeView({ activeId: nav.activeId, appearanceOpen: nav.appearanceOpen, activeTab: tabs.activeTab,
      openTabs: tabs.openTabs, projects: [], isCreating: nav.isCreating, isImporting: nav.isImporting }).showImportPage;
  };
  act(() => hook.current().nav.openAppearance());
  act(() => hook.current().nav.startImporting());
  assert.equal(importShown(), true, 'over Appearance');
  act(() => hook.current().nav.selectSection('agents' as RunnerSectionId));
  act(() => hook.current().nav.startImporting());
  assert.equal(importShown(), true, 'from a non-Projects section');
  assert.equal(hook.current().nav.activeId, 'projects');
});

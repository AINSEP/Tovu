/**
 * @file `useAddSite` rendered from its real module under jsdom, with the bridge injected through its
 * `getBridge` port: what the operator sees after the folder picker closes without an error —
 * nothing at all when they cancelled (D-03), and the site's own name plus its opened tab when the
 * folder is a site already in the list (D-09).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act, useState } from 'react';
import type { SiteRecord } from '../contracts/project.js';
import { renderHookWithView as renderHook, site, type TestContext } from './app-hooks.test-support.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { useAddSite } from './use-add-site.hooks.js';

/** `useAddSite` over a real project list held in state, so a merged row is observable. */
function useAddWithProjects(initial: readonly SiteRecord[], options: NonNullable<Parameters<typeof useAddSite>[1]>) {
  const [projects, setProjects] = useState<readonly SiteRecord[]>(initial);
  return { projects, ...useAddSite({ setProjects }, options) };
}

/** Render the hook with `addSite` as the bridge, recording every tab it asks to open. */
function addHarness(t: TestContext, { initial, addSite }: { initial: readonly SiteRecord[]; addSite: RunnerInventoryBridge['addSite'] }) {
  const opened: string[] = [];
  const getBridge = () => ({ addSite });
  const hook = renderHook(t, () => useAddWithProjects(initial, { getBridge, onAlreadyTracked: (id) => { opened.push(id); } }));
  return { hook, opened };
}

test('useAddSite: a cancelled folder picker adds nothing, opens nothing and says nothing', async (t) => {
  const { hook, opened } = addHarness(t, { initial: [site('/site')], addSite: async () => null });
  await act(() => hook.current().addSite());
  const { addError, addNotice, adding, projects } = hook.current();
  assert.deepEqual({ addError, addNotice, adding, ids: projects.map(({ id }) => id), opened }, { addError: null, addNotice: null, adding: false, ids: ['/site'], opened: [] });
});

test('useAddSite: re-adding a site already in the list names it, opens its tab, and keeps one row', async (t) => {
  const tracked = site('/site', { displayName: 'My website' });
  const { hook, opened } = addHarness(t, { initial: [tracked], addSite: async () => ({ ...tracked, alreadyTracked: true }) });
  await act(() => hook.current().addSite());
  assert.equal(hook.current().addError, 'My website is already in your list.');
  assert.deepEqual(hook.current().addNotice, { siteId: '/site', message: 'My website is already in your list.' });
  assert.deepEqual(opened, ['/site']);
  assert.deepEqual(hook.current().projects.map(({ id }) => id), ['/site']);
});

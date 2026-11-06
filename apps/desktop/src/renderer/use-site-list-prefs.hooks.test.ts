/**
 * @file The Websites grid's stored sort, pins and hidden sites: the read and write helpers directly,
 * and `useSiteListPrefs` rendered from its real module with storage injected through its port.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';

import { DEFAULT_SITE_LIST_PREFS, type SiteListPrefs } from '@jini-ai/ui/site-card';
import { renderHook } from './dom-hook-harness.js';
import {
  readSiteListPrefs,
  SITE_LIST_STORAGE_KEY,
  useSiteListPrefs,
  writeSiteListPrefs,
  type SiteListStorage,
} from './use-site-list-prefs.hooks.js';

const CHOSEN: SiteListPrefs = { sort: 'name', pinned: ['/sites/a'], hidden: ['/sites/b'] };

function memoryStorage(seed: string | null = null) {
  const writes: string[] = [];
  let value = seed;
  const storage: SiteListStorage = {
    getItem: (key) => (key === SITE_LIST_STORAGE_KEY ? value : null),
    setItem: (key, next) => { assert.equal(key, SITE_LIST_STORAGE_KEY); value = next; writes.push(next); },
  };
  return { storage, writes };
}

const deniedStorage: SiteListStorage = {
  getItem: () => { throw new Error('storage denied'); },
  setItem: () => { throw new Error('storage denied'); },
};

test('nothing stored reads as the defaults', () => {
  assert.equal(readSiteListPrefs({ storage: memoryStorage().storage }), DEFAULT_SITE_LIST_PREFS);
});

test('stored choices read back as saved', () => {
  assert.deepEqual(readSiteListPrefs({ storage: memoryStorage(JSON.stringify(CHOSEN)).storage }), CHOSEN);
});

test('damaged JSON and denied storage read as the defaults, so they can never blank the grid', () => {
  assert.equal(readSiteListPrefs({ storage: memoryStorage('{not json').storage }), DEFAULT_SITE_LIST_PREFS);
  assert.equal(readSiteListPrefs({ storage: deniedStorage }), DEFAULT_SITE_LIST_PREFS);
});

test('valid JSON with bad fields keeps only what is valid', () => {
  const stored = JSON.stringify({ sort: 'sideways', pinned: ['/sites/a', 7], hidden: 'all' });
  assert.deepEqual(readSiteListPrefs({ storage: memoryStorage(stored).storage }), { sort: 'recent', pinned: ['/sites/a'], hidden: [] });
});

test('a write saves JSON under the one key, and denied storage does not throw', () => {
  const memory = memoryStorage();
  writeSiteListPrefs({ storage: memory.storage, prefs: CHOSEN });
  assert.deepEqual(memory.writes, [JSON.stringify(CHOSEN)]);
  assert.doesNotThrow(() => writeSiteListPrefs({ storage: deniedStorage, prefs: CHOSEN }));
});

test('the hook starts from storage, reads it once, and a change updates the screen and storage', (t) => {
  const memory = memoryStorage(JSON.stringify(CHOSEN));
  let reads = 0;
  const counted: SiteListStorage = { ...memory.storage, getItem: (key) => { reads += 1; return memory.storage.getItem(key); } };
  const hook = renderHook(t, () => useSiteListPrefs(counted));
  assert.deepEqual(hook.current().prefs, CHOSEN);
  hook.rerender();
  assert.equal(reads, 1, 'storage is read when the grid mounts, not on every render');

  const next: SiteListPrefs = { ...CHOSEN, pinned: [] };
  act(() => hook.current().onPrefsChange(next));
  assert.equal(hook.current().prefs, next);
  assert.deepEqual(memory.writes, [JSON.stringify(next)]);
});

test('with storage denied a change still applies for this session', (t) => {
  const hook = renderHook(t, () => useSiteListPrefs(deniedStorage));
  assert.equal(hook.current().prefs, DEFAULT_SITE_LIST_PREFS);
  act(() => hook.current().onPrefsChange(CHOSEN));
  assert.equal(hook.current().prefs, CHOSEN);
});

test('with no storage given the hook uses the window store, and that store really persists', (t) => {
  // Reached through the default parameter, so the `window.localStorage` adapter itself is exercised.
  const first = renderHook(t, () => useSiteListPrefs());
  act(() => first.current().onPrefsChange(CHOSEN));
  assert.equal(window.localStorage.getItem(SITE_LIST_STORAGE_KEY), JSON.stringify(CHOSEN));
  first.unmount();
  const second = renderHook(t, () => useSiteListPrefs());
  assert.deepEqual(second.current().prefs, CHOSEN);
  window.localStorage.removeItem(SITE_LIST_STORAGE_KEY);
});

/**
 * @file `useZoom` rendered from its real module under jsdom (see `dom-hook-harness.ts`), with the
 * bridge and storage injected through the hook's ports. The routing and persistence helpers have
 * direct tests in `use-zoom.hooks.test.ts`; this file asserts what the hook owns: the registered
 * guests map, re-applying a remembered level, and routing the menu command to the live target.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ZoomDirection } from '../contracts/zoom.js';
import { installDom, renderHook } from './dom-hook-harness.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { useZoom, type ZoomableGuest } from './use-zoom.hooks.js';

/** An in-memory `Storage`. */
function memoryStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  return {
    items,
    storage: { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) } as unknown as Storage,
  };
}

/** A bridge whose zoom command subscription the test fires by hand; the top window starts at 0. */
function zoomBridge() {
  let command: ((direction: ZoomDirection) => void) | null = null;
  let top = 0;
  const log: string[] = [];
  const bridge = {
    onZoomCommand: (listener: (direction: ZoomDirection) => void) => { command = listener; log.push('subscribe'); return () => log.push('unsubscribe'); },
    getZoomLevel: () => top,
    setZoomLevel: (level: number) => { top = level; },
  } as unknown as RunnerInventoryBridge;
  return { bridge, log, fire: (direction: ZoomDirection) => command!(direction), top: () => top };
}

function guest(level = 0): ZoomableGuest & { level: number } {
  return {
    level,
    getZoomLevel() { return this.level; },
    setZoomLevel(next: number) { this.level = next; },
    addEventListener() {},
    removeEventListener() {},
  };
}

test('a registered guest takes its remembered level, and the menu zooms the visible guest and persists it', (t) => {
  const fake = zoomBridge();
  const store = memoryStorage({ 'tovu:zoom:/a': '1.5' });
  let active: string | null = '/a';
  const hook = renderHook(t, () => useZoom(active, { bridge: fake.bridge, storage: store.storage }));
  const a = guest();
  hook.current().registerGuest('/a', a);
  assert.equal(a.level, 1.5);
  fake.fire('in');
  assert.equal(a.level, 2);
  assert.equal(store.items.get('tovu:zoom:/a'), '2');
  assert.equal(fake.top(), 0, 'the shell window is untouched while a guest is on screen');

  active = null;
  hook.rerender();
  assert.deepEqual(fake.log, ['subscribe', 'unsubscribe', 'subscribe'], 'a new active target re-subscribes');
  fake.fire('out');
  assert.equal(fake.top(), -0.5, 'the Projects screen zooms the shell window');
  assert.equal(a.level, 2);
});

test('a deregistered guest is no longer a target; the command falls back to the shell window', (t) => {
  const fake = zoomBridge();
  const store = memoryStorage();
  const hook = renderHook(t, () => useZoom('/a', { bridge: fake.bridge, storage: store.storage }));
  const a = guest(1);
  hook.current().registerGuest('/a', a);
  assert.equal(a.level, 0, 'no remembered level: a fresh guest starts at actual size');
  hook.current().registerGuest('/a', null);
  fake.fire('in');
  assert.equal(a.level, 0);
  assert.equal(fake.top(), 0.5);
});

test('with no bridge the hook subscribes to nothing, and defaults to the shell\'s own localStorage', (t) => {
  const window = installDom();
  window.localStorage.setItem('tovu:zoom:/b', '-1');
  const hook = renderHook(t, () => useZoom('/b', { bridge: undefined }));
  const b = guest();
  hook.current().registerGuest('/b', b);
  assert.equal(b.level, -1);
});

/**
 * @file Behavioural tests for `use-zoom.hooks.ts`: which target a command routes to, the step math,
 * and the `localStorage` round trip. `useZoom` itself calls React hooks, and this package has no
 * React renderer (see `use-find-in-page.hooks.test.ts`'s own header for the identical constraint) —
 * every decision it makes is a plain exported function, tested directly here with fakes. The hook's
 * own command subscription and guest ref callback run through the injected hook harness in
 * `source-test-harness.ts`, with recording ports for guest restoration and inert targets.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { hookHarness, sourceFunction } from './source-test-harness.js';

import {
  applyStoredZoom,
  applyZoomCommand,
  nextZoomLevel,
  readStoredZoom,
  resolveZoomTarget,
  writeStoredZoom,
  type ZoomableGuest,
  type ZoomBridge,
  type ZoomStorage,
} from './use-zoom.hooks.js';

/** A `<webview>` stand-in that records every imperative call and starts at a given zoom level.
 *  `attached` is the real tag's own gate: Electron throws from every method until the guest is in
 *  the DOM and has emitted `dom-ready`, and `emitDomReady` is how a test crosses that line. */
function fakeGuest(startLevel = 0, attached = true): ZoomableGuest & { calls: unknown[][]; emitDomReady: () => void; listenerCount: () => number } {
  const calls: unknown[][] = [];
  const listeners = new Set<(event: Event) => void>();
  let level = startLevel;
  const gate = () => {
    if (!attached) throw new Error('The WebView must be attached to the DOM and the dom-ready event emitted before this method can be called');
  };
  return {
    calls,
    listenerCount: () => listeners.size,
    emitDomReady: () => {
      attached = true;
      for (const listener of [...listeners]) listener(new Event('dom-ready'));
    },
    getZoomLevel: () => {
      gate();
      return level;
    },
    setZoomLevel: (next: number) => {
      gate();
      calls.push(['setZoomLevel', next]);
      level = next;
    },
    addEventListener: (event: 'dom-ready', listener: (event: Event) => void) => {
      assert.equal(event, 'dom-ready', 'zoom only ever waits on dom-ready');
      listeners.add(listener);
    },
    removeEventListener: (_event: 'dom-ready', listener: (event: Event) => void) => void listeners.delete(listener),
  };
}

/** A `RunnerInventoryBridge` stand-in narrowed to the zoom slice. */
function fakeBridge(startLevel = 0): ZoomBridge & { calls: unknown[][]; readCount: () => number } {
  const calls: unknown[][] = [];
  let reads = 0;
  let level = startLevel;
  return {
    calls,
    readCount: () => reads,
    onZoomCommand: () => () => {},
    getZoomLevel: () => { reads += 1; return level; },
    setZoomLevel: (next: number) => {
      calls.push(['setZoomLevel', next]);
      level = next;
    },
  };
}

/** An in-memory `Storage` stand-in — real `localStorage` semantics (string values, `null` for a
 *  missing key) without touching jsdom/browser globals. */
function fakeStorage(): ZoomStorage & { accesses: unknown[][] } {
  const data = new Map<string, string>();
  const accesses: unknown[][] = [];
  return {
    accesses,
    getItem: (key) => { accesses.push(['get', key]); return data.get(key) ?? null; },
    setItem: (key, value) => { accesses.push(['set', key, value]); data.set(key, value); },
  };
}

test('resolveZoomTarget: the active guest when it is mounted', () => {
  const guest = fakeGuest();
  const guests = new Map([['proj-1', guest]]);
  const target = resolveZoomTarget({ activeGuestId: 'proj-1', guests, bridge: fakeBridge() });
  assert.deepEqual(target, { kind: 'guest', element: guest, projectId: 'proj-1' });
});

test('resolveZoomTarget: the top page when no guest is active, given a bridge', () => {
  const bridge = fakeBridge();
  assert.deepEqual(resolveZoomTarget({ activeGuestId: null, guests: new Map(), bridge }), { kind: 'top' });
});

test('resolveZoomTarget: the top page when the named guest never actually mounted', () => {
  const bridge = fakeBridge();
  assert.deepEqual(resolveZoomTarget({ activeGuestId: 'ghost', guests: new Map(), bridge }), { kind: 'top' });
});

test("resolveZoomTarget: 'none' outside a real desktop window", () => {
  assert.deepEqual(resolveZoomTarget({ activeGuestId: null, guests: new Map(), bridge: undefined }), { kind: 'none' });
});

test('nextZoomLevel: in/out step by 0.5, reset returns to 0 outright', () => {
  assert.equal(nextZoomLevel(0, 'in'), 0.5);
  assert.equal(nextZoomLevel(1.5, 'out'), 1);
  assert.equal(nextZoomLevel(-3, 'reset'), 0);
  assert.equal(nextZoomLevel(2, 'reset'), 0);
});

test('readStoredZoom: 0 for an unset, corrupt, or throwing store', () => {
  assert.equal(readStoredZoom(fakeStorage(), 'proj-1'), 0, 'unset');
  const corrupt = fakeStorage();
  corrupt.getItem = () => 'not-a-number';
  assert.equal(readStoredZoom(corrupt, 'proj-1'), 0, 'corrupt');
  const throwing: ZoomStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {},
  };
  assert.equal(readStoredZoom(throwing, 'proj-1'), 0, 'throwing');
});

test('writeStoredZoom then readStoredZoom round-trips, keyed per project', () => {
  const storage = fakeStorage();
  writeStoredZoom(storage, 'proj-1', 1.5);
  writeStoredZoom(storage, 'proj-2', -1);
  assert.equal(readStoredZoom(storage, 'proj-1'), 1.5);
  assert.equal(readStoredZoom(storage, 'proj-2'), -1);
  assert.equal(readStoredZoom(storage, 'proj-3'), 0, 'a third project was never written');
});

test('writeStoredZoom swallows a throwing store rather than breaking the caller', () => {
  const throwing: ZoomStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota exceeded');
    },
  };
  assert.doesNotThrow(() => writeStoredZoom(throwing, 'proj-1', 1));
});

test('applyZoomCommand: a guest target zooms the guest and persists the new level', () => {
  const guest = fakeGuest(0);
  const storage = fakeStorage();
  applyZoomCommand({ kind: 'guest', element: guest, projectId: 'proj-1' }, undefined, 'in', storage);
  assert.deepEqual(guest.calls, [['setZoomLevel', 0.5]]);
  assert.equal(readStoredZoom(storage, 'proj-1'), 0.5);
});

test('applyZoomCommand: a top target zooms the bridge and never touches storage', () => {
  const bridge = fakeBridge(1);
  const storage = fakeStorage();
  applyZoomCommand({ kind: 'top' }, bridge, 'out', storage);
  assert.deepEqual(bridge.calls, [['setZoomLevel', 0.5]]);
  assert.deepEqual(storage.accesses, [], 'top-page zoom performs no storage operations under any key');
  assert.equal(readStoredZoom(storage, '__any__'), 0, 'the top target has no project id to key a persisted entry by');
});

test('applyZoomCommand: a top target with no bridge, or a none target, is an inert no-op', () => {
  const storage = fakeStorage();
  const bridge = fakeBridge();
  assert.doesNotThrow(() => applyZoomCommand({ kind: 'top' }, undefined, 'in', storage));
  assert.doesNotThrow(() => applyZoomCommand({ kind: 'none' }, bridge, 'in', storage));
  assert.deepEqual(bridge.calls, []);
  assert.equal(bridge.readCount(), 0);
  assert.deepEqual(storage.accesses, []);
});

test('useZoom wires remembered zoom on registration and commands to the current target, with teardown', () => {
  const harness = hookHarness();
  const storage = fakeStorage();
  writeStoredZoom(storage, 'proj-1', 1.5);
  const listeners = new Set<(direction: 'in' | 'out' | 'reset') => void>();
  const bridge = { ...fakeBridge(), onZoomCommand(listener: (direction: 'in' | 'out' | 'reset') => void) {
    listeners.add(listener); return () => { listeners.delete(listener); };
  } };
  const guests = { current: new Map<string, ZoomableGuest>() };
  const hook = sourceFunction(readFileSync(new URL('./use-zoom.hooks.ts', import.meta.url), 'utf8'), 'useZoom', {
    ...harness.bindings, useRef: () => guests, runnerInventoryBridge: () => bridge,
    window: { localStorage: storage }, applyStoredZoom, resolveZoomTarget, applyZoomCommand,
  });
  let activeId: string | null = 'proj-1';
  const render = () => harness.render(() => hook(activeId));
  const emit = (direction: 'in' | 'out' | 'reset') => { for (const listener of listeners) listener(direction); };
  try {
    const guest = fakeGuest();
    render().registerGuest('proj-1', guest);
    assert.deepEqual(guest.calls, [['setZoomLevel', 1.5]]);
    assert.equal(listeners.size, 1);
    emit('in');
    assert.equal(guest.getZoomLevel(), 2);
    assert.equal(readStoredZoom(storage, 'proj-1'), 2);
    activeId = null;
    render();
    assert.equal(listeners.size, 1, 'tab switch must replace, rather than accumulate listeners');
    storage.accesses.length = 0;
    emit('in');
    assert.deepEqual(bridge.calls, [['setZoomLevel', 0.5]]);
    assert.equal(guest.getZoomLevel(), 2);
    assert.deepEqual(storage.accesses, []);
    activeId = 'proj-1';
    render().registerGuest('proj-1', null);
    assert.equal(guests.current.size, 0);
    emit('out');
    assert.deepEqual(bridge.calls, [['setZoomLevel', 0.5], ['setZoomLevel', 0]]);
    assert.equal(guest.getZoomLevel(), 2, 'deregistered guest must receive no commands');
  } finally { harness.cleanup(); }
  assert.equal(listeners.size, 0);
});

test('applyStoredZoom: an attached guest takes the stored level at once, with no listener left behind', () => {
  const storage = fakeStorage();
  writeStoredZoom(storage, 'proj-1', 1.5);
  const guest = fakeGuest(0);
  applyStoredZoom(guest, 'proj-1', storage);
  assert.deepEqual(guest.calls, [['setZoomLevel', 1.5]]);
  assert.equal(guest.listenerCount(), 0, 'nothing to wait for — it already applied');
});

test('applyStoredZoom: a guest that is not attached yet does not throw', () => {
  const storage = fakeStorage();
  writeStoredZoom(storage, 'proj-1', 1.5);
  const guest = fakeGuest(0, false);
  // The regression this guards: this call runs inside a React ref callback, so a throw here
  // unmounts the whole sites-home tree and the window goes blank white.
  assert.doesNotThrow(() => applyStoredZoom(guest, 'proj-1', storage));
  assert.deepEqual(guest.calls, [], 'nothing could be applied to a guest that is not attached');
});

test('applyStoredZoom: the stored level still lands once the guest reaches dom-ready', () => {
  const storage = fakeStorage();
  writeStoredZoom(storage, 'proj-1', -1);
  const guest = fakeGuest(0, false);
  applyStoredZoom(guest, 'proj-1', storage);
  assert.equal(guest.listenerCount(), 1, 'a not-yet-attached guest is waited on');
  guest.emitDomReady();
  assert.deepEqual(guest.calls, [['setZoomLevel', -1]], 'the remembered zoom is not lost, only deferred');
  assert.equal(guest.listenerCount(), 0, 'the wait is a one-shot, not a listener re-fired on every navigation');
});

test('applyZoomCommand: a guest that is not attached yet is an inert no-op, not a throw', () => {
  const storage = fakeStorage();
  const guest = fakeGuest(0, false);
  assert.doesNotThrow(() => applyZoomCommand({ kind: 'guest', element: guest, projectId: 'proj-1' }, undefined, 'in', storage));
  assert.deepEqual(guest.calls, []);
  assert.equal(readStoredZoom(storage, 'proj-1'), 0, 'a level the guest never took must not be remembered');
});

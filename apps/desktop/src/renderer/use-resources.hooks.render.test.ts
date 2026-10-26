import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { renderHook, settle } from './dom-hook-harness.js';
import { useResources, type ResourcesPorts } from './use-resources.hooks.js';
import type { ResourcesRequest, ResourcesSnapshot } from '../contracts/resources.js';

const metrics = { rssBytes: 1_500_000_000, cpuPercent: null, memoryWarning: false, cpuWarning: false };
const snapshot = (pollIntervalMs = 60_000): ResourcesSnapshot => ({
  status: 'available', sampledAt: 1, pollIntervalMs, totalMemoryBytes: 8_000_000_000, approximate: true,
  total: metrics, app: { ...metrics, siteId: null, processes: [] }, sites: [],
});

function fixture() {
  let hidden = false;
  const listeners = new Set<() => void>();
  const timers = new Map<number, { run: () => void; delay: number }>();
  const requests: ResourcesRequest[] = [];
  let nextTimer = 0;
  let read = async (request: ResourcesRequest) => snapshot(request.panelOpen ? 10_000 : 60_000);
  const ports: ResourcesPorts = {
    getBridge: () => ({ getResources: (request) => { requests.push(request); return read(request); } }),
    document: {
      get hidden() { return hidden; },
      addEventListener: (_event, listener) => { listeners.add(listener); },
      removeEventListener: (_event, listener) => { listeners.delete(listener); },
    },
    setTimer: (run, delay) => { const id = ++nextTimer; timers.set(id, { run, delay }); return id; },
    clearTimer: (id) => { timers.delete(id); },
  };
  return { ports, requests, timers, listeners,
    setRead: (next: typeof read) => { read = next; },
    visibility: (value: boolean) => act(() => { hidden = value; for (const listener of listeners) listener(); }),
    tick: () => act(() => { const [id, timer] = timers.entries().next().value!; timers.delete(id); timer.run(); }),
  };
}

test('visible badge and panel use main cadence; hidden documents and unmount release polling', async (t) => {
  const f = fixture();
  let panelOpen = false;
  const hook = renderHook(t, () => useResources({ panelOpen }, { ports: f.ports }));
  await settle();
  assert.deepEqual(f.requests, [{ panelOpen: false }]);
  assert.equal([...f.timers.values()][0]!.delay, 60_000);
  panelOpen = true; hook.rerender(); await settle();
  assert.deepEqual(f.requests, [{ panelOpen: false }, { panelOpen: true }]);
  assert.equal([...f.timers.values()][0]!.delay, 10_000);
  f.visibility(true);
  assert.equal(f.timers.size, 0);
  f.visibility(false); await settle();
  assert.equal(f.requests.length, 3);
  f.tick(); await settle();
  assert.equal(f.requests.length, 4);
  hook.unmount();
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners.size, 0);
});

test('a panel change waits for an outstanding badge read and discards its result', async (t) => {
  const f = fixture();
  let finish!: (value: ResourcesSnapshot) => void;
  f.setRead(() => new Promise((resolve) => { finish = resolve; }));
  let panelOpen = false;
  const hook = renderHook(t, () => useResources({ panelOpen }, { ports: f.ports }));
  await settle();
  panelOpen = true; hook.rerender(); await settle();
  assert.equal(f.requests.length, 1);
  f.setRead(async () => snapshot(5_000));
  await act(async () => { finish(snapshot()); }); await settle();
  assert.deepEqual(f.requests, [{ panelOpen: false }, { panelOpen: true }]);
  assert.equal(hook.current()!.pollIntervalMs, 5_000);
  assert.equal([...f.timers.values()][0]!.delay, 5_000);
});

test('starts hidden without a read; failures withdraw stale data and retry at badge cadence', async (t) => {
  const f = fixture(); f.visibility(true);
  const hook = renderHook(t, () => useResources({ panelOpen: true }, { ports: f.ports }));
  await settle(); assert.equal(f.requests.length, 0);
  f.visibility(false); await settle(); assert.equal(hook.current()!.status, 'available');
  f.setRead(async () => { throw new Error('fixture failure'); });
  f.tick(); await settle();
  assert.equal(hook.current(), null);
  assert.equal([...f.timers.values()][0]!.delay, 60_000);
});

test('a missing resource preload remains unavailable and creates no timer', async (t) => {
  const f = fixture(); f.ports.getBridge = () => undefined;
  const hook = renderHook(t, () => useResources({ panelOpen: false }, { ports: f.ports }));
  await settle();
  assert.equal(hook.current(), null);
  assert.equal(f.timers.size, 0);
});

test('hide/show during a read discards that reading and retries without overlapping', async (t) => {
  const f = fixture();
  let finish!: (value: ResourcesSnapshot) => void;
  f.setRead(() => new Promise((resolve) => { finish = resolve; }));
  const hook = renderHook(t, () => useResources({ panelOpen: true }, { ports: f.ports }));
  await settle();
  f.visibility(true); f.visibility(false); await settle();
  assert.equal(f.requests.length, 1);
  await act(async () => { finish(snapshot()); }); await settle();
  assert.equal(hook.current(), null, 'the pre-hide reading is discarded');
  assert.equal([...f.timers.values()][0]!.delay, 0);
  f.setRead(async () => snapshot(5_000));
  f.tick(); await settle();
  assert.equal(f.requests.length, 2);
  assert.equal(hook.current()!.pollIntervalMs, 5_000);
});

test('late replies after unmount cannot rearm polling', async (t) => {
  const f = fixture();
  let finish!: (value: ResourcesSnapshot) => void;
  f.setRead(() => new Promise((resolve) => { finish = resolve; }));
  const hook = renderHook(t, () => useResources({ panelOpen: true }, { ports: f.ports }));
  await settle(); hook.unmount();
  await act(async () => { finish(snapshot()); }); await settle();
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners.size, 0);
});

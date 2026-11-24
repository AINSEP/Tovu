/** Host wiring: the real main-process sampler through this desktop's adapter. The hook's own
 * polling cases live with `useResourceReadings` in `@jini-ai/ui/resource-monitor`. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { renderHook, settle } from './dom-hook-harness.js';
import { useResources, type ResourcesPorts } from './use-resources.hooks.js';
import type { ResourcesRequest, ResourcesSnapshot } from '../contracts/resources.js';
import { createDesktopResources } from '../desktop-resources.ts';

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
    setTimer: ({ run, delay }) => { const id = ++nextTimer; timers.set(id, { run, delay }); return id; },
    clearTimer: ({ id }) => { timers.delete(id); },
  };
  return { ports, requests, timers, listeners,
    setRead: (next: typeof read) => { read = next; },
    visibility: (value: boolean) => act(() => { hidden = value; for (const listener of listeners) listener(); }),
    tick: () => act(() => { const [id, timer] = timers.entries().next().value!; timers.delete(id); timer.run(); }),
  };
}

test('launch badge recovers from two initial sampler failures within ten seconds', async (t) => {
  const f = fixture();
  let at = 0, attempts = 0;
  const monitor = createDesktopResources({ desktopPid: 1, platform: 'darwin', now: () => at,
    totalMem: () => 8_000_000_000, openSites: () => [],
    samplePrivateMemory: async () => ({ metric: 'unavailable', readings: [] }),
    listUsage: async () => {
      if (++attempts <= 2) throw new Error('transient launch failure');
      return [{ pid: 1, ppid: 0, rssBytes: 123_000_000, cpuSeconds: 0, name: 'Tovu' }];
    } });
  f.setRead(request => monitor.get(request));
  const hook = renderHook({ t, useHook: () => useResources({ panelOpen: false }, { ports: f.ports }) });
  await settle();
  assert.equal(attempts, 1, 'launch requests its first reading immediately');
  for (let retry = 0; retry < 2; retry++) {
    const delay = [...f.timers.values()][0]!.delay;
    assert.ok(delay <= 5_000, `an unavailable badge must retry promptly, got ${delay}ms`);
    at += delay;
    f.tick(); await settle();
  }
  assert.equal(attempts, 3, 'the main cache must also permit each recovery attempt');
  assert.equal(hook.current()!.total.rssBytes, 123_000_000);
  assert.ok(at <= 10_000);
  assert.equal([...f.timers.values()][0]!.delay, 60_000, 'successful readings resume the cheap badge cadence');
});

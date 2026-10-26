import assert from 'node:assert/strict';
import test from 'node:test';
import { createNoopTracker, type TrackerErrorContext } from '@jini-ai/diagnostics/observability';
import { createDesktopResources } from './desktop-resources.ts';
import { projectMemoryProcesses, startProductMemoryTelemetry } from './product-memory-telemetry.ts';
import type { ProductConsent } from '../../website/src/server/runtime/composition/product-telemetry.ts';

const MB = 1_000_000, MINUTE = 60_000, DAY = 24 * 60 * MINUTE;
function fixture() {
  let at = 0, reads = 0, rssMb = 1000, cancelled = 0, cadence = 0;
  let consent: ProductConsent = { crashes: true, usage: true, installationId: 'FAKE_INSTALL' };
  const metrics: unknown[] = [], errors: { error: Error; context?: TrackerErrorContext }[] = [];
  const monitor = createDesktopResources({ desktopPid: 1, platform: 'win32', now: () => at,
    totalMem: () => 8_000_000_000, openSites: () => [{ id: 'C:\\private\\site-name', pid: 10 }],
    listUsage: async () => { reads++; return [
      { pid: 1, ppid: 0, name: 'Tovu', rssBytes: 100 * MB, cpuSeconds: 0 },
      { pid: 2, ppid: 1, name: 'PRIVATE_RENDERER_NAME', rssBytes: rssMb * MB, cpuSeconds: 0 },
      { pid: 3, ppid: 1, name: 'Electron Helper', rssBytes: 200 * MB, cpuSeconds: 0 },
      { pid: 10, ppid: 1, name: 'Tovu', rssBytes: 300 * MB, cpuSeconds: 0 },
      { pid: 11, ppid: 10, name: 'Tovu', rssBytes: 400 * MB, cpuSeconds: 0 },
    ]; },
  });
  const memory = startProductMemoryTelemetry({ monitor, desktopPid: 1, readConsent: () => consent,
    rendererPids: () => new Set([2, 3]), heapUsedBytes: () => 25.6 * MB, uptime: () => at / 1000,
    tracker: { ...createNoopTracker({}), capture() { assert.fail('memory uses metrics'); },
      metric: (input, options) => { metrics.push({ input, options }); }, error: ({ error }, { context } = {}) => { errors.push({ error, context }); } },
  }, { now: () => at, schedule: (_tick, ms) => { cadence = ms; return () => { cancelled++; }; } });
  return { memory, monitor, metrics, errors, at: (next: number) => { at = next; }, rss: (value: number) => { rssMb = value; },
    consent: (next: ProductConsent) => { consent = next; }, reads: () => reads, cancelled: () => cancelled, cadence: () => cadence };
}

test('one default-five-minute sample aggregates all kinds and reuses the Resources UI cache; no paths, names or pids', async () => {
  const f = fixture();
  assert.equal(f.cadence(), 5 * MINUTE);
  const snapshot = await f.monitor.get({ panelOpen: true });
  const local = projectMemoryProcesses({ snapshot, desktopPid: 1, rendererPids: new Set([2, 3]), heapUsedBytes: 25.6 * MB });
  assert.deepEqual(local.map(row => [row.id, row.kind]), [[1, 'main'], [2, 'renderer'], [3, 'renderer'], [10, 'server'], [11, 'daemon']]);
  await f.memory.tick();
  assert.equal(f.reads(), 1, 'the UI and telemetry must share the same OS sample');
  const gauge = (name: string, value: number, unit: string, process: string) => ({ input: { name, value }, options: { kind: 'gauge', unit, attributes: { process } } });
  assert.deepEqual(f.metrics, [
    gauge('process.memory.rss', 100 * MB, 'By', 'main'), gauge('process.count', 1, '{process}', 'main'),
    gauge('process.memory.heap_used', 26 * MB, 'By', 'main'),
    gauge('process.memory.rss', 1200 * MB, 'By', 'renderer'), gauge('process.count', 2, '{process}', 'renderer'),
    gauge('process.memory.rss', 300 * MB, 'By', 'server'), gauge('process.count', 1, '{process}', 'server'),
    gauge('process.memory.rss', 400 * MB, 'By', 'daemon'), gauge('process.count', 1, '{process}', 'daemon'),
    gauge('process.uptime', 0, 's', 'main'),
  ]);
  assert.deepEqual(f.errors, []);
  for (const privateText of ['PRIVATE_RENDERER_NAME', 'private', 'site-name', 'pid', 'siteId', 'installationId']) assert.equal(JSON.stringify(f.metrics).includes(privateText), false);
  f.memory.dispose(); assert.equal(f.cancelled(), 1);
});

test('consent off sends nothing and does not request an OS sample; usage and diagnostics are independent', async () => {
  const f = fixture(); f.rss(2400);
  f.consent({ crashes: false, usage: false, installationId: null });
  await f.memory.tick(); assert.equal(f.reads(), 0); assert.deepEqual(f.metrics, []); assert.deepEqual(f.errors, []);
  f.consent({ crashes: false, usage: true, installationId: 'FAKE_INSTALL' });
  await f.memory.tick(); assert.equal(f.metrics.length, 10); assert.deepEqual(f.errors, []);
  f.consent({ crashes: true, usage: false, installationId: 'FAKE_INSTALL' });
  for (const minute of [5, 10, 15]) { f.at(minute * MINUTE); await f.memory.tick(); }
  assert.deepEqual(f.errors, [], 'high readings shorter than the fifteen-minute floor span do not warn');
  f.at(20 * MINUTE); await f.memory.tick();
  assert.equal(f.metrics.length, 10); assert.equal(f.errors.length, 1);
  assert.equal(f.errors[0]!.context!.level, 'warning');
  assert.deepEqual(f.errors[0]!.context!.attributes, { process: 'renderer', code: 'rss-limit' });
  f.memory.dispose();
});

test('fake clock: slope is quiet before 60 minutes, then warns once/process/day even across consent toggles', async () => {
  const f = fixture();
  for (let index = 0; index < 12; index++) {
    f.at(index * 5 * MINUTE); f.rss(1000 + index * 34); await f.memory.tick();
  }
  assert.deepEqual(f.errors, []);
  f.at(60 * MINUTE); f.rss(1408); await f.memory.tick();
  assert.equal(f.errors.length, 1);
  assert.equal(f.errors[0]!.context!.attributes!.code, 'sustained-growth');
  assert.equal(JSON.stringify(f.errors).includes('rss_'), false, 'numeric history belongs in metrics');
  f.at(65 * MINUTE); f.rss(2400); await f.memory.tick(); assert.equal(f.errors.length, 1);
  f.consent({ crashes: false, usage: false, installationId: null }); await f.memory.tick();
  f.consent({ crashes: true, usage: false, installationId: 'FAKE_NEW_INSTALL' });
  f.at(70 * MINUTE); await f.memory.tick(); assert.equal(f.errors.length, 1);
  f.at(60 * MINUTE + DAY - 1); await f.memory.tick(); assert.equal(f.errors.length, 1);
  // Past the daily deadline the high floor must again span fifteen minutes (ticks also clear the monitor's minute cache).
  for (const minute of [5, 10]) { f.at(60 * MINUTE + DAY + minute * MINUTE); await f.memory.tick(); }
  assert.equal(f.errors.length, 1);
  f.at(75 * MINUTE + DAY); await f.memory.tick(); assert.equal(f.errors.length, 2);
  f.memory.dispose();
});

test('an in-flight measurement cannot send after consent withdrawal or disposal; overlapping ticks coalesce', async () => {
  const f = fixture(); const snapshot = await f.monitor.get({ panelOpen: false });
  for (const change of ['withdraw', 'dispose']) {
    let release!: (value: typeof snapshot) => void;
    let consent = { crashes: true, usage: true, installationId: 'FAKE_INSTALL' };
    const metrics: unknown[] = [], errors: unknown[] = [];
    let reads = 0;
    const memory = startProductMemoryTelemetry({ desktopPid: 1, monitor: { get: () => { reads++; return new Promise(done => { release = done; }); } },
      readConsent: () => consent, rendererPids: () => new Set([2]), heapUsedBytes: () => 0, uptime: () => 0,
      tracker: { ...createNoopTracker({}), metric: (input, options) => { metrics.push({ input, options }); }, error: ({ error }) => { errors.push(error); } },
    }, { schedule: () => () => {} });
    const first = memory.tick(), second = memory.tick();
    assert.equal(reads, 1);
    if (change === 'withdraw') consent = { crashes: false, usage: false, installationId: 'FAKE_INSTALL' };
    else memory.dispose();
    release(snapshot); await Promise.all([first, second]);
    assert.deepEqual(metrics, []); assert.deepEqual(errors, []);
    memory.dispose(); await memory.tick(); assert.equal(reads, 1);
  }
  f.memory.dispose();
});

test('withdrawal or disposal during metric admission prevents a late diagnostic warning', async () => {
  const f = fixture(); f.rss(2400);
  const snapshot = await f.monitor.get({ panelOpen: false });
  for (const change of ['none', 'withdraw', 'dispose']) {
    let at = 0;
    let consent = { crashes: true, usage: false, installationId: 'FAKE_INSTALL' };
    const errors: unknown[] = [];
    const memory = startProductMemoryTelemetry({ desktopPid: 1, monitor: { get: async () => snapshot },
      readConsent: () => consent, rendererPids: () => new Set([2, 3]), heapUsedBytes: () => 0, uptime: () => 0,
      tracker: { ...createNoopTracker({}), metric: () => {
        if (change === 'withdraw') consent = { crashes: false, usage: false, installationId: 'FAKE_INSTALL' };
        if (change === 'dispose') memory.dispose();
      }, error: ({ error }) => { errors.push(error); } },
    }, { now: () => at, schedule: () => () => {} });
    // Three crash-only samples build the fifteen-minute high floor, so the fourth sample would warn.
    for (const minute of [0, 5, 10]) { at = minute * MINUTE; await memory.tick(); }
    assert.deepEqual(errors, []);
    consent = { crashes: true, usage: true, installationId: 'FAKE_INSTALL' };
    at = 15 * MINUTE;
    await memory.tick();
    assert.equal(errors.length, change === 'none' ? 1 : 0, change);
    memory.dispose();
  }
  f.memory.dispose();
});

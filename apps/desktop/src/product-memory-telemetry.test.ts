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
  const events: unknown[] = [], errors: { error: Error; context?: TrackerErrorContext }[] = [];
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
    tracker: { ...createNoopTracker({}), capture: event => { events.push(event); }, error: (error, context) => { errors.push({ error, context }); } },
  }, { now: () => at, schedule: (_tick, ms) => { cadence = ms; return () => { cancelled++; }; } });
  return { memory, monitor, events, errors, at: (next: number) => { at = next; }, rss: (value: number) => { rssMb = value; },
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
  assert.deepEqual(f.events, [{ name: 'app_memory_sample', properties: { uptimeSeconds: 0, processCount: 5,
    mainRssMb: 100, mainCount: 1, mainHeapUsedMb: 26, rendererRssMb: 1200, rendererCount: 2,
    serverRssMb: 300, serverCount: 1, daemonRssMb: 400, daemonCount: 1 } }]);
  assert.deepEqual(f.errors, []);
  for (const privateText of ['PRIVATE_RENDERER_NAME', 'private', 'site-name', 'pid', 'siteId', 'installationId']) assert.equal(JSON.stringify(f.events).includes(privateText), false);
  f.memory.dispose(); assert.equal(f.cancelled(), 1);
});

test('consent off sends nothing and does not request an OS sample; usage and diagnostics are independent', async () => {
  const f = fixture(); f.rss(2400);
  f.consent({ crashes: false, usage: false, installationId: null });
  await f.memory.tick(); assert.equal(f.reads(), 0); assert.deepEqual(f.events, []); assert.deepEqual(f.errors, []);
  f.consent({ crashes: false, usage: true, installationId: 'FAKE_INSTALL' });
  await f.memory.tick(); assert.equal(f.events.length, 1); assert.deepEqual(f.errors, []);
  f.consent({ crashes: true, usage: false, installationId: 'FAKE_INSTALL' });
  f.at(5 * MINUTE); await f.memory.tick();
  assert.equal(f.events.length, 1); assert.equal(f.errors.length, 1);
  assert.equal(f.errors[0]!.context!.level, 'warning');
  assert.deepEqual(f.errors[0]!.context!.attributes, { process: 'renderer', code: 'rss-limit', rss_0_mb: 2400, elapsed_0_min: 0 });
  f.memory.dispose();
});

test('fake clock: slope is quiet before 60 minutes, then warns once/process/day even across consent toggles', async () => {
  const f = fixture();
  for (let index = 0; index < 12; index++) {
    f.at(index * 5 * MINUTE); f.rss(1000 + index * 25); await f.memory.tick();
  }
  assert.deepEqual(f.errors, []);
  f.at(60 * MINUTE); f.rss(1300); await f.memory.tick();
  assert.equal(f.errors.length, 1);
  assert.equal(f.errors[0]!.context!.attributes!.code, 'sustained-growth');
  assert.equal(f.errors[0]!.context!.attributes!.rss_0_mb, 1000);
  assert.equal(f.errors[0]!.context!.attributes!.rss_12_mb, 1300);
  assert.equal(f.errors[0]!.context!.attributes!.elapsed_12_min, 60);
  f.at(65 * MINUTE); f.rss(2400); await f.memory.tick(); assert.equal(f.errors.length, 1);
  f.consent({ crashes: false, usage: false, installationId: null }); await f.memory.tick();
  f.consent({ crashes: true, usage: false, installationId: 'FAKE_NEW_INSTALL' });
  f.at(70 * MINUTE); await f.memory.tick(); assert.equal(f.errors.length, 1);
  f.at(60 * MINUTE + DAY - 1); await f.memory.tick(); assert.equal(f.errors.length, 1);
  // Advance beyond the monitor's minute cache as well as the detector's daily deadline.
  f.at(60 * MINUTE + DAY + MINUTE); await f.memory.tick(); assert.equal(f.errors.length, 2);
  f.memory.dispose();
});

test('an in-flight measurement cannot send after consent withdrawal or disposal; overlapping ticks coalesce', async () => {
  const f = fixture(); const snapshot = await f.monitor.get({ panelOpen: false });
  for (const change of ['withdraw', 'dispose']) {
    let release!: (value: typeof snapshot) => void;
    let consent = { crashes: true, usage: true, installationId: 'FAKE_INSTALL' };
    const events: unknown[] = [], errors: unknown[] = [];
    let reads = 0;
    const memory = startProductMemoryTelemetry({ desktopPid: 1, monitor: { get: () => { reads++; return new Promise(done => { release = done; }); } },
      readConsent: () => consent, rendererPids: () => new Set([2]), heapUsedBytes: () => 0, uptime: () => 0,
      tracker: { ...createNoopTracker({}), capture: event => { events.push(event); }, error: error => { errors.push(error); } },
    }, { schedule: () => () => {} });
    const first = memory.tick(), second = memory.tick();
    assert.equal(reads, 1);
    if (change === 'withdraw') consent = { crashes: false, usage: false, installationId: 'FAKE_INSTALL' };
    else memory.dispose();
    release(snapshot); await Promise.all([first, second]);
    assert.deepEqual(events, []); assert.deepEqual(errors, []);
    memory.dispose(); await memory.tick(); assert.equal(reads, 1);
  }
  f.memory.dispose();
});

test('withdrawal or disposal while usage capture settles also prevents a late diagnostic warning', async () => {
  const f = fixture(); f.rss(2400);
  const snapshot = await f.monitor.get({ panelOpen: false });
  for (const change of ['withdraw', 'dispose']) {
    let completeCapture!: () => void, entered!: () => void;
    let consent = { crashes: true, usage: true, installationId: 'FAKE_INSTALL' };
    const errors: unknown[] = [];
    const capturing = new Promise<void>(done => { entered = done; });
    const memory = startProductMemoryTelemetry({ desktopPid: 1, monitor: { get: async () => snapshot },
      readConsent: () => consent, rendererPids: () => new Set([2, 3]), heapUsedBytes: () => 0, uptime: () => 0,
      tracker: { ...createNoopTracker({}), capture: () => { entered(); return new Promise<void>(done => { completeCapture = done; }); },
        error: error => { errors.push(error); } },
    }, { schedule: () => () => {} });
    const pending = memory.tick(); await capturing;
    if (change === 'withdraw') consent = { crashes: false, usage: false, installationId: 'FAKE_INSTALL' };
    else memory.dispose();
    completeCapture(); await pending;
    assert.deepEqual(errors, []);
    memory.dispose();
  }
  f.memory.dispose();
});

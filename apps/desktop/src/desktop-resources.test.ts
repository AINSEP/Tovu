/** S2 monitor-only review: desktop ownership, approximate metrics, warnings and cheap sampling. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProcessUsage } from '@jini-ai/platform/process';
import { createDesktopResources } from './desktop-resources.ts';
import type { ElectronProcessMemory } from '@jini-ai/desktop-host/electron';

function usage(pid: number, ppid: number, rssBytes = 100, cpuSeconds = 0, name = 'node'): ProcessUsage {
  return { pid, ppid, rssBytes, cpuSeconds, name };
}

function fixture({ platform = 'darwin' as NodeJS.Platform, totalMem = 10_000_000_000 } = {}) {
  let at = 100_000;
  let rows = [usage(1, 0)];
  let sites: { id: string; pid: number }[] = [];
  let reads = 0;
  let electronMetrics: readonly ElectronProcessMemory[] = [];
  const monitor = createDesktopResources({
    desktopPid: 1, platform, now: () => at, totalMem: () => totalMem,
    listUsage: async () => { reads++; return rows; }, openSites: () => sites,
    listElectronMetrics: () => electronMetrics,
  });
  return { monitor, advance: (ms: number) => { at += ms; }, rows: (next: ProcessUsage[]) => { rows = next; },
    sites: (next: typeof sites) => { sites = next; }, reads: () => reads,
    electronMetrics: (next: readonly ElectronProcessMemory[]) => { electronMetrics = next; } };
}

test('native Electron memory replaces RSS once per PID; packaged serve/daemon keep RSS', async () => {
  const f = fixture({ platform: 'win32' });
  f.sites([{ id: 'C:\\sites\\one', pid: 10 }]);
  f.rows([usage(1, 0, 900_000, 0, 'Tovu.exe'), usage(2, 1, 800_000, 0, 'Tovu.exe'),
    usage(10, 1, 300_000, 0, 'Tovu.exe'), usage(11, 10, 200_000, 0, 'Tovu.exe')]);
  f.electronMetrics([
    { pid: 1, memory: { privateBytes: 100, workingSetSize: 900 } },
    { pid: 2, memory: { privateBytes: 200, workingSetSize: 800 } },
    { pid: 99, memory: { privateBytes: 999_999, workingSetSize: 999_999 } },
  ]);
  const result = await f.monitor.get({ panelOpen: true });
  assert.equal(result.app.rssBytes, 300 * 1024);
  assert.equal(result.sites[0]!.rssBytes, 500_000);
  assert.equal(result.total.rssBytes, 300 * 1024 + 500_000);
  assert.equal(result.approximate, true);
});

test('native metric failure reports unavailable instead of silently reverting to inflated RSS', async () => {
  const monitor = createDesktopResources({ desktopPid: 1, platform: 'win32', now: () => 100_000,
    totalMem: () => 1000, openSites: () => [], listUsage: async () => [usage(1, 0)],
    listElectronMetrics: () => { throw new Error('private native diagnostic'); },
  });
  const result = await monitor.get({ panelOpen: true });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.total.rssBytes, null);
  assert.ok(!JSON.stringify(result).includes('private native diagnostic'));
});

test('S2 groups owned server/daemon/agent trees and Electron helpers; excludes other desktops', async () => {
  const f = fixture();
  f.sites([{ id: '/sites/one', pid: 10 }, { id: 'C:\\sites\\two', pid: 20 }]);
  f.rows([usage(1, 0), usage(2, 1, 200, 0, 'Electron Helper'), usage(10, 1, 300),
    usage(11, 10, 400), usage(12, 11, 500, 0, 'claude'), usage(20, 1, 600), usage(99, 98, 9_000_000_000)]);
  const result = await f.monitor.get({ panelOpen: true });
  assert.equal(result.status, 'available');
  assert.equal(result.approximate, true);
  assert.deepEqual(result.app.processes.map((row) => row.pid), [1, 2]);
  assert.deepEqual(result.sites.map((row) => [row.siteId, row.rssBytes]), [['/sites/one', 1200], ['C:\\sites\\two', 600]]);
  assert.deepEqual(result.sites[0]!.processes.map((row) => row.role), ['site-server', 'daemon', 'process']);
  assert.equal(result.total.rssBytes, 2100);
  assert.equal(result.total.cpuPercent, null);
  assert.deepEqual(Object.keys(result.sites[0]!.processes[0]!).sort(), ['cpuPercent', 'cpuWarning', 'name', 'pid', 'ppid', 'role', 'rssBytes']);
});

test('S2 packaged daemon (Electron as node) shares the server executable name and is still labelled', async () => {
  const f = fixture();
  f.sites([{ id: '/sites/one', pid: 10 }]);
  f.rows([usage(1, 0, 100, 0, 'Tovu'), usage(10, 1, 100, 0, 'Tovu'), usage(11, 10, 100, 0, 'Tovu'), usage(12, 11, 100, 0, 'claude')]);
  const result = await f.monitor.get({ panelOpen: true });
  assert.deepEqual(result.sites[0]!.processes.map((row) => row.role), ['site-server', 'daemon', 'process']);
});

test('S2 overlapping site roots cannot double-count a pid in the total', async () => {
  const f = fixture();
  f.sites([{ id: '/one', pid: 10 }, { id: '/duplicate-handle', pid: 10 }]);
  f.rows([usage(1, 0), usage(10, 1), usage(11, 10)]);
  const result = await f.monitor.get({ panelOpen: true });
  assert.equal(result.total.rssBytes, 300);
  assert.equal(result.sites[1]!.rssBytes, null);
});

test('S2 missing roots and empty/foreign-only samples are unavailable, never zero or stale rows', async () => {
  const f = fixture();
  f.sites([{ id: '/one', pid: 10 }]);
  f.rows([usage(1, 0), usage(10, 1)]);
  await f.monitor.get({ panelOpen: true });
  f.advance(5000);
  f.rows([usage(1, 0)]);
  const vanished = await f.monitor.get({ panelOpen: true });
  assert.equal(vanished.sites[0]!.rssBytes, null);
  assert.deepEqual(vanished.sites[0]!.processes, []);
  for (const rows of [[], [usage(99, 98)]]) {
    f.advance(5000); f.rows(rows);
    const result = await f.monitor.get({ panelOpen: true });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.total.rssBytes, null);
    assert.equal(result.app.rssBytes, null);
    assert.deepEqual(result.app.processes, []);
  }
  f.advance(5000); f.rows([usage(1, 0, 100, 1000)]);
  assert.equal((await f.monitor.get({ panelOpen: true })).total.cpuPercent, null);
});

test('S2 inclusive site 1.5 GB and total 25% warnings; one byte below remains quiet', async () => {
  const f = fixture({ totalMem: 8_000_000_000 });
  f.sites([{ id: '/one', pid: 10 }]);
  f.rows([usage(1, 0, 500_000_000), usage(10, 1, 1_499_999_999)]);
  const below = await f.monitor.get({ panelOpen: true });
  assert.equal(below.total.memoryWarning, false);
  assert.equal(below.sites[0]!.memoryWarning, false);
  f.advance(5000); f.rows([usage(1, 0, 500_000_000), usage(10, 1, 1_500_000_000)]);
  const edge = await f.monitor.get({ panelOpen: true });
  assert.equal(edge.total.memoryWarning, true);
  assert.equal(edge.sites[0]!.memoryWarning, true);
});

test('S2 CPU uses elapsed seconds and warns at 80% on two measured intervals, then clears', async () => {
  const f = fixture();
  f.rows([usage(1, 0, 100, 10)]);
  await f.monitor.get({ panelOpen: true });
  f.advance(5000); f.rows([usage(1, 0, 100, 14)]);
  const first = await f.monitor.get({ panelOpen: true });
  assert.equal(first.total.cpuPercent, 80);
  assert.equal(first.total.cpuWarning, false);
  f.advance(10_000); f.rows([usage(1, 0, 100, 22)]);
  assert.equal((await f.monitor.get({ panelOpen: true })).total.cpuWarning, true);
  f.advance(5000); f.rows([usage(1, 0, 100, 23)]);
  assert.equal((await f.monitor.get({ panelOpen: true })).total.cpuWarning, false);
  f.advance(5000); f.rows([usage(1, 0, 100, 33)]);
  const multiCore = await f.monitor.get({ panelOpen: true });
  assert.equal(multiCore.total.cpuPercent, 200);
  assert.equal(multiCore.total.cpuWarning, false);
});

test('S2 CPU counters are forgotten when a pid vanishes, and decreasing counters are unknown', async () => {
  const f = fixture();
  for (const cpu of [10, 14, 18]) {
    f.rows([usage(1, 0), usage(2, 1, 100, cpu)]);
    await f.monitor.get({ panelOpen: true }); f.advance(5000);
  }
  f.rows([usage(1, 0)]); await f.monitor.get({ panelOpen: true }); f.advance(5000);
  f.rows([usage(1, 0), usage(2, 1, 100, 30)]);
  const returned = await f.monitor.get({ panelOpen: true });
  assert.equal(returned.app.processes[1]!.cpuPercent, null);
  assert.equal(returned.total.cpuWarning, false);
  f.advance(5000); f.rows([usage(1, 0), usage(2, 1, 100, 1)]);
  assert.equal((await f.monitor.get({ panelOpen: true })).app.processes[1]!.cpuPercent, null);
});

test('S2 enforces 5s POSIX, 10s Windows and 60s collapsed cadence even with eager callers', async () => {
  for (const platform of ['darwin', 'win32'] as const) {
    const f = fixture({ platform });
    const interval = platform === 'win32' ? 10_000 : 5000;
    const first = await f.monitor.get({ panelOpen: true });
    assert.equal(first.pollIntervalMs, interval);
    f.advance(interval - 1);
    assert.equal((await f.monitor.get({ panelOpen: true })).sampledAt, first.sampledAt);
    assert.equal(f.reads(), 1);
    f.advance(1); await f.monitor.get({ panelOpen: true }); assert.equal(f.reads(), 2);
    f.advance(59_999); assert.equal((await f.monitor.get({ panelOpen: false })).pollIntervalMs, 60_000);
    assert.equal(f.reads(), 2);
    f.advance(1); await f.monitor.get({ panelOpen: false }); assert.equal(f.reads(), 3);
    f.advance(interval); await f.monitor.get({ panelOpen: true }); assert.equal(f.reads(), 4);
  }
});

test('S2 concurrent calls share a single in-flight sample even when the clock passes its cadence', async () => {
  let resolve!: (value: ProcessUsage[]) => void;
  let reads = 0;
  let at = 100_000;
  const monitor = createDesktopResources({ desktopPid: 1, platform: 'darwin', now: () => at,
    totalMem: () => 1000, openSites: () => [], listUsage: () => { reads++; return new Promise((done) => { resolve = done; }); } });
  const first = monitor.get({ panelOpen: true });
  at += 60_000;
  const second = monitor.get({ panelOpen: false });
  assert.equal(reads, 1);
  resolve([usage(1, 0)]);
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.sampledAt, b.sampledAt);
  assert.equal(a.total.rssBytes, 100);
  assert.equal(a.pollIntervalMs, 5000);
  assert.equal(b.pollIntervalMs, 60_000);
});

test('S2 sampler rejection returns unavailable without native error text and can recover', async () => {
  let fail = true;
  let at = 100_000;
  const monitor = createDesktopResources({ desktopPid: 1, platform: 'darwin', now: () => at,
    totalMem: () => 1000, openSites: () => [], listUsage: async () => {
      if (fail) throw new Error('private native diagnostic');
      return [usage(1, 0)];
    } });
  const result = await monitor.get({ panelOpen: true });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.total.rssBytes, null);
  assert.ok(!JSON.stringify(result).includes('private native diagnostic'));
  fail = false; at += 5000;
  assert.equal((await monitor.get({ panelOpen: true })).status, 'available');
});

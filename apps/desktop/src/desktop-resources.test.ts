/** S2 monitor-only review: desktop ownership, approximate metrics, warnings and cheap sampling. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProcessUsage } from '@jini-ai/platform/process';
import { createDesktopResources, type DesktopResourcesPorts } from './desktop-resources.ts';
import type { ElectronProcessMemory } from '@jini-ai/desktop-host/electron';
import { sampleTopMemory, type PrivateMemorySampler } from './desktop-memory-sampler.ts';

// Legacy RSS fixtures exercise the fallback without launching a host process.
const unavailablePrivateMemory: PrivateMemorySampler = async (_input) => ({ metric: 'unavailable', readings: [] });

test('M3 macOS batches owned PIDs once a minute while inventory follows the open-panel cadence', async () => {
  let at = 0, inventories = 0, probes = 0;
  const monitor = createDesktopResources({
    desktopPid: 1, platform: 'darwin', now: () => at, totalMem: () => 8_000_000_000,
    openSites: () => [{ id: '/one', pid: 10 }],
    listUsage: async () => {
      inventories++;
      return [usage(1, 0, 500_000_000, at / 1000), usage(10, 1, 300_000_000),
        usage(11, 10, 200_000_000), usage(50, 1, 1_000_000, 0, 'ps'),
        usage(51, 1, 1_000_000, 0, 'top'), usage(99, 0, 9_000_000_000)];
    },
    samplePrivateMemory: input => sampleTopMemory(input, { run: async (command, args, options) => {
      probes++;
      assert.equal(command, '/usr/bin/top');
      assert.deepEqual(args, ['-l', '1', '-R', '-F', '-stats', 'pid,mem', '-pid', '1', '-pid', '10', '-pid', '11']);
      assert.equal(options?.timeout, 5000);
      assert.equal(options?.maxBuffer, 1024 * 1024);
      return { ok: true, stdout: 'PID MEM\n11 25M\n1 100M\n10 50M\n99 9G\n', stderr: '', code: 0, error: null };
    } }),
  });
  const [first, shared] = await Promise.all([monitor.get({ panelOpen: true }), monitor.get({ panelOpen: true })]);
  assert.equal(first.total.rssBytes, 175 * 1024 ** 2);
  assert.equal(first.total.memoryMetric, 'physical-footprint');
  assert.equal(first.app.rssBytes, 100 * 1024 ** 2);
  assert.equal(first.sites[0]?.rssBytes, 75 * 1024 ** 2);
  assert.deepEqual(first.sites[0]?.processes.map(row => row.role), ['site-server', 'daemon']);
  assert.equal(shared.sampledAt, first.sampledAt);
  assert.deepEqual([inventories, probes], [1, 1]);
  at = 4999; await monitor.get({ panelOpen: true });
  assert.deepEqual([inventories, probes], [1, 1]);
  at++;
  const next = await monitor.get({ panelOpen: true });
  assert.equal(next.total.cpuPercent, 100);
  assert.deepEqual([inventories, probes], [2, 1]);
  at += 59_999; await monitor.get({ panelOpen: false });
  assert.deepEqual([inventories, probes], [2, 1]);
  at++; await monitor.get({ panelOpen: false });
  assert.deepEqual([inventories, probes], [3, 2]);
});

test('M3 top failures retain labelled RSS and CPU history, then retry after one minute', async () => {
  for (const failure of ['exit', 'throw', 'malformed', 'missing'] as const) {
    let at = 0, probes = 0;
    const monitor = createDesktopResources({
      desktopPid: 1, platform: 'darwin', now: () => at, totalMem: () => 8_000_000_000, openSites: () => [],
      listUsage: async () => [usage(1, 0, 500_000_000, at / 1000)],
      samplePrivateMemory: input => sampleTopMemory(input, { run: async () => {
        probes++;
        if (probes === 1 && failure === 'throw') throw new Error('private top diagnostic');
        const stdout = { exit: 'PID MEM\n1 100M\n', malformed: 'PID MEM\n1 garbled\n', missing: 'PID MEM\n99 100M\n', throw: '' }[failure];
        return { ok: probes > 1 || failure !== 'exit', stdout: probes === 1 ? stdout : 'PID MEM\n1 100M\n',
          stderr: 'private top diagnostic', code: 0, error: null };
      } }),
    });
    const fallback = await monitor.get({ panelOpen: true });
    assert.equal(fallback.status, 'available');
    assert.equal(fallback.total.rssBytes, 500_000_000);
    assert.equal(fallback.total.memoryMetric, 'rss');
    assert.equal(fallback.app.processes[0]?.memoryMetric, 'rss');
    assert.equal(JSON.stringify(fallback).includes('private top diagnostic'), false);
    at = 4999; await monitor.get({ panelOpen: true });
    assert.equal(probes, 1);
    at++;
    const waiting = await monitor.get({ panelOpen: true });
    assert.equal(waiting.total.memoryMetric, 'rss');
    assert.equal(waiting.total.cpuPercent, 100);
    assert.equal(probes, 1);
    at = 60_000;
    const recovered = await monitor.get({ panelOpen: true });
    assert.equal(recovered.total.rssBytes, 100 * 1024 ** 2);
    assert.equal(recovered.total.memoryMetric, 'physical-footprint');
    assert.equal(recovered.total.cpuPercent, 100);
    assert.equal(probes, 2);
  }
});

test('M3 top partial results preserve each missing PID as RSS in mixed totals', async () => {
  const monitor = createDesktopResources({
    desktopPid: 1, platform: 'darwin', now: () => 0, totalMem: () => 8_000_000_000, openSites: () => [],
    listUsage: async () => [usage(1, 0, 500_000_000), usage(2, 1, 300_000_000)],
    samplePrivateMemory: input => sampleTopMemory(input, { run: async () => ({ ok: true, stdout: 'PID MEM\n1 100M\n', stderr: '', code: 0, error: null }) }),
  });
  const result = await monitor.get({ panelOpen: true });
  assert.equal(result.total.rssBytes, 100 * 1024 ** 2 + 300_000_000);
  assert.equal(result.total.memoryMetric, 'mixed-rss');
  assert.deepEqual(result.app.processes.map(row => row.memoryMetric), ['physical-footprint', 'rss']);
});

test('M3 explicit memory samplers take precedence over the default top wiring', async () => {
  let reads = 0;
  const monitor = createDesktopResources({
    desktopPid: 1, platform: 'darwin', now: () => 0, totalMem: () => 1000, openSites: () => [],
    listUsage: async () => [usage(1, 0, 900)],
    samplePrivateMemory: async () => { reads++; return { metric: 'physical-footprint', readings: [{ pid: 1, bytes: 25 }] }; },
  });
  const result = await monitor.get({ panelOpen: true });
  assert.equal(result.total.rssBytes, 25);
  assert.equal(result.total.memoryMetric, 'physical-footprint');
  assert.equal(reads, 1);
});

test('M3 Windows and Linux defaults retain OS RSS without native memory wiring', async () => {
  for (const platform of ['win32', 'linux'] as const) {
    const monitor = createDesktopResources({
      desktopPid: 1, platform, now: () => 0, totalMem: () => 1000, openSites: () => [],
      listUsage: async () => [usage(1, 0, 900)],
    });
    const result = await monitor.get({ panelOpen: true });
    assert.equal(result.total.rssBytes, 900);
    assert.equal(result.total.memoryMetric, 'rss');
  }
});

test('M3 missing desktop inventories never launch top for foreign PIDs', async () => {
  let probes = 0;
  const monitor = createDesktopResources({
    desktopPid: 1, platform: 'darwin', now: () => 0, totalMem: () => 1000, openSites: () => [],
    listUsage: async () => [usage(99, 0)],
    samplePrivateMemory: async () => { probes++; return unavailablePrivateMemory({ pids: [] }); },
  });
  const result = await monitor.get({ panelOpen: true });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.total.rssBytes, null);
  assert.equal(probes, 0);
});

test('M2 batches all requested macOS PIDs in one bounded top call and parses binary units and change suffixes', async () => {
  const calls: unknown[] = [];
  const result = await sampleTopMemory({ pids: [12, 13, 14, 15, 12] }, { run: async (command, args, options) => {
    calls.push({ command, args, timeout: options?.timeout, maxBuffer: options?.maxBuffer });
    return { ok: true, stdout: 'Processes: 99 total\nPID MEM\n13 1.5M+\n12 123K-\n14 2G\n15 0B\n99 999M\n', stderr: '', code: 0, error: null };
  } });
  assert.deepEqual(calls, [{ command: '/usr/bin/top', args: ['-l', '1', '-R', '-F', '-stats', 'pid,mem', '-pid', '12', '-pid', '13', '-pid', '14', '-pid', '15'], timeout: 5000, maxBuffer: 1024 * 1024 }]);
  assert.deepEqual(result, { metric: 'physical-footprint', readings: [
    { pid: 12, bytes: 125952 }, { pid: 13, bytes: 1572864 }, { pid: 14, bytes: 2147483648 }, { pid: 15, bytes: 0 },
  ] });
});

test('M2 top leaves missing, duplicate, malformed and unsafe readings unavailable per PID', async () => {
  const result = await sampleTopMemory({ pids: [1, 2, 3, 4, 5, 6, 7] }, { run: async () => ({
    ok: true, stdout: 'PID MEM\n1 25M\n2 10M\n2 11M\n3 --\n4 -2G\n5 4Q\n6 999999999999999G\n', stderr: '', code: 0, error: null,
  }) });
  assert.deepEqual(result.readings, [{ pid: 1, bytes: 26214400 }, ...[2, 3, 4, 5, 6, 7].map(pid => ({ pid, bytes: null }))]);
});

test('M2 top failure discards partial output; empty and oversized PID sets never spawn', async () => {
  for (const run of [async () => ({ ok: false, stdout: 'PID MEM\n1 2G\n', stderr: 'private diagnostic', code: 1, error: null }),
    async () => { throw new Error('private diagnostic'); }]) {
    assert.deepEqual((await sampleTopMemory({ pids: [1] }, { run })).readings, [{ pid: 1, bytes: null }]);
  }
  const run = async () => { assert.fail('invalid/empty PID sets cannot spawn'); };
  assert.deepEqual((await sampleTopMemory({ pids: [] }, { run })).readings, []);
  assert.equal((await sampleTopMemory({ pids: Array.from({ length: 513 }, (_, i) => i + 1) }, { run })).readings.every(row => row.bytes === null), true);
  assert.equal((await sampleTopMemory({ pids: [0, -1, 1.5] }, { run })).readings.every(row => row.bytes === null), true);
});

test('M2 batched top feeds owned totals and labelled RSS fallback without resetting CPU history', async () => {
  let at = 0, probes = 0;
  const monitor = createDesktopResources({
    desktopPid: 1, platform: 'darwin', now: () => at, totalMem: () => 8_000_000_000, openSites: () => [],
    listUsage: async () => [usage(1, 0, 500_000_000, at / 1000), usage(2, 1, 300_000_000), usage(99, 0, 1_000_000_000)],
    samplePrivateMemory: input => sampleTopMemory(input, { run: async (command, args) => {
      probes++;
      assert.equal(command, '/usr/bin/top');
      assert.deepEqual(args, ['-l', '1', '-R', '-F', '-stats', 'pid,mem', '-pid', '1', '-pid', '2']);
      return { ok: true, stdout: `PID MEM\n1 100M\n2 ${probes === 1 ? '50M' : 'garbled'}\n`, stderr: '', code: 0, error: null };
    } }),
  });
  const initial = await monitor.get({ panelOpen: true });
  assert.equal(initial.total.rssBytes, 157_286_400);
  assert.equal(initial.total.memoryMetric, 'physical-footprint');
  await monitor.get({ panelOpen: true });
  assert.equal(probes, 1);
  at += 5000;
  const cachedMemory = await monitor.get({ panelOpen: true });
  assert.equal(cachedMemory.total.rssBytes, 157_286_400);
  assert.equal(cachedMemory.total.cpuPercent, 100);
  assert.equal(probes, 1);
  at = 60_000;
  const fallback = await monitor.get({ panelOpen: true });
  assert.equal(fallback.total.rssBytes, 404_857_600);
  assert.equal(fallback.total.memoryMetric, 'mixed-rss');
  assert.equal(fallback.app.processes.find(row => row.pid === 2)?.memoryMetric, 'rss');
  assert.equal(fallback.total.cpuPercent, 100);
  assert.equal(probes, 2);
});

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
    samplePrivateMemory: unavailablePrivateMemory,
  });
  return { monitor, advance: (ms: number) => { at += ms; }, rows: (next: ProcessUsage[]) => { rows = next; },
    sites: (next: typeof sites) => { sites = next; }, reads: () => reads,
    electronMetrics: (next: readonly ElectronProcessMemory[]) => { electronMetrics = next; } };
}

test('Job M uses physical footprint for the total, site tree and warning thresholds', async () => {
  const requests: number[][] = [];
  const ports: DesktopResourcesPorts = {
    desktopPid: 1, platform: 'darwin', now: () => 100_000, totalMem: () => 4_000_000_000,
    openSites: () => [{ id: '/sites/one', pid: 10 }],
    listUsage: async () => [usage(1, 0, 520_000_000), usage(2, 1, 280_000_000, 0, 'GPU'),
      usage(10, 1, 600_000_000), usage(11, 10, 200_000_000), usage(99, 98, 9_000_000_000)],
    samplePrivateMemory: async ({ pids }) => {
      requests.push([...pids]);
      assert.deepEqual([...pids].sort((a, b) => a - b), [1, 2, 10, 11]);
      return { metric: 'physical-footprint', readings: [
        { pid: 11, bytes: 72_000_000 }, { pid: 2, bytes: 78_000_000 },
        { pid: 10, bytes: 200_000_000 }, { pid: 1, bytes: 200_000_000 },
      ] };
    },
  };
  const result = await createDesktopResources(ports).get({ panelOpen: true });
  assert.equal(requests.length, 1);
  assert.equal(result.total.rssBytes, 550_000_000);
  assert.equal(result.total.memoryMetric, 'physical-footprint');
  assert.equal(result.total.memoryWarning, false, '1.6 GB RSS must not trigger the 1 GB total threshold');
  assert.equal(result.app.processes.find(row => row.pid === 2)?.rssBytes, 78_000_000);
  assert.equal(result.sites.find(site => site.siteId === '/sites/one')?.rssBytes, 272_000_000);
  assert.equal(result.sites[0]?.memoryMetric, 'physical-footprint');
});

test('Job M keeps partial native failures visible as mixed RSS estimates, preserving CPU and ownership', async () => {
  const ports: DesktopResourcesPorts = {
    desktopPid: 1, platform: 'darwin', now: () => 100_000, totalMem: () => 8_000_000_000,
    openSites: () => [{ id: '/sites/one', pid: 10 }],
    listUsage: async () => [usage(1, 0, 500_000_000), usage(10, 1, 300_000_000), usage(11, 10, 200_000_000)],
    samplePrivateMemory: async () => ({ metric: 'physical-footprint', readings: [
      { pid: 1, bytes: 100_000_000 }, { pid: 10, bytes: 0 }, { pid: 11, bytes: null },
    ] }),
  };
  const result = await createDesktopResources(ports).get({ panelOpen: true });
  assert.equal(result.total.rssBytes, 300_000_000);
  assert.equal(result.total.memoryMetric, 'mixed-rss');
  assert.equal(result.app.memoryMetric, 'physical-footprint');
  assert.equal(result.sites[0]?.rssBytes, 200_000_000);
  assert.equal(result.sites[0]?.memoryMetric, 'mixed-rss');
  assert.equal(result.sites[0]?.processes.find(row => row.pid === 10)?.rssBytes, 0);
  assert.equal(result.sites[0]?.processes.find(row => row.pid === 11)?.memoryMetric, 'rss');
  assert.equal(result.total.cpuPercent, null);
});

test('Job M uses Windows private working set rather than Electron committed private bytes', async () => {
  const ports: DesktopResourcesPorts = {
    desktopPid: 1, platform: 'win32', now: () => 100_000, totalMem: () => 8_000_000_000,
    openSites: () => [], listUsage: async () => [usage(1, 0, 900_000_000)],
    listElectronMetrics: () => [{ pid: 1, memory: { privateBytes: 800_000, workingSetSize: 900_000 } }],
    samplePrivateMemory: async () => ({ metric: 'private-working-set', readings: [{ pid: 1, bytes: 200_000_000 }] }),
  };
  const result = await createDesktopResources(ports).get({ panelOpen: true });
  assert.equal(result.total.rssBytes, 200_000_000);
  assert.equal(result.total.memoryMetric, 'private-working-set');
});

test('M2 Windows uses existing Electron committed bytes without adding a native working-set probe', async () => {
  const f = fixture({ platform: 'win32' });
  f.rows([usage(1, 0, 900_000_000), usage(2, 1, 300_000_000)]);
  f.electronMetrics([{ pid: 1, memory: { privateBytes: 100_000, workingSetSize: 900_000 } }]);
  const result = await f.monitor.get({ panelOpen: true });
  assert.equal(result.app.processes.find(row => row.pid === 1)?.rssBytes, 102_400_000);
  assert.equal(result.app.processes.find(row => row.pid === 1)?.memoryMetric, 'committed');
  assert.equal(result.app.processes.find(row => row.pid === 2)?.memoryMetric, 'rss');
  assert.equal(result.total.memoryMetric, 'mixed-rss');
  assert.equal(f.reads(), 1);
});

test('M2 Linux retains labelled OS RSS even if Electron supplies another memory value', async () => {
  const f = fixture({ platform: 'linux' });
  f.rows([usage(1, 0, 250_000_000)]);
  f.electronMetrics([{ pid: 1, memory: { privateBytes: 100, workingSetSize: 200 } }]);
  const result = await f.monitor.get({ panelOpen: true });
  assert.equal(result.total.rssBytes, 250_000_000);
  assert.equal(result.total.memoryMetric, 'rss');
});

test('M2 invalid native readings fall back per PID while valid zero remains measured', async () => {
  const monitor = createDesktopResources({
    desktopPid: 1, platform: 'darwin', now: () => 0, totalMem: () => 8_000_000_000, openSites: () => [],
    listUsage: async () => [usage(1, 0, 100), ...[2, 3, 4, 5].map(pid => usage(pid, 1, 100))],
    samplePrivateMemory: async () => ({ metric: 'physical-footprint', readings: [
      { pid: 1, bytes: 0 }, { pid: 2, bytes: -1 }, { pid: 3, bytes: NaN }, { pid: 4, bytes: Infinity }, { pid: 5, bytes: Number.MAX_SAFE_INTEGER + 1 },
    ] }),
  });
  const result = await monitor.get({ panelOpen: true });
  assert.equal(result.total.rssBytes, 400);
  assert.deepEqual(result.app.processes.map(row => row.memoryMetric), ['physical-footprint', 'rss', 'rss', 'rss', 'rss']);
});

test('Job M applies the inclusive site and total warning edges to footprint bytes', async () => {
  let at = 100_000, siteBytes = 1_499_999_999;
  const ports: DesktopResourcesPorts = {
    desktopPid: 1, platform: 'darwin', now: () => at, totalMem: () => 8_000_000_000,
    openSites: () => [{ id: '/sites/one', pid: 10 }],
    listUsage: async () => [usage(1, 0, 2_000_000_000), usage(10, 1, 3_000_000_000)],
    samplePrivateMemory: async () => ({ metric: 'physical-footprint', readings: [
      { pid: 1, bytes: 500_000_000 }, { pid: 10, bytes: siteBytes },
    ] }),
  };
  const monitor = createDesktopResources(ports);
  const below = await monitor.get({ panelOpen: true });
  assert.equal(below.total.memoryWarning, false);
  assert.equal(below.sites[0]?.memoryWarning, false);
  at += 60_000; siteBytes++;
  const edge = await monitor.get({ panelOpen: true });
  assert.equal(edge.total.memoryWarning, true);
  assert.equal(edge.sites[0]?.memoryWarning, true);
});

test('Job M labels RSS fallback after native sampling fails and retries after one minute', async () => {
  let at = 100_000, fail = true, reads = 0;
  const ports: DesktopResourcesPorts = {
    desktopPid: 1, platform: 'darwin', now: () => at, totalMem: () => 8_000_000_000,
    openSites: () => [], listUsage: async () => [usage(1, 0, 500_000_000, (at - 100_000) / 1000)],
    samplePrivateMemory: async () => {
      reads++;
      if (fail) throw new Error('private native diagnostic');
      return { metric: 'physical-footprint', readings: [{ pid: 1, bytes: 100_000_000 }] };
    },
  };
  const monitor = createDesktopResources(ports);
  const fallback = await monitor.get({ panelOpen: true });
  assert.equal(fallback.status, 'available');
  assert.equal(fallback.total.rssBytes, 500_000_000);
  assert.equal(fallback.total.memoryMetric, 'rss');
  assert.equal(JSON.stringify(fallback).includes('private native diagnostic'), false);
  fail = false; at += 4_999;
  await monitor.get({ panelOpen: true }); assert.equal(reads, 1);
  at++;
  const waiting = await monitor.get({ panelOpen: true });
  assert.equal(waiting.total.rssBytes, 500_000_000);
  assert.equal(waiting.total.cpuPercent, 100);
  assert.equal(reads, 1);
  at = 160_000;
  const recovered = await monitor.get({ panelOpen: true });
  assert.equal(recovered.total.rssBytes, 100_000_000);
  assert.equal(recovered.total.memoryMetric, 'physical-footprint');
  assert.equal(recovered.total.cpuPercent, 100);
  assert.equal(reads, 2);
});

test('Job M samples inventory at five seconds and private memory once a minute, sharing eager callers', async () => {
  let at = 100_000, osReads = 0, privateReads = 0;
  const ports: DesktopResourcesPorts = {
    desktopPid: 1, platform: 'darwin', now: () => at, totalMem: () => 8_000_000_000,
    openSites: () => [], listUsage: async () => { osReads++; return [usage(1, 0, 900_000_000)]; },
    samplePrivateMemory: async ({ pids }) => {
      assert.deepEqual(pids, [1]); privateReads++;
      return { metric: 'physical-footprint', readings: [{ pid: 1, bytes: 100_000_000 }] };
    },
  };
  const monitor = createDesktopResources(ports);
  await Promise.all([monitor.get({ panelOpen: true }), monitor.get({ panelOpen: true })]);
  at += 4_999; await monitor.get({ panelOpen: true });
  assert.deepEqual([osReads, privateReads], [1, 1]);
  at++; await monitor.get({ panelOpen: true });
  assert.deepEqual([osReads, privateReads], [2, 1]);
  at += 59_999; await monitor.get({ panelOpen: false });
  assert.deepEqual([osReads, privateReads], [2, 1]);
  at++; await monitor.get({ panelOpen: false });
  assert.deepEqual([osReads, privateReads], [3, 2]);
});

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
  assert.deepEqual(Object.keys(result.sites[0]!.processes[0]!).sort(), ['cpuPercent', 'cpuWarning', 'memoryMetric', 'name', 'pid', 'ppid', 'rawRssBytes', 'role', 'rssBytes']);
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
    totalMem: () => 1000, openSites: () => [], listUsage: () => { reads++; return new Promise((done) => { resolve = done; }); },
    samplePrivateMemory: unavailablePrivateMemory,
  });
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
    }, samplePrivateMemory: unavailablePrivateMemory });
  const result = await monitor.get({ panelOpen: true });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.total.rssBytes, null);
  assert.ok(!JSON.stringify(result).includes('private native diagnostic'));
  fail = false; at += 5000;
  assert.equal((await monitor.get({ panelOpen: true })).status, 'available');
});

test('collapsed launch failures use the bounded panel retry cadence, then restore the normal cache', async () => {
  for (const platform of ['darwin', 'win32'] as const) {
    const f = fixture({ platform });
    const retryMs = platform === 'win32' ? 10_000 : 5_000;
    f.rows([]);
    const unavailable = await f.monitor.get({ panelOpen: false });
    assert.equal(unavailable.status, 'unavailable');
    assert.equal(unavailable.pollIntervalMs, retryMs);
    f.advance(retryMs - 1);
    await f.monitor.get({ panelOpen: false });
    assert.equal(f.reads(), 1, 'eager callers cannot make failure recovery busy-poll');
    f.advance(1); f.rows([usage(1, 0)]);
    const recovered = await f.monitor.get({ panelOpen: false });
    assert.equal(f.reads(), 2);
    assert.equal(recovered.total.rssBytes, 100);
    assert.equal(recovered.pollIntervalMs, 60_000);
    f.advance(59_999); await f.monitor.get({ panelOpen: false });
    assert.equal(f.reads(), 2, 'successful badge readings keep the original cheap cache');
  }
});

test('the usage probe (ps; PowerShell on Windows) never counts itself, so the total CPU is measured', async () => {
  for (const [platform, probe] of [['darwin', 'ps'], ['win32', 'powershell.exe']] as const) {
    const f = fixture({ platform });
    f.rows([usage(1, 0, 100, 10), usage(2, 1, 100, 10, 'Tovu Helper'), usage(50, 1, 1_000_000, 0, probe)]);
    await f.monitor.get({ panelOpen: true });
    // Each read spawns a fresh probe pid, which never has a previous CPU sample.
    f.advance(10_000); f.rows([usage(1, 0, 100, 11), usage(2, 1, 100, 10.5, 'Tovu Helper'), usage(51, 1, 1_000_000, 0, probe)]);
    const result = await f.monitor.get({ panelOpen: true });
    assert.deepEqual(result.app.processes.map((row) => row.name), ['node', 'Tovu Helper']);
    assert.equal(result.total.rssBytes, 200);
    assert.equal(result.total.cpuPercent, 15);
  }
});

test('a ps that is not the desktop\'s own probe is still counted', async () => {
  const f = fixture();
  f.sites([{ id: '/one', pid: 10 }]);
  f.rows([usage(1, 0), usage(10, 1), usage(11, 10, 100, 0, 'ps')]);
  const result = await f.monitor.get({ panelOpen: true });
  assert.deepEqual(result.sites[0]!.processes.map((row) => row.name), ['node', 'ps']);
});


test('B2 maintenance and panel reads share one sampler and bypass the collapsed 60 s cache', async () => {
  const f = fixture();
  await f.monitor.get({ panelOpen: false }, {});
  f.advance(30_000);
  const [maintenance, panel] = await Promise.all([f.monitor.get({ panelOpen: true }, {}), f.monitor.get({ panelOpen: true }, {})]);
  assert.equal(f.reads(), 2);
  assert.equal(maintenance.sampledAt, panel.sampledAt);
  assert.equal(maintenance.pollIntervalMs, 5_000);
});

test('a newly running site gets its own reading before the collapsed cache expires', async () => {
  const f = fixture();
  const initial = await f.monitor.get({ panelOpen: false });
  assert.deepEqual(initial.sites, []);
  f.advance(5_000);
  f.sites([{ id: '/sites/one', pid: 10 }]);
  f.rows([usage(1, 0, 100), usage(10, 1, 300), usage(11, 10, 200)]);
  const running = await f.monitor.get({ panelOpen: false });
  assert.equal(running.sites[0]?.rssBytes, 500);
  assert.equal(running.total.rssBytes, 600);
  assert.equal(f.reads(), 2);
  await f.monitor.get({ panelOpen: false });
  assert.equal(f.reads(), 2, 'an unchanged site set keeps the normal cache');
});

test('replacing a site PID or stopping it withdraws the old process group before cache expiry', async () => {
  const f = fixture();
  f.sites([{ id: '/sites/one', pid: 10 }]);
  f.rows([usage(1, 0, 100), usage(10, 1, 300)]);
  await f.monitor.get({ panelOpen: false });
  f.advance(5_000);
  f.sites([{ id: '/sites/one', pid: 20 }]);
  f.rows([usage(1, 0, 100), usage(20, 1, 500)]);
  const restarted = await f.monitor.get({ panelOpen: false });
  assert.equal(restarted.sites[0]?.rssBytes, 500);
  assert.deepEqual(restarted.sites[0]?.processes.map(row => row.pid), [20]);
  f.advance(5_000);
  f.sites([]);
  f.rows([usage(1, 0, 100)]);
  const stopped = await f.monitor.get({ panelOpen: false });
  assert.deepEqual(stopped.sites, []);
  assert.equal(stopped.total.rssBytes, 100);
  assert.equal(f.reads(), 3);
});

test('reordered site handles retain the cached sample', async () => {
  const f = fixture();
  const one = { id: '/sites/one', pid: 10 }, two = { id: '/sites/two', pid: 20 };
  f.sites([one, two]);
  f.rows([usage(1, 0), usage(10, 1), usage(20, 1)]);
  await f.monitor.get({ panelOpen: false });
  f.sites([two, one]);
  await f.monitor.get({ panelOpen: false });
  assert.equal(f.reads(), 1);
});

test('a site opened during an in-flight sample gets a bounded retry without overlapping OS reads', async () => {
  let finish!: (rows: ProcessUsage[]) => void;
  let sites: { id: string; pid: number }[] = [];
  let reads = 0;
  const monitor = createDesktopResources({ desktopPid: 1, platform: 'darwin', now: () => 0,
    totalMem: () => 1000, openSites: () => sites,
    listUsage: () => { reads++; return new Promise(resolve => { finish = resolve; }); },
    samplePrivateMemory: unavailablePrivateMemory,
  });
  const beforeStart = monitor.get({ panelOpen: false });
  sites = [{ id: '/sites/one', pid: 10 }];
  const afterStart = monitor.get({ panelOpen: false });
  assert.equal(reads, 1);
  finish([usage(1, 0)]);
  await beforeStart;
  assert.equal((await afterStart).pollIntervalMs, 5_000);
  const refreshed = monitor.get({ panelOpen: false });
  assert.equal(reads, 2);
  finish([usage(1, 0), usage(10, 1, 300)]);
  assert.equal((await refreshed).sites[0]?.rssBytes, 300);
});

test('footprint reads are limited to once a minute; new PIDs use RSS until the next read', async () => {
  let at = 0, reads = 0;
  let rows = [usage(1, 0, 500)];
  const monitor = createDesktopResources({ desktopPid: 1, platform: 'darwin', now: () => at,
    totalMem: () => 10000, openSites: () => [], listUsage: async () => rows,
    samplePrivateMemory: async ({ pids }) => { reads++; return { metric: 'physical-footprint', readings: pids.map(pid => ({ pid, bytes: 25 })) }; },
  });
  const first = await monitor.get({ panelOpen: true });
  assert.equal(first.app.processes[0]!.rawRssBytes, 500);
  rows = [...rows, usage(2, 1, 300)]; at = 5000;
  const mixed = await monitor.get({ panelOpen: true });
  assert.equal(mixed.total.rssBytes, 325);
  assert.equal(mixed.total.memoryMetric, 'mixed-rss');
  assert.equal(reads, 1);
  at = 59999; await monitor.get({ panelOpen: true }); assert.equal(reads, 1);
  at = 64999;
  assert.equal((await monitor.get({ panelOpen: true })).total.rssBytes, 50);
  assert.equal(reads, 2);
});

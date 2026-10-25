/** Tovu policy over Jini's bounded OS sampler and process-tree owner. Monitor only. */
import { collectProcessTreePids, type ProcessUsage } from '@jini-ai/platform/process';
import type { ResourceGroup, ResourceMetrics, ResourceProcess, ResourcesRequest, ResourcesSnapshot } from './contracts/resources.ts';

/** Review specifies GB (decimal), inclusive edges, and CPU sustained across two measured intervals. */
const SITE_WARNING_BYTES = 1_500_000_000;
const CPU_WARNING_PERCENT = 80;

interface OpenResourceSite { id: string; pid: number }
interface CpuHistory { cpuSeconds: number; high: boolean }
interface PreviousSample { at: number; processes: ReadonlyMap<number, CpuHistory> }

/** Inject effects at the desktop boundary; no daemon discovery, registry or persistence. */
export interface DesktopResourcesPorts {
  desktopPid: number;
  platform: NodeJS.Platform;
  listUsage: () => Promise<readonly ProcessUsage[]>;
  now: () => number;
  totalMem: () => number;
  openSites: () => readonly OpenResourceSite[];
}

/** Unknown CPU stays unknown until a second, monotonic observation of that pid. */
function cpuReading({ usage, previous, at }: { usage: ProcessUsage; previous: PreviousSample; at: number }, _options = {}) {
  const before = previous.processes.get(usage.pid);
  if (!before || at <= previous.at || usage.cpuSeconds < before.cpuSeconds) {
    return { cpuPercent: null, cpuWarning: false, high: false };
  }
  const cpuPercent = (usage.cpuSeconds - before.cpuSeconds) * 100_000 / (at - previous.at);
  const high = cpuPercent >= CPU_WARNING_PERCENT;
  return { cpuPercent, cpuWarning: high && before.high, high };
}

/** The first direct node child is the daemon by the reviewed desktop spawn-tree convention.
 * A packaged daemon is spawned with the server's own process.execPath (Electron as node), so it
 * carries the server's executable name instead of "node".
 */
function processRows({ usages, rootPid, rootRole, readings }: {
  usages: readonly ProcessUsage[]; rootPid: number; rootRole: 'site-server' | 'app';
  readings: ReadonlyMap<number, ReturnType<typeof cpuReading>>;
}, _options = {}): ResourceProcess[] {
  const rootName = usages.find((row) => row.pid === rootPid)?.name;
  const daemonPid = rootRole === 'site-server'
    ? usages.find((row) => row.ppid === rootPid && (row.name === rootName || /^node(?:\.exe)?$/i.test(row.name)))?.pid : undefined;
  return usages.map((row) => {
    let role: ResourceProcess['role'] = row.pid === daemonPid ? 'daemon' : 'process';
    if (row.pid === rootPid) role = rootRole;
    return { pid: row.pid, ppid: row.ppid, name: row.name, rssBytes: row.rssBytes, role,
      cpuPercent: readings.get(row.pid)!.cpuPercent, cpuWarning: readings.get(row.pid)!.cpuWarning };
  });
}

/** Null is distinct from zero: missing roots and failed samples must not look inexpensive. */
function metrics({ processes, available, warningBytes }: {
  processes: readonly ResourceProcess[]; available: boolean; warningBytes: number;
}, _options = {}): ResourceMetrics {
  if (!available) return { rssBytes: null, cpuPercent: null, memoryWarning: false, cpuWarning: false };
  const rssBytes = processes.reduce((sum, row) => sum + row.rssBytes, 0);
  return {
    rssBytes,
    cpuPercent: processes.every((row) => row.cpuPercent !== null)
      ? processes.reduce((sum, row) => sum + row.cpuPercent!, 0) : null,
    memoryWarning: rssBytes >= warningBytes,
    cpuWarning: processes.some((row) => row.cpuWarning),
  };
}

/** Group only descendants of this desktop; each pid contributes to exactly one displayed bucket.
 * Tree walking stays in Jini. One bounded OS read serves the whole fleet, with no per-site I/O.
 * @complexity O((s+1) * (n + tree(n))) time/O(n+s) space for n processes and s sites;
 * tree(n) is Jini's traversal, including its deterministic PID sort.
 */
function groupSample({ usages, sites, desktopPid, previous, at, totalMemoryBytes, pollIntervalMs }: {
  usages: readonly ProcessUsage[]; sites: readonly OpenResourceSite[]; desktopPid: number;
  previous: PreviousSample; at: number; totalMemoryBytes: number; pollIntervalMs: number;
}, _options = {}): { snapshot: ResourcesSnapshot; history: PreviousSample } {
  const tree = usages.map((row) => ({ pid: row.pid, ppid: row.ppid, command: '' }));
  const owned = new Set(collectProcessTreePids(tree, [desktopPid]));
  const available = usages.some((row) => row.pid === desktopPid);
  const rows = available ? usages.filter((row) => owned.has(row.pid)) : [];
  const readings = new Map(rows.map((usage) => [usage.pid, cpuReading({ usage, previous, at })]));
  const claimed = new Set<number>();
  const groups = sites.map((site): ResourceGroup => {
    const pids = new Set(collectProcessTreePids(tree, [site.pid]));
    const members = rows.filter((row) => pids.has(row.pid) && !claimed.has(row.pid));
    for (const row of members) claimed.add(row.pid);
    const processes = processRows({ usages: members, rootPid: site.pid, rootRole: 'site-server', readings });
    return { siteId: site.id, processes, ...metrics({ processes, available: members.some((row) => row.pid === site.pid), warningBytes: SITE_WARNING_BYTES }) };
  });
  const appProcesses = processRows({ usages: rows.filter((row) => !claimed.has(row.pid)), rootPid: desktopPid, rootRole: 'app', readings });
  const allProcesses = [...appProcesses, ...groups.flatMap((group) => group.processes)];
  return {
    snapshot: {
      status: available ? 'available' : 'unavailable', sampledAt: at, pollIntervalMs, totalMemoryBytes, approximate: true,
      total: metrics({ processes: allProcesses, available, warningBytes: totalMemoryBytes * 0.25 }),
      app: { siteId: null, processes: appProcesses, ...metrics({ processes: appProcesses, available, warningBytes: Infinity }) },
      sites: groups,
    },
    history: { at, processes: new Map(rows.map((row) => [row.pid, { cpuSeconds: row.cpuSeconds, high: readings.get(row.pid)!.high }])) },
  };
}

/**
 * Main owns request-driven sampling and caches between polls. Concurrent callers share one read;
 * failures clear CPU history and return unavailable without leaking native errors. No timers to leak.
 * @param ports Desktop identity, OS sampler, clock, physical RAM and current owned site handles.
 * @returns get(request, options): resolves a serializable snapshot; never stops a process.
 * @example const monitor = createDesktopResources(ports); await monitor.get({ panelOpen: true });
 * @complexity Per sample O((s+1) * (n + tree(n))) time/O(n+s) space (see groupSample); cached reads O(1).
 */
export function createDesktopResources(ports: DesktopResourcesPorts, _options = {}) {
  let previous: PreviousSample = { at: 0, processes: new Map() };
  let cached: ResourcesSnapshot | undefined;
  let inFlight: Promise<ResourcesSnapshot> | undefined;
  let lastAttempt = -Infinity;

  /** Sampler failures intentionally use the same unavailable outcome as Jini's empty result. */
  async function sample({ pollIntervalMs }: { pollIntervalMs: number }, _sampleOptions = {}): Promise<ResourcesSnapshot> {
    let usages: readonly ProcessUsage[];
    try { usages = await ports.listUsage(); } catch { usages = []; }
    const result = groupSample({ usages, sites: ports.openSites(), desktopPid: ports.desktopPid,
      previous, at: ports.now(), totalMemoryBytes: ports.totalMem(), pollIntervalMs });
    previous = result.history;
    cached = result.snapshot;
    return cached;
  }

  return {
    /** Call only from a visible renderer; panelOpen selects the cheaper collapsed-badge cadence. */
    async get({ panelOpen }: ResourcesRequest, _getOptions = {}): Promise<ResourcesSnapshot> {
      const panelIntervalMs = ports.platform === 'win32' ? 10_000 : 5_000;
      const pollIntervalMs = panelOpen ? panelIntervalMs : 60_000;
      if (!inFlight && (!cached || ports.now() - lastAttempt >= pollIntervalMs)) {
        lastAttempt = ports.now();
        inFlight = sample({ pollIntervalMs }).finally(() => { inFlight = undefined; });
      }
      const snapshot = inFlight ? await inFlight : cached!;
      return { ...snapshot, pollIntervalMs };
    },
  };
}

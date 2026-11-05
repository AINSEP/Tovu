/** Tovu policy over Jini's bounded OS sampler and process-tree owner. Monitor only. */
import { collectProcessTreePids, type ProcessUsage, type ProcessPrivateMemory } from '@jini-ai/platform/process';
import type { ElectronProcessMemory } from '@jini-ai/desktop-host/electron';
import type { ResourcesRequest, ResourceMetrics, ResourceProcess, ResourcesSnapshot } from './contracts/resources.ts';
import { groupMemoryMetric, readDesktopMemory, sampleTopMemory, type MemoryUsage, type PrivateMemorySampler } from './desktop-memory-sampler.ts';

type ResourceGroup = ResourcesSnapshot['app'];

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
  /** Native Electron PIDs only; Electron-as-node children stay in the OS sample. */
  listElectronMetrics?: () => readonly ElectronProcessMemory[];
  /** One bulk read for owned PIDs; missing/failed readings retain labelled RSS. */
  samplePrivateMemory?: PrivateMemorySampler;
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
  usages: readonly MemoryUsage[]; rootPid: number; rootRole: 'site-server' | 'app';
  readings: ReadonlyMap<number, ReturnType<typeof cpuReading>>;
}, _options = {}): ResourceProcess[] {
  const rootName = usages.find((row) => row.pid === rootPid)?.name;
  const daemonPid = rootRole === 'site-server'
    ? usages.find((row) => row.ppid === rootPid && (row.name === rootName || /^node(?:\.exe)?$/i.test(row.name)))?.pid : undefined;
  return usages.map((row) => {
    let role: ResourceProcess['role'] = row.pid === daemonPid ? 'daemon' : 'process';
    if (row.pid === rootPid) role = rootRole;
    return { pid: row.pid, ppid: row.ppid, name: row.name, rssBytes: row.rssBytes, rawRssBytes: row.rawRssBytes, memoryMetric: row.memoryMetric, role,
      cpuPercent: readings.get(row.pid)!.cpuPercent, cpuWarning: readings.get(row.pid)!.cpuWarning };
  });
}

/** The sampler's own probe (`ps`/`top`; PowerShell on Windows) is a fresh direct child of the desktop on every
 * read: not a cost of Tovu, and its always-unmeasured CPU would make the total unavailable forever. O(n). */
function withoutUsageProbe({ usages, desktopPid, platform }: {
  usages: readonly ProcessUsage[]; desktopPid: number; platform: NodeJS.Platform;
}, _options = {}): readonly ProcessUsage[] {
  const probe = platform === 'win32' ? /^powershell(?:\.exe)?$/i : /^(?:ps|top)$/;
  return usages.filter((row) => !(row.ppid === desktopPid && probe.test(row.name)));
}

/** Only this desktop's tree reaches the memory port; foreign roots and the probe never enter its argv. O(n+tree(n)). */
function ownedUsages({ usages, desktopPid, platform }: {
  usages: readonly ProcessUsage[]; desktopPid: number; platform: NodeJS.Platform;
}, _options = {}): readonly ProcessUsage[] {
  const rows = withoutUsageProbe({ usages, desktopPid, platform });
  if (!rows.some(row => row.pid === desktopPid)) return [];
  const tree = rows.map(row => ({ pid: row.pid, ppid: row.ppid, command: '' }));
  const owned = new Set(collectProcessTreePids(tree, [desktopPid]));
  return rows.filter(row => owned.has(row.pid));
}

/** Null is distinct from zero: missing roots and failed samples must not look inexpensive. */
function metrics({ processes, available, warningBytes }: {
  processes: readonly ResourceProcess[]; available: boolean; warningBytes: number;
}, _options = {}): ResourceMetrics {
  const memoryMetric = groupMemoryMetric({ processes });
  if (!available) return { rssBytes: null, memoryMetric, cpuPercent: null, memoryWarning: false, cpuWarning: false };
  const rssBytes = processes.reduce((sum, row) => sum + row.rssBytes, 0);
  return {
    rssBytes, memoryMetric,
    // Every pid must be measured: a new pid has no previous sample, so a partial sum would understate CPU.
    cpuPercent: processes.every((row) => row.cpuPercent !== null)
      ? processes.reduce((sum, row) => sum + row.cpuPercent!, 0) : null,
    memoryWarning: rssBytes >= warningBytes,
    cpuWarning: processes.some((row) => row.cpuWarning),
  };
}

/** Group only descendants of this desktop; each pid contributes to exactly one displayed bucket.
 * Tree walking stays in Jini. One shared sample cycle serves the whole fleet, with no per-site I/O.
 * @complexity O((s+1) * (n + tree(n))) time/O(n+s) space for n processes and s sites;
 * tree(n) is Jini's traversal, including its deterministic PID sort.
 */
function groupSample({ usages, sites, desktopPid, previous, at, totalMemoryBytes, pollIntervalMs }: {
  usages: readonly MemoryUsage[]; sites: readonly OpenResourceSite[]; desktopPid: number;
  previous: PreviousSample; at: number; totalMemoryBytes: number; pollIntervalMs: number;
}, _options = {}): { snapshot: ResourcesSnapshot; history: PreviousSample } {
  const tree = usages.map((row) => ({ pid: row.pid, ppid: row.ppid, command: '' }));
  const available = usages.some((row) => row.pid === desktopPid);
  const rows = usages;
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

/** Open-panel and collapsed-badge poll cadences; Windows gets the longer open-panel interval. O(1). */
function resourcePollIntervals({ platform, panelOpen }: { platform: NodeJS.Platform; panelOpen: boolean }, _options = {}) {
  const panelIntervalMs = platform === 'win32' ? 10_000 : 5_000;
  return { panelIntervalMs, pollIntervalMs: panelOpen ? panelIntervalMs : 60_000 };
}

/** Stable across renderer ordering; only site identity and process replacement invalidate attribution. */
function sitesKeyOf(sites: readonly OpenResourceSite[]): string {
  return sites.map(site => `${site.id}:${site.pid}`).sort().join('|');
}

/** An in-flight read owns the sampler until it settles, even if a site changes meanwhile. */
function shouldSample({ cached, inFlight, sitesKey, sampledSitesKey, now, lastAttempt, retryIntervalMs }: {
  cached: ResourcesSnapshot | undefined; inFlight: Promise<ResourcesSnapshot> | undefined;
  sitesKey: string; sampledSitesKey: string; now: number; lastAttempt: number; retryIntervalMs: number;
}): boolean {
  if (inFlight) return false;
  return !cached || sitesKey !== sampledSitesKey || now - lastAttempt >= retryIntervalMs;
}

/**
 * Main owns request-driven sampling and caches between polls. Concurrent callers share one read;
 * failures clear CPU history and return unavailable without leaking native errors. No timers to leak.
 * @param ports Desktop identity, OS sampler, clock, physical RAM and current owned site handles.
 * @param options Reserved; inject native reads through ports.samplePrivateMemory.
 * @returns get(request, options): resolves a serializable snapshot; never stops a process.
 * @example const monitor = createDesktopResources(ports); await monitor.get({ panelOpen: true });
 * @complexity Per sample O((s+1) * (n + tree(n))) time/O(n+s) space (see groupSample);
 * cached reads compare owned site handles in O(s log s) time/O(s) space.
 * macOS adds at most one top read per 60 s (512 owned PIDs, 5 s timeout, 1 MiB output cap);
 * ps still supplies ownership/CPU/RSS because top's PID/MEM table cannot replace that inventory.
 */
export function createDesktopResources(ports: DesktopResourcesPorts, _options = {}) {
  const samplePrivateMemory: PrivateMemorySampler | undefined = ports.samplePrivateMemory ?? (ports.platform === 'darwin'
    ? input => sampleTopMemory(input) : undefined);
  let lastMemoryAttempt = -Infinity;
  let memory: ProcessPrivateMemory = { metric: 'unavailable', readings: [] };

  /** The Tovu panel refreshes CPU faster than footprint. New PIDs retain labelled RSS until the
   * next minute; disappeared PIDs are evicted, including between native reads. O(p+r) space/time. */
  async function panelMemory({ pids }: { pids: readonly number[] }): Promise<ProcessPrivateMemory> {
    const live = new Set(pids);
    memory = { ...memory, readings: memory.readings.filter(row => live.has(row.pid)) };
    if (ports.now() - lastMemoryAttempt < 60_000) return memory;
    lastMemoryAttempt = ports.now();
    memory = { metric: 'unavailable', readings: [] };
    memory = await samplePrivateMemory!({ pids });
    return memory;
  }

  let previous: PreviousSample = { at: 0, processes: new Map() };
  let cached: ResourcesSnapshot | undefined;
  let inFlight: Promise<ResourcesSnapshot> | undefined;
  let lastAttempt = -Infinity;
  let sampledSitesKey = '';

  /** Inventory failures use Jini's unavailable outcome; memory-source failures retain labelled RSS. */
  async function sample({ pollIntervalMs, sites }: { pollIntervalMs: number; sites: readonly OpenResourceSite[] }, _sampleOptions = {}): Promise<ResourcesSnapshot> {
    let usages: readonly MemoryUsage[];
    try {
      const sampled = await ports.listUsage();
      usages = await readDesktopMemory({ usages: ownedUsages({ usages: sampled, desktopPid: ports.desktopPid, platform: ports.platform }),
        platform: ports.platform, electronMetrics: ports.listElectronMetrics?.() ?? [], samplePrivateMemory: samplePrivateMemory ? panelMemory : undefined });
    } catch { usages = []; }
    const result = groupSample({ usages, sites, desktopPid: ports.desktopPid,
      previous, at: ports.now(), totalMemoryBytes: ports.totalMem(), pollIntervalMs });
    previous = result.history;
    cached = result.snapshot;
    return cached;
  }

  return {
    /** Shared by visible renderers and the single 30 s main maintenance tick. That tick uses
     * panelOpen: true so the collapsed 60 s cache cannot hide sustained site-server memory use. */
    async get({ panelOpen }: ResourcesRequest, _getOptions = {}): Promise<ResourcesSnapshot> {
      const { panelIntervalMs, pollIntervalMs } = resourcePollIntervals({ platform: ports.platform, panelOpen });
      const sites = ports.openSites();
      const sitesKey = sitesKeyOf(sites);
      // A launch-time failure must not strand the badge on a minute-long cached failure.
      const retryIntervalMs = cached?.status === 'unavailable' ? panelIntervalMs : pollIntervalMs;
      // Start/stop/restart changes the attribution, so the old total-only cache cannot serve cards.
      if (shouldSample({ cached, inFlight, sitesKey, sampledSitesKey, now: ports.now(), lastAttempt, retryIntervalMs })) {
        lastAttempt = ports.now();
        sampledSitesKey = sitesKey;
        inFlight = sample({ pollIntervalMs, sites }).finally(() => { inFlight = undefined; });
      }
      const snapshot = inFlight ? await inFlight : cached!;
      return { ...snapshot, pollIntervalMs: snapshot.status === 'unavailable' || sitesKey !== sampledSitesKey ? panelIntervalMs : pollIntervalMs };
    },
  };
}

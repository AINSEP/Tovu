/** Desktop OS adapter for the reviewed batched footprint read; no per-process probes. */
import { execFileBuffered } from '@jini-ai/platform/shell';
import type { ProcessPrivateMemory, ProcessUsage } from '@jini-ai/platform/process';
import { applyElectronMemoryReadings, type ElectronProcessMemory } from '@jini-ai/desktop-host/electron';
import type { MemoryMetric, ResourceProcess } from './contracts/resources.ts';

/** Inject one bulk native read; null/missing/invalid readings keep that process's RSS. */
export type PrivateMemorySampler = (input: { pids: readonly number[] }, options?: object) => Promise<ProcessPrivateMemory>;
/** Usage preserves CPU/parent identity while carrying the selected memory source. */
export type MemoryUsage = ProcessUsage & { memoryMetric: MemoryMetric; rawRssBytes: number };

/** top uses binary K/M/G and may append a change marker. Invalid/unsafe values stay unknown. O(1). */
function topBytes({ text }: { text: string }, _options = {}): number | null {
  const match = /^(\d+(?:\.\d+)?)([BKMG])[+-]?$/.exec(text);
  if (!match) return null;
  const scale: Record<string, number> = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 };
  const bytes = Math.round(Number(match[1]) * scale[match[2]!]!);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

/** Only the requested PID table is trusted; duplicate rows invalidate that PID. O(text length + p) space/time. */
function topReadings({ text, pids }: { text: string; pids: readonly number[] }, _options = {}): ProcessPrivateMemory['readings'] {
  const readings = new Map<number, number | null>();
  const lines = text.split(/\r?\n/);
  const header = lines.findIndex(line => /^\s*PID\s+MEM\s*$/.test(line));
  const table = header < 0 ? [] : lines.slice(header + 1);
  const requested = new Set(pids);
  for (const line of table) {
    const row = /^\s*(\d+)\s+(\S+)\s*$/.exec(line);
    if (!row) continue;
    const pid = Number(row[1]);
    if (requested.has(pid)) readings.set(pid, readings.has(pid) ? null : topBytes({ text: row[2]! }));
  }
  return pids.map(pid => ({ pid, bytes: readings.get(pid) ?? null }));
}

/**
 * Read macOS physical footprint once for all owned PIDs. Failed/oversized probes return null rows.
 * @param input Owned PIDs, deduplicated before invoking top; invalid identities never reach argv.
 * @param options Injectable direct executor; five-second timeout and 1 MiB output bound.
 * @returns One reading per unique requested PID; no native error details leave this adapter.
 * @complexity O(p + output length) time/space; at most one child, at most 512 requested PIDs.
 * @example await sampleTopMemory({ pids: [123, 124] })
 */
export async function sampleTopMemory({ pids }: { pids: readonly number[] }, { run = execFileBuffered }: { run?: typeof execFileBuffered } = {}): Promise<ProcessPrivateMemory> {
  const unique = [...new Set(pids)];
  const unavailable: ProcessPrivateMemory = { metric: 'physical-footprint', readings: unique.map(pid => ({ pid, bytes: null })) };
  if (!unique.length || unique.length > 512 || !unique.every(pid => Number.isSafeInteger(pid) && pid > 0)) return unavailable;
  try {
    const result = await run('/usr/bin/top', ['-l', '1', '-R', '-F', '-stats', 'pid,mem', ...unique.flatMap(pid => ['-pid', String(pid)])],
      { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true });
    if (!result.ok) return unavailable;
    return { metric: 'physical-footprint', readings: topReadings({ text: result.stdout, pids: unique }) };
  } catch { return unavailable; }
}

/** Electron privateBytes is committed memory on Windows. Other hosts keep OS RSS until a native reading succeeds.
 * Invalid Electron readings never replace a usable RSS value. O(p+e) for p usages/e Electron metrics. */
function fallbackMemory({ usages, platform, electronMetrics }: {
  usages: readonly ProcessUsage[]; platform: NodeJS.Platform; electronMetrics: readonly ElectronProcessMemory[];
}, _options = {}): MemoryUsage[] {
  const valid = platform === 'win32' ? electronMetrics.filter(row => validBytes(row.memory.privateBytes)) : [];
  const committed = new Set(valid.map(row => row.pid));
  return applyElectronMemoryReadings({ processes: usages.map(row => ({ ...row, rawRssBytes: row.rssBytes })), electronMetrics: valid }).map(row => ({ ...row,
    memoryMetric: committed.has(row.pid) ? 'committed' : 'rss' }));
}

function validBytes(bytes: number | null | undefined): bytes is number {
  return typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 0;
}

/** Native failure is per-memory-source: preserve the inventory and CPU counters for RSS fallback.
 * @returns New usage rows with explicit source; never mutates the OS rows. O(p+e+r) time/space.
 * @example await readDesktopMemory({ usages, platform: 'darwin', electronMetrics: [], samplePrivateMemory })
 */
export async function readDesktopMemory({ usages, platform, electronMetrics, samplePrivateMemory }: {
  usages: readonly ProcessUsage[]; platform: NodeJS.Platform; electronMetrics: readonly ElectronProcessMemory[];
  samplePrivateMemory?: PrivateMemorySampler;
}, _options = {}): Promise<MemoryUsage[]> {
  const fallback = fallbackMemory({ usages, platform, electronMetrics });
  if (!samplePrivateMemory || !usages.length) return fallback;
  try {
    const native = await samplePrivateMemory({ pids: usages.map(row => row.pid) });
    if (native.metric === 'unavailable') return fallback;
    const metric = native.metric;
    const byPid = new Map(native.readings.map(row => [row.pid, row.bytes]));
    return fallback.map(row => {
      const bytes = byPid.get(row.pid);
      return validBytes(bytes) ? { ...row, rssBytes: bytes, memoryMetric: metric } : row;
    });
  } catch { return fallback; }
}

/** A subtotal must expose fallback even if only one child failed; empty groups default to RSS. O(p) time/O(1) space. */
export function groupMemoryMetric({ processes }: { processes: readonly ResourceProcess[] }, _options = {}): MemoryMetric {
  const sources = new Set(processes.map(row => row.memoryMetric ?? 'rss'));
  if (sources.size < 2) return sources.values().next().value ?? 'rss';
  return sources.has('rss') ? 'mixed-rss' : 'mixed';
}

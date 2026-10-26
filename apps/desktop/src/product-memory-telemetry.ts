/** Tovu labels and consent policy over the existing Resources monitor and Jini growth owner. */
import { aggregateProcessMemory, createMemoryGrowthDetector, type ProcessMemoryReading, type MemoryGrowthWarning } from '@jini-ai/diagnostics';
import type { Tracker } from '@jini-ai/diagnostics/observability';
import type { ProductConsent } from '../../website/src/server/runtime/composition/product-telemetry.ts';
import type { ResourcesSnapshot, ResourceProcess } from './contracts/resources.ts';

type Kind = 'main' | 'renderer' | 'server' | 'daemon' | 'other';
interface ProductMemoryTelemetry { tick(): Promise<void>; dispose(): void }
/** Fixed labels only: executable names, site IDs, paths and local PIDs never enter telemetry. */
function processKind({ row, desktopPid, rendererPids }: { row: ResourceProcess; desktopPid: number; rendererPids: ReadonlySet<number> }, _options = {}): Kind {
  if (row.pid === desktopPid) return 'main';
  if (row.role === 'site-server') return 'server';
  if (row.role === 'daemon') return 'daemon';
  return rendererPids.has(row.pid) ? 'renderer' : 'other';
}

/** Project monitor rows without any native resampling; main heap is available in this process.
 * @returns Local-only identities for growth tracking. @complexity O(p) monitor processes.
 */
export function projectMemoryProcesses({ snapshot, desktopPid, rendererPids, heapUsedBytes }: {
  snapshot: ResourcesSnapshot; desktopPid: number; rendererPids: ReadonlySet<number>; heapUsedBytes: number;
}, _options = {}): ProcessMemoryReading[] {
  return [snapshot.app, ...snapshot.sites].flatMap(group => group.processes).map(row => ({
    id: row.pid, kind: processKind({ row, desktopPid, rendererPids }), rssBytes: row.rssBytes,
    ...(row.pid === desktopPid ? { heapUsedBytes } : {}),
  }));
}

/** Numeric series survive the shared product diagnostic allowlist; no JSON/free-text loophole. */
function warningAttributes({ warning }: { warning: MemoryGrowthWarning }, _options = {}): Record<string, string | number> {
  const attributes: Record<string, string | number> = { process: warning.kind, code: warning.reason };
  const start = warning.series[0]!.at;
  warning.series.forEach((point, index) => {
    attributes[`rss_${index}_mb`] = point.rssMb;
    attributes[`elapsed_${index}_min`] = Math.round((point.at - start) / 60_000);
  });
  return attributes;
}

/** One compact usage event contains totals/counts by kind; release attribution carries app version. */
function memoryProperties({ processes, uptimeSeconds }: { processes: readonly ProcessMemoryReading[]; uptimeSeconds: number }, _options = {}): Record<string, number> {
  const properties: Record<string, number> = { uptimeSeconds: Math.round(uptimeSeconds), processCount: 0 };
  for (const group of aggregateProcessMemory({ processes })) {
    properties.processCount! += group.count;
    properties[`${group.kind}RssMb`] = group.rssMb;
    properties[`${group.kind}Count`] = group.count;
    if (group.heapUsedMb !== undefined) properties[`${group.kind}HeapUsedMb`] = group.heapUsedMb;
  }
  return properties;
}

/** Reuses the exact monitor instance read by Resources IPC. Hidden windows still get a five-minute
 * observation; no sampler/timer exists per window or site. In-flight ticks coalesce and disposal
 * blocks late sends. Consent is checked again after the asynchronous monitor read.
 * @param required Existing monitor, tracker, consent and Electron process-metadata ports.
 * @param options Cadence, clock and scheduling ports; defaults are five minutes and native timers.
 * @returns tick for deterministic tests and dispose for the desktop drain.
 * @complexity O(p*w) bounded by the existing monitor and Jini detector; at most 64 points/process.
 */
export function startProductMemoryTelemetry({ monitor, tracker, readConsent, desktopPid, rendererPids, heapUsedBytes, uptime }: {
  monitor: { get(input: { panelOpen: boolean }): Promise<ResourcesSnapshot> }; tracker: Tracker;
  readConsent: () => ProductConsent; desktopPid: number; rendererPids: () => ReadonlySet<number>;
  heapUsedBytes: () => number; uptime: () => number;
}, { intervalMs = 5 * 60_000, now = Date.now, schedule = (tick, ms) => {
  const timer = setInterval(tick, ms); timer.unref(); return () => clearInterval(timer);
} }: { intervalMs?: number; now?: () => number; schedule?: (tick: () => void, ms: number) => () => void } = {}): ProductMemoryTelemetry {
  const cadenceMs = Math.max(60_000, intervalMs);
  const growth = createMemoryGrowthDetector({ now }, { maxSamples: Math.min(64, Math.ceil(60 * 60_000 / cadenceMs) + 2), maxGapMs: cadenceMs * 2 });
  let disposed = false;
  let pending: Promise<void> | undefined;
  async function sample(): Promise<void> {
    const before = readConsent();
    if (!before.crashes && !before.usage) { growth.reset({}, { keepRateLimits: true }); return; }
    const snapshot = await monitor.get({ panelOpen: false });
    if (disposed || snapshot.status !== 'available') return;
    const processes = projectMemoryProcesses({ snapshot, desktopPid, rendererPids: rendererPids(), heapUsedBytes: heapUsedBytes() });
    const consent = readConsent();
    if (consent.usage) await tracker.capture({ name: 'app_memory_sample', properties: memoryProperties({ processes, uptimeSeconds: uptime() }) });
    if (disposed) return;
    if (!readConsent().crashes) { growth.reset({}, { keepRateLimits: true }); return; }
    for (const warning of growth.observe({ processes })) {
      tracker.error(new Error('process memory growth'), { operation: 'desktop.memory_growth', level: 'warning', attributes: warningAttributes({ warning }) });
    }
  }
  function tick(): Promise<void> {
    if (disposed) return Promise.resolve();
    // Measurement failures are advisory; no rejected background task may become a product error.
    pending ??= sample().catch(() => {}).finally(() => { pending = undefined; });
    return pending;
  }
  const cancel = schedule(() => { void tick(); }, cadenceMs);
  return { tick, dispose() { if (disposed) return; disposed = true; cancel(); growth.reset(); } };
}

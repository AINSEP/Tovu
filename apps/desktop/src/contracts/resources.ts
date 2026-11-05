/** Display-only desktop resource contract. No command lines, credentials or stop-by-pid API. */
export const RUNNER_RESOURCES_GET_CHANNEL = 'runner:resources:get';

/** The renderer polls only while visible: panel open = 5s (Windows 10s), badge only = 60s. */
export interface ResourcesRequest {
  panelOpen: boolean;
}

/** Source of the bytes carried by the historical rssBytes wire field. */
export type MemoryMetric = 'physical-footprint' | 'private-working-set' | 'committed' | 'rss' | 'mixed-rss' | 'mixed';

/** CPU percent uses one core as 100%; null means there is no comparable previous sample. */
export interface ResourceMetrics {
  /** Display estimate: macOS footprint when available, Windows committed bytes for Electron,
   * otherwise RSS. Historical field name retained for IPC compatibility. */
  rssBytes: number | null;
  /** Optional on input for existing IPC clients; new samples always label their source. */
  memoryMetric?: MemoryMetric;
  cpuPercent: number | null;
  memoryWarning: boolean;
  cpuWarning: boolean;
}

/** Executable basename and tree position only; never OS command arguments. */
export interface ResourceProcess {
  pid: number;
  ppid: number;
  name: string;
  role: 'site-server' | 'daemon' | 'app' | 'process';
  rssBytes: number;
  memoryMetric?: MemoryMetric;
  /** Current OS RSS for safety limits and stable telemetry, independent of display sampling. */
  rawRssBytes?: number;
  cpuPercent: number | null;
  cpuWarning: boolean;
}

/** A running site uses SiteRecord.id; null identifies the remaining “Tovu app” bucket. */
export interface ResourceGroup extends ResourceMetrics {
  siteId: string | null;
  processes: readonly ResourceProcess[];
}

/** Unavailable samples carry null metrics, never a misleading zero or previous process rows. */
export interface ResourcesSnapshot {
  status: 'available' | 'unavailable';
  /** Epoch milliseconds at the last attempt; cached replies retain this time. */
  sampledAt: number;
  /** Main's cadence for this request; use it for the next visible-renderer poll. */
  pollIntervalMs: number;
  totalMemoryBytes: number;
  /** UI labels mixed memory estimates as “about”; includes uncollected heap. */
  approximate: true;
  total: ResourceMetrics;
  app: ResourceGroup;
  sites: readonly ResourceGroup[];
}

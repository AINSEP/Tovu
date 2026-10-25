/** Display-only desktop resource contract. No command lines, credentials or stop-by-pid API. */
export const RUNNER_RESOURCES_GET_CHANNEL = 'runner:resources:get';

/** The renderer polls only while visible: panel open = 5s (Windows 10s), badge only = 60s. */
export interface ResourcesRequest {
  panelOpen: boolean;
}

/** CPU percent uses one core as 100%; null means there is no comparable previous sample. */
export interface ResourceMetrics {
  /** Summed RSS is approximate because shared pages may be counted more than once. */
  rssBytes: number | null;
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
  /** UI labels summed RSS as “about”; the boolean makes that requirement explicit. */
  approximate: true;
  total: ResourceMetrics;
  app: ResourceGroup;
  sites: readonly ResourceGroup[];
}

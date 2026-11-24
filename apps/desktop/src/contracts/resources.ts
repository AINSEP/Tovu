/** Display-only desktop resource contract. No command lines, credentials or stop-by-pid API. */
import type { MemoryMetric, ResourceProcess } from '@jini-ai/core/contracts/site/contracts-resources';
export const RUNNER_RESOURCES_GET_CHANNEL = 'runner:resources:get';

/** The renderer polls only while visible: panel open = 5s (Windows 10s), badge only = 60s. */
export interface ResourcesRequest {
  panelOpen: boolean;
}

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

import type { AdminExportRunSnapshot } from "@/lib/api";

/**
 * @file What `useStaticExport` needs from the outside world, as an interface rather than a direct
 * `lib/api` import — same shape as `deployment-overview-port.hooks.ts`/`dockerfile-source-port.hooks.ts`
 * in this directory.
 */
export interface StaticExportPort {
  /** Starts a new export run and resolves with the just-started `"running"` snapshot (or, if this
   *  is the actual write and the server refuses it outright — e.g. malformed options — a rejection).
   *  A `409` while a run is already in flight also surfaces as a rejection; see `use-static-export
   *  .hooks.ts`'s own handling of that case. */
  triggerSiteExport(options?: { clean?: boolean }): Promise<AdminExportRunSnapshot>;
  /** The current/most recent run's status — polled while `status === "running"`. */
  getSiteExportStatus(): Promise<AdminExportRunSnapshot>;
}

import type { AdminPublishRunSnapshot, AdminStaticPublishConfig, AdminStaticPublishPreview } from "@/lib/api";

/**
 * @file What `useStaticPublish` needs from the outside world, as an interface rather than a direct
 * `lib/api` import — same shape as `static-export-port.hooks.ts` in this directory.
 */
export interface StaticPublishPort {
  /** Pure read: validates `config`, reports the base path a real publish would use, and whether a
   *  credential is configured — never starts a run. */
  getPublishPreview(config: AdminStaticPublishConfig): Promise<AdminStaticPublishPreview>;
  /** Starts a new publish and resolves with the just-started `"running"` snapshot. A `409` while a
   *  run is already in flight surfaces as a rejection, same as `StaticExportPort.triggerSiteExport`.
   *
   *  `credentialId` is the saved connection the operator chose — see `api.ts`'s `triggerPublish` for
   *  why the server needs it named rather than resolving the current default itself. */
  triggerPublish(input: { config: AdminStaticPublishConfig; projectName: string; credentialId?: string }): Promise<AdminPublishRunSnapshot>;
  /** The current/most recent publish run's status — polled while `status === "running"`. */
  getPublishStatus(): Promise<AdminPublishRunSnapshot>;
}

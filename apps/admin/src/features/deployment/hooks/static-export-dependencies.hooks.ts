import { api, type AdminExportRunSnapshot } from "../../../lib/api";
import type { StaticExportPort } from "./static-export-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `deployment-overview-dependencies.hooks.ts`'s `defaultDeploymentOverviewPort`. */
export const defaultStaticExportPort: StaticExportPort = {
  triggerSiteExport: (options) => api.triggerSiteExport(options),
  getSiteExportStatus: () => api.getSiteExportStatus(),
};

/** An in-memory {@link StaticExportPort} for tests. `status` seeds the poll's answer; both calls
 *  default to resolving it (or calling it as a function, for a caller that wants a fresh value per
 *  call — e.g. simulating a run that finishes on its second poll) and can be overridden
 *  independently for a test that needs the trigger and the poll to diverge (e.g. a trigger that
 *  starts a run whose FIRST poll already reports it finished). */
export function createFakeStaticExportPort(
  status: AdminExportRunSnapshot | (() => Promise<AdminExportRunSnapshot>),
  options: {
    triggerSiteExport?: (opts?: { clean?: boolean }) => Promise<AdminExportRunSnapshot>;
    getSiteExportStatus?: () => Promise<AdminExportRunSnapshot>;
  } = {}
): StaticExportPort {
  const resolve = () => (typeof status === "function" ? status() : Promise.resolve(status));
  return {
    triggerSiteExport: options.triggerSiteExport ?? (() => resolve()),
    getSiteExportStatus: options.getSiteExportStatus ?? (() => resolve()),
  };
}

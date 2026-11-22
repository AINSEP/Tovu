import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import type { AdminExportRunSnapshot } from "./import-export-api.types";

/** The admin API calls of the import-export feature. */
export const importExportApi = {
  // Static Site tab (`apps/website/src/server/inbound/admin-http/routes/system/export-site.ts`) — trigger + poll, not a
  // single synchronous call: a real export can take seconds to minutes, so `triggerSiteExport`
  // returns the moment the run STARTS (202) and a caller polls `getSiteExportStatus` for the
  // outcome. `system.export`-gated on trigger (writes to disk), `system.read` on the poll.
  /** Starts a new static-site export. `409` (surfaced as a thrown error by `request`, same as any
   *  non-2xx) if one is already running — this instance runs at most one export at a time. */
  triggerSiteExport: (options?: { clean?: boolean; basePath?: string }) =>
    request<AdminExportRunSnapshot>({ path: `/workspaces/${WORKSPACE_ID}/system/export` }, { init: {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    } }),
  /** The current/most recent export run's status — poll this after `triggerSiteExport` until
   *  `status` is no longer `"running"`. */
  getSiteExportStatus: () => request<AdminExportRunSnapshot>({ path: `/workspaces/${WORKSPACE_ID}/system/export` }),
};

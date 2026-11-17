/** Mirrors `ExportRunStatus` in `apps/website/src/server/inbound/admin-http/routes/system/export-site.ts`. */
export type AdminExportRunStatus = "idle" | "running" | "completed" | "errored";

/** Mirrors `ExportRunSnapshot` in `apps/website/src/server/inbound/admin-http/routes/system/export-site.ts` — see that
 *  type's own doc comments for why it is a slim, JSON-safe summary rather than the full
 *  `ExportReport` (no route/asset bytes ever cross this boundary). */
export interface AdminExportRunSnapshot {
  status: AdminExportRunStatus;
  startedAtIso: string | null;
  finishedAtIso: string | null;
  outputDir: string | null;
  basePath?: string;
  ok?: boolean;
  counts?: { routesSucceeded: number; routesFailed: number; assetsSucceeded: number; assetsFailed: number };
  failedRoutes?: { path: string; kind: string; reason: string }[];
  failedAssets?: { url: string; reason: string }[];
  skippedManifestEntries?: { reason: string; detail: string }[];
  unreferencedThemeFiles?: string[];
  basePathRewriteWarning?: string;
  error?: string;
}

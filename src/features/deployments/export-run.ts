import path from "node:path";

import { exportSite, type ExportReport, type ExportSiteOptions } from "#src/export/index";

/**
 * @file The static-site export run's process-local single-flight state, extracted out of
 * `server/routes/admin/system/export-site.ts` (2026-08-15) so a SECOND caller — the
 * `deployment_trigger_export`/`deployment_get_export_status` agent tools
 * (`tool-registrations.ts` in this same directory) — can trigger and poll the exact same run the
 * admin UI's Deployment panel already does, instead of reimplementing it against a second,
 * independent `currentRun` slot.
 *
 * Ownership moved here rather than staying in the route file for the reason every other
 * `features/<domain>/tool-registrations.ts` in this codebase already establishes (see
 * `features/recovery/tool-registrations.ts`'s file header): a domain's `tool-registrations.ts`
 * must never import from `src/server/**` — doing so is exactly the "back-edge into the composition
 * root" `development/scripts/check-architecture.ts` measures. `startExportRun`'s own `routeDeps`
 * parameter type is deliberately derived from `ExportSiteOptions["routeDeps"]` (a type-level
 * extraction) rather than a named `import type { RouteDeps } from "#src/server/routes/types"` — the
 * two are exactly the same type, but only the second would create that edge. `server/routes/admin/
 * system/export-site.ts` now imports FROM this file instead (the normal, encouraged
 * server-depends-on-features direction), and re-exports these types/functions for its own route
 * handlers to call.
 *
 * DISCLOSED CROSS-PROCESS GAP: this module's `currentRun` is a plain in-memory module variable, so
 * it is single-flight-correct only WITHIN one OS process. Tovu's admin HTTP server and the
 * standalone agent daemon (`assistant/agent-daemon-server.ts`, "a separate OS process from Tovu's
 * own server" per its own file header) each load their own independent copy of this module when
 * `buildDeploymentsRegistrations` is wired into them — there is no cross-process lock. A human
 * clicking "Export" in the admin UI at the same moment an agent (running through the daemon)
 * calls `deployment_trigger_export` could therefore both observe "not running" and both start
 * writing into the same `outputDir` concurrently. This is the same class of caveat
 * `agent-daemon-server.ts`'s own header already discloses for `TOVU_DB=memory` ("writes would not
 * be visible from Tovu's main process") — disclosed here rather than silently assumed away. Closing
 * it for real needs either a cross-process lock (e.g. a lockfile under `outputDir`) or routing the
 * daemon's trigger back over HTTP to the main process, both out of scope for this wiring pass. The
 * BYOK execution mode (`server/modules/assistant-byok.ts`, which composes the SAME tool catalog
 * in-process inside the main server) is unaffected — it shares this exact module instance with the
 * HTTP route, so single-flight holds there.
 */

export type ExportRunStatus = "idle" | "running" | "completed" | "errored";

export interface ExportRunCounts {
  routesSucceeded: number;
  routesFailed: number;
  assetsSucceeded: number;
  assetsFailed: number;
}

/**
 * The full-fidelity, JSON-transportable status of the current/most recent export run. Moved
 * verbatim from `export-site.ts` — see that file's history for the original "why narrower than
 * `ExportReport`" rationale (peak-memory bytes are never echoed back; only counts plus full failure
 * detail).
 */
export interface ExportRunSnapshot {
  status: ExportRunStatus;
  startedAtIso: string | null;
  finishedAtIso: string | null;
  outputDir: string | null;
  /** Present only once `status` is `"completed"`. */
  basePath?: string;
  /** Present only once `status` is `"completed"`. Mirrors `cli/commands/export.ts`'s own
   *  completeness definition: only a failed ROUTE flips this false; asset failures are still
   *  reported in full via `failedAssets` but never flip `ok`. */
  ok?: boolean;
  counts?: ExportRunCounts;
  failedRoutes?: { path: string; kind: string; reason: string }[];
  failedAssets?: { url: string; reason: string }[];
  skippedManifestEntries?: { reason: string; detail: string }[];
  unreferencedThemeFiles?: string[];
  basePathRewriteWarning?: string;
  /** Present only when `status` is `"errored"` — always a message, never the raw error object. */
  error?: string;
}

const IDLE_RUN: ExportRunSnapshot = { status: "idle", startedAtIso: null, finishedAtIso: null, outputDir: null };

/** Process-local mutable slot — see this file's header for exactly which callers share ONE
 *  instance of it and which do not. */
let currentRun: ExportRunSnapshot = IDLE_RUN;

/** `TOVU_EXPORT_DIR` env, then `<cwd>/infra/export` — moved verbatim from `export-site.ts`; see
 *  that file's own prior header for the full precedence rationale (`--out` is CLI-only, not a
 *  caller-supplied field here either, by either an HTTP body or a tool `input`). */
function resolveExportOutputDir(): string {
  if (process.env.TOVU_EXPORT_DIR !== undefined) return path.resolve(process.env.TOVU_EXPORT_DIR);
  return path.resolve(process.cwd(), "infra", "export");
}

/** Slims a full `ExportReport` down to `ExportRunSnapshot`'s "completed" fields — moved verbatim
 *  from `export-site.ts`. */
function summarizeCompletedReport(report: ExportReport): Pick<
  ExportRunSnapshot,
  "basePath" | "ok" | "counts" | "failedRoutes" | "failedAssets" | "skippedManifestEntries" | "unreferencedThemeFiles" | "basePathRewriteWarning"
> {
  return {
    ...(report.basePath !== undefined ? { basePath: report.basePath } : {}),
    ok: report.routes.failed.length === 0,
    counts: {
      routesSucceeded: report.routes.succeeded.length,
      routesFailed: report.routes.failed.length,
      assetsSucceeded: report.assets.succeeded.length,
      assetsFailed: report.assets.failed.length,
    },
    failedRoutes: report.routes.failed.map((f) => ({ path: f.path, kind: f.kind, reason: f.reason })),
    failedAssets: report.assets.failed.map((f) => ({ url: f.url, reason: f.reason })),
    skippedManifestEntries: report.skippedManifestEntries,
    unreferencedThemeFiles: report.unreferencedThemeFiles,
    ...(report.basePathRewriteWarning !== undefined ? { basePathRewriteWarning: report.basePathRewriteWarning } : {}),
  };
}

/**
 * The current/most recent export run's status, exactly as the HTTP status-poll route reports it.
 *
 * @returns `IDLE_RUN` if no run has ever started in this process.
 * @complexity O(1).
 */
export function getExportRunSnapshot(): ExportRunSnapshot {
  return currentRun;
}

/**
 * Starts a new export run unconditionally and returns the "running" snapshot immediately — the
 * export itself continues in the background (see this file's header: "seconds to minutes").
 *
 * Caller contract: the caller must have already confirmed `getExportRunSnapshot().status !==
 * "running"` in the SAME synchronous stretch of the event loop, with no `await` in between (both
 * `export-site.ts`'s POST handler and `tool-registrations.ts`'s `deployment_trigger_export` handler
 * do exactly this) — that is what makes "one export at a time" hold even under two concurrent
 * callers in the same process. This function does not re-check, so calling it while a run is
 * already in flight would silently start a second one; it is deliberately not the guard itself.
 *
 * @param routeDeps - The same full composition-root deps object `createApp`/`exportSite` need to
 * boot an in-process copy of the app. Typed via `ExportSiteOptions["routeDeps"]` rather than a
 * named `RouteDeps` import — see this file's header for why.
 * @param options.clean - Forwarded to `exportSite`; wipes `outputDir` first when `true`.
 * @param options.basePath - Forwarded to `exportSite`; see `ExportSiteOptions.basePath`'s own doc.
 * @returns The new "running" snapshot (not a promise — the export's own completion is observed
 * later via {@link getExportRunSnapshot}).
 * @complexity O(1) synchronously; the awaited export itself is O(routes + assets) over HTTP, per
 * `site-exporter.ts`'s own complexity note.
 */
export function startExportRun(
  routeDeps: ExportSiteOptions["routeDeps"],
  options: { clean: boolean; basePath?: string },
): ExportRunSnapshot {
  const outputDir = resolveExportOutputDir();
  const startedAtIso = routeDeps.clock.nowIso();
  currentRun = { status: "running", startedAtIso, finishedAtIso: null, outputDir };

  // Deliberately not awaited — the caller (an HTTP route or a tool handler) returns the "running"
  // snapshot immediately; a later poll observes the outcome via getExportRunSnapshot(). Both
  // branches always update currentRun, so a poller can never observe a stale "running" snapshot
  // after the promise has actually settled.
  void exportSite({ routeDeps, outputDir, clean: options.clean, basePath: options.basePath })
    .then((report) => {
      currentRun = {
        status: "completed",
        startedAtIso,
        finishedAtIso: routeDeps.clock.nowIso(),
        outputDir,
        ...summarizeCompletedReport(report),
      };
    })
    .catch((err: unknown) => {
      currentRun = {
        status: "errored",
        startedAtIso,
        finishedAtIso: routeDeps.clock.nowIso(),
        outputDir,
        error: err instanceof Error ? err.message : String(err),
      };
    });

  return currentRun;
}

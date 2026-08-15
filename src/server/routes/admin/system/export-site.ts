import path from "node:path";

import type { Express } from "express";

import { exportSite, type ExportReport } from "#src/export/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin Deployment panel → Static Site tab backend.
 *
 * Registers TWO routes wrapping `src/export/site-exporter.ts`'s `exportSite` — the same engine
 * `tovu export` already drives, in-process, never shelled out to (a route running inside this same
 * process can call it directly; `exportSite` boots its OWN short-lived HTTP listener on port 0 to
 * fetch every route, so there is no self-request deadlock).
 *
 * TRIGGER + STATUS, not a synchronous request/response: a real export is
 * "seconds to minutes" (this feature's own build-session findings doc) — one HTTP request per
 * route/asset, serially, by design (`site-exporter.ts`'s own complexity note: fidelity over
 * throughput). Holding a single HTTP connection open for that whole span is the wrong shape for a
 * single-container product with no separate worker process to hand it to, and a hard client-side
 * timeout would just turn an in-progress export into an orphaned background write with no way to
 * learn its outcome. So `POST .../system/export` starts the run and returns `202` immediately with
 * a snapshot; `GET .../system/export` polls the same snapshot. A single process-local mutable slot
 * (mirrors `readiness-state.ts`'s exact "process-local holder" shape) rather than a job table: this
 * composition root serves exactly one workspace per process (`RouteDeps.workspaceId` is a single
 * value, not a repo — every route in this codebase already assumes that), so "one export at a
 * time" is the correct concurrency model, not an arbitrary limitation. A second trigger while one
 * is running gets `409`, never a silently queued or silently dropped request.
 *
 * `system.export`-gated for the trigger, distinct from the `system.read` the status poll and every
 * other route in this directory use — triggering writes a folder of files to disk, which is not a
 * read, the same reasoning that gives `database.migrate`/`backup.restore`/`theme.set` their own
 * write-class permission strings instead of reusing a `*.read` grant.
 *
 * `--out`/`--workspace` are NOT client-controllable fields on the request body: `resolveOutputDir`
 * below reproduces `cli/commands/export.ts`'s `TOVU_EXPORT_DIR` env-then-default precedence (its
 * own `resolveExportOutputDir` is private to that file and does not export `--out`'s CLI-only half
 * of the precedence chain here) rather than accepting a caller-supplied path — the brief's own
 * instruction ("do not invent a new location") doubles as a path-injection guard: nothing here ever
 * builds a filesystem path out of request input.
 */
export type AdminExportSiteDeps = RouteDeps;

export type ExportRunStatus = "idle" | "running" | "completed" | "errored";

export interface ExportRunCounts {
  routesSucceeded: number;
  routesFailed: number;
  assetsSucceeded: number;
  assetsFailed: number;
}

/**
 * The full-fidelity, JSON-transportable status of the current/most recent export run.
 *
 * Deliberately narrower than `ExportReport`: `ExportedRoute.data`/`ExportedAsset.data` carry the
 * exact bytes written (per that interface's own doc, "peak memory now includes every exported
 * route's full body simultaneously") — echoing those back over this status endpoint would mean
 * serializing a whole site's HTML/asset bytes into a JSON response on every poll. This snapshot
 * keeps only what an operator needs to judge the run: counts, and full detail for every FAILURE
 * (small, and the whole point — see this file's header on never collapsing partial failure to
 * "ok").
 */
export interface ExportRunSnapshot {
  status: ExportRunStatus;
  startedAtIso: string | null;
  finishedAtIso: string | null;
  outputDir: string | null;
  /** Present only once `status` is `"completed"` — the normalized value `exportSite` actually
   *  rewrote for, or absent when no base path was requested (mirrors `ExportReport.basePath`). */
  basePath?: string;
  /** Present only once `status` is `"completed"`. `ok` mirrors `cli/commands/export.ts`'s own
   *  completeness definition exactly (`report.routes.failed.length > 0` is the ONLY condition that
   *  makes the CLI exit non-zero) — asset failures are still reported in full via `failedAssets`,
   *  but do not flip `ok`, for parity with the one existing caller's own honesty contract rather
   *  than inventing a stricter one here. */
  ok?: boolean;
  counts?: ExportRunCounts;
  failedRoutes?: { path: string; kind: string; reason: string }[];
  failedAssets?: { url: string; reason: string }[];
  skippedManifestEntries?: { reason: string; detail: string }[];
  unreferencedThemeFiles?: string[];
  basePathRewriteWarning?: string;
  /** Present only when `status` is `"errored"` — `exportSite` itself rejected (e.g.
   *  `ExportOutputNotEmptyError`, or an unexpected error booting the in-process app) rather than
   *  completing with some failed routes/assets. Always a message, never the raw error object — this
   *  crosses an HTTP boundary. */
  error?: string;
}

const IDLE_RUN: ExportRunSnapshot = { status: "idle", startedAtIso: null, finishedAtIso: null, outputDir: null };

/** Process-local mutable slot — see this file's header for why a single slot is the correct
 *  concurrency model here, not a simplification taken for lack of time. */
let currentRun: ExportRunSnapshot = IDLE_RUN;

/** `TOVU_EXPORT_DIR` env, then `<cwd>/infra/export` — the same two of `cli/commands/export.ts`'s
 *  three-way `resolveExportOutputDir` precedence that make sense over HTTP (`--out` is a CLI flag,
 *  not a request field — see this file's header). Kept in sync with that function's own doc: same
 *  `infra/` Docker-volume reasoning, same default. */
function resolveExportOutputDir(): string {
  if (process.env.TOVU_EXPORT_DIR !== undefined) return path.resolve(process.env.TOVU_EXPORT_DIR);
  return path.resolve(process.cwd(), "infra", "export");
}

/** Slims a full `ExportReport` down to `ExportRunSnapshot`'s "completed" fields — see that
 *  interface's own doc for why `data`/full succeeded-lists are dropped. */
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

/** Validates the trigger request's optional JSON body. Never throws — every malformed shape maps
 *  to a `{ error }` result the route turns into a `400`, per secure-input-handling discipline for
 *  a request body this route hands straight into a filesystem-writing operation's options. */
function parseTriggerRequestBody(body: unknown): { ok: true; clean: boolean; basePath?: string } | { ok: false; error: string } {
  if (body === undefined || body === null) return { ok: true, clean: false };
  if (typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "request body must be a JSON object" };

  const raw = body as Record<string, unknown>;
  if ("clean" in raw && raw.clean !== undefined && typeof raw.clean !== "boolean") {
    return { ok: false, error: "'clean' must be a boolean" };
  }
  if ("basePath" in raw && raw.basePath !== undefined && typeof raw.basePath !== "string") {
    return { ok: false, error: "'basePath' must be a string" };
  }

  return {
    ok: true,
    clean: raw.clean === true,
    ...(typeof raw.basePath === "string" && raw.basePath.trim() !== "" ? { basePath: raw.basePath } : {}),
  };
}

export function registerAdminExportSiteRoutes(app: Express, deps: AdminExportSiteDeps): void {
  app.post("/api/admin/v1/workspaces/:workspaceId/system/export", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const principal = getAuthedPrincipal(res);
    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: "system.export",
      workspaceId: deps.workspaceId,
      entityType: "site-export",
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for 'system.export' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: "system.export", reason: authResult.reason },
      });
      return;
    }

    // No `await` between this check and setting `currentRun` below — this whole block runs as one
    // synchronous stretch of the event loop, so two concurrent POSTs cannot both observe "idle".
    if (currentRun.status === "running") {
      res.status(409).json({ error: "an export is already running", run: currentRun });
      return;
    }

    const parsedBody = parseTriggerRequestBody(req.body);
    if (!parsedBody.ok) {
      res.status(400).json({ error: parsedBody.error });
      return;
    }

    const outputDir = resolveExportOutputDir();
    const startedAtIso = deps.clock.nowIso();
    currentRun = { status: "running", startedAtIso, finishedAtIso: null, outputDir };

    // Deliberately not awaited — see this file's header for why the response returns before the
    // export finishes. Both branches always update `currentRun`, so a poller can never observe a
    // stale "running" snapshot after the promise has actually settled.
    void exportSite({ routeDeps: deps, outputDir, clean: parsedBody.clean, basePath: parsedBody.basePath })
      .then((report) => {
        currentRun = {
          status: "completed",
          startedAtIso,
          finishedAtIso: deps.clock.nowIso(),
          outputDir,
          ...summarizeCompletedReport(report),
        };
      })
      .catch((err: unknown) => {
        currentRun = {
          status: "errored",
          startedAtIso,
          finishedAtIso: deps.clock.nowIso(),
          outputDir,
          error: err instanceof Error ? err.message : String(err),
        };
      });

    res.status(202).json(currentRun);
  });

  app.get("/api/admin/v1/workspaces/:workspaceId/system/export", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const principal = getAuthedPrincipal(res);
    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: "system.read",
      workspaceId: deps.workspaceId,
      entityType: "site-export",
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for 'system.read' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: "system.read", reason: authResult.reason },
      });
      return;
    }

    res.status(200).json(currentRun);
  });
}

import type { Express } from "express";

import {
  getExportRunSnapshot,
  startExportRun,
  type ExportRunCounts,
  type ExportRunSnapshot,
  type ExportRunStatus,
} from "#src/features/deployments/export-run";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

export type { ExportRunCounts, ExportRunSnapshot, ExportRunStatus };

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
 * `--out`/`--workspace` are NOT client-controllable fields on the request body: `export-run.ts`'s
 * `resolveExportOutputDir` reproduces `cli/commands/export.ts`'s `TOVU_EXPORT_DIR` env-then-default
 * precedence (its own `resolveExportOutputDir` is private to that file and does not export
 * `--out`'s CLI-only half of the precedence chain here) rather than accepting a caller-supplied
 * path — the brief's own instruction ("do not invent a new location") doubles as a path-injection
 * guard: nothing here ever builds a filesystem path out of request input.
 *
 * 2026-08-15: the process-local run state, `resolveExportOutputDir`, and the actual `exportSite`
 * call moved out to `features/deployments/export-run.ts` — this file now only translates HTTP
 * request/response shape around `startExportRun`/`getExportRunSnapshot`. The move exists so the new
 * `deployment_trigger_export`/`deployment_get_export_status` agent tools (`features/deployments/
 * tool-registrations.ts`) can trigger and poll the SAME run this route does — the assistant's own
 * `tool-registrations.ts` files may never import from `src/server/**` (see that file's header for
 * the full reasoning and the one disclosed gap: the standalone agent daemon process does not share
 * this process's in-memory run state).
 */
export type AdminExportSiteDeps = RouteDeps;

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

    // No `await` between this check and `startExportRun` below — this whole block runs as one
    // synchronous stretch of the event loop, so two concurrent POSTs cannot both observe "idle".
    // `deployment_trigger_export` (`features/deployments/tool-registrations.ts`) follows the
    // identical no-await-in-between shape against the same `getExportRunSnapshot`/`startExportRun`
    // pair, sharing this exact single-flight guarantee whenever it runs in this same process (see
    // `export-run.ts`'s file header for the one case where it does not: a separate OS process).
    if (getExportRunSnapshot().status === "running") {
      res.status(409).json({ error: "an export is already running", run: getExportRunSnapshot() });
      return;
    }

    const parsedBody = parseTriggerRequestBody(req.body);
    if (!parsedBody.ok) {
      res.status(400).json({ error: parsedBody.error });
      return;
    }

    const snapshot = startExportRun(deps, deps.runExportSite, { clean: parsedBody.clean, basePath: parsedBody.basePath });
    res.status(202).json(snapshot);
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

    res.status(200).json(getExportRunSnapshot());
  });
}

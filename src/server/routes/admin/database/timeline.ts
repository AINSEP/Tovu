import type { Express, Response } from "express";

import { getTimeline } from "#src/features/database/timeline";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { DatabaseRecoveryRouteDeps } from "../database-recovery/deps.js";

/** A query field, read as a string if present, or `undefined`.
 *  @complexity O(1). */
function readOptionalQueryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** This route's six filter fields, read off `req.query` in one place.
 *  @complexity O(1). */
function parseTimelineFilter(query: Record<string, unknown>) {
  return {
    kind: readOptionalQueryString(query.kind),
    outcome: readOptionalQueryString(query.outcome),
    fromDate: readOptionalQueryString(query.fromDate),
    toDate: readOptionalQueryString(query.toDate),
    cursor: readOptionalQueryString(query.cursor),
    limit: typeof query.limit === "string" ? Number(query.limit) : undefined,
  };
}

/** Maps `getTimeline`'s thrown errors onto the admin error envelope — a `TimelineValidationError`
 *  (matched by `name` since it isn't an exported class here) is a 400, everything else a 500.
 *  @complexity O(1). */
function sendTimelineError(res: Response, err: unknown): void {
  const isValidationError = err instanceof Error && err.name === "TimelineValidationError";
  const message = err instanceof Error ? err.message : "internal error";
  res.status(isValidationError ? 400 : 500).json({
    error: message,
    code: isValidationError ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
  });
}

/**
 * @file SPEC-017 C-101 / REQ-01 / REQ-04 — `GET /api/admin/v1/database/timeline` (ADR-041 §1's
 * read-first Timeline). Gated by `database.read` (ADR-041 §6's permission catalog).
 *
 * The first (and, for this dispatch, only) Database/Recovery admin route wired end-to-end against
 * a real adapter (`SqliteDatabaseLedgerRepo`, `server/deps.ts`) — demonstrates the sidecar journal
 * is genuinely reachable over HTTP, following the exact pattern
 * `routes/admin/redirects/list.ts` already established. The remaining Database/Recovery API
 * surface (migrate-forward plan/confirm/execute, restore-point creation, the restore ceremony,
 * the Tier-3 browser) stays unwired — that is the admin-UI-adjacent backend work item B in
 * `todos.md` anticipates, not this slice's scope (see the progress ledger's Session 4 entry).
 */
export function registerAdminDatabaseTimelineRoute(app: Express, deps: DatabaseRecoveryRouteDeps): void {
  app.get("/api/admin/v1/database/timeline", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "database.read",
        workspaceId: deps.workspaceId,
        entityType: "database-ledger",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'database.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "database.read", reason: authResult.reason },
        });
        return;
      }

      const result = await getTimeline({
        ledger: deps.databaseLedgerRepo,
        filter: parseTimelineFilter(req.query as Record<string, unknown>),
      });

      res.json(result);
    } catch (err) {
      sendTimelineError(res, err);
    }
  });
}

import type { Express } from "express";

import { getTimeline } from "#src/features/database/timeline";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { DatabaseRecoveryRouteDeps } from "../database-recovery/deps.js";

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

      const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
      const outcome = typeof req.query.outcome === "string" ? req.query.outcome : undefined;
      const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
      const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

      const result = await getTimeline({
        ledger: deps.databaseLedgerRepo,
        filter: { kind, outcome, fromDate, toDate, cursor, limit },
      });

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      res.status(err instanceof Error && err.name === "TimelineValidationError" ? 400 : 500).json({
        error: message,
        code: err instanceof Error && err.name === "TimelineValidationError" ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
      });
    }
  });
}

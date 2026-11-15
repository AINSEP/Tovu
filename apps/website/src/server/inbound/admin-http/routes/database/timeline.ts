import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { ToolInputError } from "@jini-ai/core";
import type { Express, Response } from "express";

import { getTimeline } from "#src/features/database/timeline";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { DatabaseRecoveryRouteDeps } from "../database-recovery/deps.js";

/** A query field, read as a string if present, or `undefined`.
 *  @complexity O(1). */
function readOptionalQueryString({ value }: { value: unknown }, _optional = {}): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** This route's six filter fields, read off `req.query` in one place.
 *  @complexity O(1). */
function parseTimelineFilter(query: Record<string, unknown>) {
  return {
    kind: readOptionalQueryString({ value: query.kind }),
    outcome: readOptionalQueryString({ value: query.outcome }),
    fromDate: readOptionalQueryString({ value: query.fromDate }),
    toDate: readOptionalQueryString({ value: query.toDate }),
    cursor: readOptionalQueryString({ value: query.cursor }),
    limit: typeof query.limit === "string" ? Number(query.limit) : undefined,
  };
}

/** Maps `getTimeline`'s thrown errors onto the admin error envelope — a `TimelineValidationError`
 *  (matched by `name` since it isn't an exported class here) or the ledger's `ToolInputError` (an
 *  undecodable cursor) is a 400, everything else a 500.
 *  @complexity O(1). */
function sendTimelineError({ res, err }: { res: Response; err: unknown }, _optional = {}): void {
  const isValidationError = err instanceof ToolInputError || (err instanceof Error && err.name === "TimelineValidationError");
  if (!isValidationError) { sendAdminFailure({ res, error: err }); return; }
  const message = err instanceof Error ? err.message : "Invalid timeline query.";
  res.status(400).json({
    error: message,
    code: isValidationError ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
  });
}

/**
 * @file SPEC-017 C-101 / REQ-01 / REQ-04 — `GET /api/admin/v1/database/timeline` (ADR-041 §1's
 * read-first Timeline). Gated by `database.read` (ADR-041 §6's permission catalog).
 *
 * The first (and, for this dispatch, only) Database/Recovery admin route wired end-to-end against
 * a real adapter (`SqliteDatabaseLedgerRepo`, `apps/website/src/server/runtime/composition/deps.ts`) — demonstrates the sidecar journal
 * is genuinely reachable over HTTP, following the exact pattern
 * `apps/website/src/server/inbound/admin-http/routes/redirects/list.ts` already established. The remaining Database/Recovery API
 * surface (migrate-forward plan/confirm/execute, restore-point creation, the restore ceremony,
 * the Tier-3 browser) stays unwired — that is the admin-UI-adjacent backend work item B in
 * `todos.md` anticipates, not this slice's scope (see the progress ledger's Session 4 entry).
 */
export function registerAdminDatabaseTimelineRoute(app: Express, deps: DatabaseRecoveryRouteDeps): void {
  app.get("/api/admin/v1/database/timeline", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "database.read", workspaceId: deps.workspaceId, entityType: "database-ledger" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const result = await getTimeline({
        ledger: deps.databaseLedgerRepo,
        filter: parseTimelineFilter(req.query as Record<string, unknown>),
      });

      res.json(result);
    } catch (err) {
      sendTimelineError({ res, err });
    }
  });
}

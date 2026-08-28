import type { Express } from "express";

import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { DatabaseRecoveryRouteDeps } from "../database-recovery/deps.js";

/**
 * @file ADR-041 §3 — `GET /api/admin/v1/database/schema-state` (this site's drift classification:
 * its persisted `.site-meta.json` schema stamp versus the runtime's applied `__drizzle_migrations`
 * lineage). Gated by `database.read` (ADR-041 §6's permission catalog), matching `timeline.ts`'s
 * and `restore-points.ts`'s list route exactly.
 *
 * WHY THIS ROUTE EXISTS: `db/drift.ts`'s `getDriftStatus` and its `SqliteDatabaseIntrospection
 * Adapter` caller have both been built and correct for some time, but the only thing that ever
 * called them was the `database_get_schema_state` AGENT tool
 * (`features/database/tool-registrations.ts`). A site owner whose database had diverged onto a
 * different migration lineage had no admin surface that would ever tell them — the Database
 * screen's own file header recorded the drift banner as having "no route yet", and this closes
 * exactly that gap. It is the read half only: nothing here migrates, repairs, or reconciles
 * anything. `migrate-forward.ts`'s plan/confirm/execute ceremony remains the only write path, and
 * it keeps its own independent preflight.
 *
 * PASSTHROUGH, DELIBERATELY: the response body is `SchemaStateSummary` verbatim —
 * `{ status, siteMeta, runtime }` — with no server-side rewording, collapsing, or severity ranking.
 * `status` therefore carries all five values the port can produce (`in-sync`/`ahead`/`behind`/
 * `diverged`/`unknown`), and both snapshots stay independently `null`able. That matters for the
 * `"unknown"` case in particular: `getSchemaState()` returns it whenever either snapshot side is
 * unavailable, and flattening it into a boolean here (or defaulting it toward "fine") would
 * manufacture the exact reassurance `adapter.sqlite.ts`'s own "never fabricated" rule exists to
 * prevent. The client is left to decide how to say "we could not determine this".
 *
 * `databaseIntrospection` was already composed into `RouteDeps` in BOTH composition roots
 * (`server/deps.ts`'s real `SqliteDatabaseIntrospectionAdapter`, `server/app.ts`'s
 * `InMemoryDatabaseIntrospectionAdapter`) before this route — it was simply never read over HTTP.
 * See `routes/admin/database-recovery/deps.ts`, whose header previously listed it among the fields
 * excluded from `DatabaseRecoveryRouteDeps` for want of a consumer; this route is that consumer.
 */
export function registerAdminDatabaseSchemaStateRoute(app: Express, deps: DatabaseRecoveryRouteDeps): void {
  app.get("/api/admin/v1/database/schema-state", async (_req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "database.read",
        workspaceId: deps.workspaceId,
        entityType: "database-schema",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'database.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "database.read", reason: authResult.reason },
        });
        return;
      }

      const schemaState = await deps.databaseIntrospection.getSchemaState();
      res.json(schemaState);
    } catch (err) {
      // No `status` field on this envelope, deliberately: a caller that cannot read a status must
      // see the read FAIL, not receive a clean-looking one. See this file's header.
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}

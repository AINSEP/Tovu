import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import type { Express } from "express";

import { listRestorePoints } from "@jini-ai/db/tools";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { DatabaseRecoveryRouteDeps } from "../database-recovery/deps.js";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/**
 * @file design-spec.md §4.2/§4.8 — `GET /api/admin/v1/recovery/restore-points` (Recovery's own
 * restore-points list view — the "Backups" list, ADR-045 §3). Gated by `backup.read`.
 *
 * Reuses `database/restore-points.ts`'s `listRestorePoints` and the same `restorePointsRepo`
 * `apps/website/src/server/inbound/admin-http/routes/database/restore-points.ts` reads — one persisted list, two gated views, per
 * ADR-045 §1 ("Database and Recovery are sibling faces" of the same underlying record).
 */
export function registerAdminRecoveryRestorePointsListRoute(app: Express, deps: DatabaseRecoveryRouteDeps): void {
  app.get("/api/admin/v1/recovery/restore-points", async (_req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "backup.read", workspaceId: deps.workspaceId, entityType: "restore-point" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const result = await listRestorePoints({ repo: deps.restorePointsRepo });
      res.json(result);
    } catch (err) {
      sendAdminFailure({ res, error: err }, { operation: "routes/recovery/restore-points", code: "INTERNAL_ERROR" });
    }
  });
}

import type { Express } from "express";

import { listRestorePoints } from "../../../../features/storage/restore-points";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { StorageRecoveryRouteDeps } from "../storage-recovery/deps";

/**
 * @file design-spec.md §4.2/§4.8 — `GET /api/admin/v1/recovery/restore-points` (Recovery's own
 * restore-points list view — the "Backups" list, ADR-045 §3). Gated by `backup.read`.
 *
 * Reuses `storage/restore-points.ts`'s `listRestorePoints` and the same `restorePointsRepo`
 * `routes/admin/storage/restore-points.ts` reads — one persisted list, two gated views, per
 * ADR-045 §1 ("Storage and Recovery are sibling faces" of the same underlying record).
 */
export function registerAdminRecoveryRestorePointsListRoute(app: Express, deps: StorageRecoveryRouteDeps): void {
  app.get("/api/admin/v1/recovery/restore-points", async (_req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "backup.read",
        workspaceId: deps.workspaceId,
        entityType: "restore-point",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'backup.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "backup.read", reason: authResult.reason },
        });
        return;
      }

      const result = await listRestorePoints({ repo: deps.restorePointsRepo });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}

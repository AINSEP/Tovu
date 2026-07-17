import type { Express } from "express";

import { isOperationInFlight } from "../../../../core/operation-lock";
import { resolveDegradedBanner } from "../../../../features/recovery/ui/degraded-banners";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { StorageRecoveryRouteDeps } from "../storage-recovery/deps";

/**
 * @file design-spec.md §4.2/§4.4/§4.8 — `GET /api/admin/v1/recovery/status` (the capability/status
 * bar + the single highest-precedence degraded banner, ADR-045 §4). Gated by `backup.read`.
 *
 * `resolveDegradedBanner` itself is pure/no-I/O (`degraded-banners.ts`'s own file header) — this
 * route's only job is assembling its `capabilities` input from real (or, where disclosed below,
 * honestly-stubbed) sources:
 *  - `costClass`: real, from `deps.dbOps.getCapabilities()` (`infra/sqlite/db-ops.ts`'s
 *    `SqliteDbOpsAdapter` in the running server).
 *  - `pendingMigration`/`migrationInterrupted`: real read of `deps.siteStatusRepo`. ADR-041/043/
 *    044/045 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, Finding 2 fix):
 *    `features/storage/boot/*`'s reconciliation functions are now invoked by
 *    `server/bootstrap.ts`'s `storage-migration-reconciliation` boot module before the site opens
 *    to traffic, so this now reflects a REAL crash-interrupted-migration determination, not an
 *    always-`false` stub.
 *  - `operationInFlight`: real, from `core/operation-lock`'s `isOperationInFlight` read-only peek.
 *    ADR-041/043/044/045 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, Finding 3):
 *    the lock itself was already live in both gated ceremonies' `execute` routes before this fix
 *    (`migrate-forward.ts`/`restore.ts` both call the real `acquireOperationLock`/
 *    `releaseOperationLock`) — this route's own hardcoded `false` was the only actual gap, a
 *    display-only stub. `isOperationInFlight` closes it without changing the mutual-exclusion
 *    mechanism itself.
 *  - `watermarkBaselineAvailable`: `false`, matching `disclosure.ts` route's own honest stub.
 */
export function registerAdminRecoveryStatusRoute(app: Express, deps: StorageRecoveryRouteDeps): void {
  app.get("/api/admin/v1/recovery/status", async (_req, res) => {
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

      const capabilities = await deps.dbOps.getCapabilities();
      const siteStatus = await deps.siteStatusRepo.get(deps.workspaceId);

      const banner = resolveDegradedBanner({
        capabilities: {
          costClass: capabilities.restorePoint.costClass,
          operationInFlight: isOperationInFlight(deps.workspaceId),
          pendingMigration: siteStatus === "PENDING_MIGRATION",
          migrationInterrupted: siteStatus === "BLOCKED_PENDING_RECOVERY",
          watermarkBaselineAvailable: false,
        },
      });

      res.json({ costClass: capabilities.restorePoint.costClass, banner });
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}

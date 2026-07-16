import type { Express } from "express";

import { resolveDegradedBanner } from "../../../../features/recovery/ui/degraded-banners";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteDeps } from "../../types";

/**
 * @file design-spec.md §4.2/§4.4/§4.8 — `GET /api/admin/v1/recovery/status` (the capability/status
 * bar + the single highest-precedence degraded banner, ADR-045 §4). Gated by `backup.read`.
 *
 * `resolveDegradedBanner` itself is pure/no-I/O (`degraded-banners.ts`'s own file header) — this
 * route's only job is assembling its `capabilities` input from real (or, where disclosed below,
 * honestly-stubbed) sources:
 *  - `costClass`: real, from `deps.dbOps.getCapabilities()` (`infra/sqlite/db-ops.ts`'s
 *    `SqliteDbOpsAdapter` in the running server).
 *  - `pendingMigration`/`migrationInterrupted`: real read of `deps.siteStatusRepo`, but that
 *    status is only ever flipped by `features/storage/boot/*`'s reconciliation functions, which no
 *    composition root invokes at actual server boot yet (a disclosed gap — see this dispatch's
 *    handoff) — so today this always reads `false` until that boot-wiring lands.
 *  - `operationInFlight`: stubbed `false` — `core/operation-lock` is not wired into any
 *    composition root yet (same disclosed gap as the gated migrate-forward/restore-ceremony
 *    routes this dispatch defers).
 *  - `watermarkBaselineAvailable`: `false`, matching `disclosure.ts` route's own honest stub.
 */
export function registerAdminRecoveryStatusRoute(app: Express, deps: RouteDeps): void {
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
          operationInFlight: false,
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

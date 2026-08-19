import type { Express } from "express";

import { computeDisclosure } from "#src/features/recovery/disclosure";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { DatabaseRecoveryRouteDeps } from "../database-recovery/deps.js";

/** ADR-045 §3 Step 2 / `disclosure.ts`'s own file header — the versioned, single, auditable list
 * of write-path categories this disclosure may ever claim to cover. A category is added here only
 * once its own write path is confirmed watermark-stamped (not yet true for `entries`, taxonomy
 * writes, or sessions — see `disclosure.ts`'s header for the full disclosed scope). */
const COVERED_CATEGORIES = ["posts_pages", "plugin_table"] as const;

/**
 * @file design-spec.md §4.3/§4.8 — `POST /api/admin/v1/recovery/disclosure` (the discarded-write-
 * window disclosure, Step 2 of the restore ceremony, REQ-09-REQ-11/INV-05). Gated by `backup.read`
 * (a read-only computation, never itself a restore action).
 *
 * Backed by `AlwaysUnavailableWatermarkSource` (`features/recovery/repo.memory.ts`) — see that
 * class's own doc comment for why reporting the baseline as unavailable is the correct, safe
 * behavior right now rather than a corner cut: this route always renders `"unknown"` for every
 * covered category, never a fabricated `0`.
 */
export function registerAdminRecoveryDisclosureRoute(app: Express, deps: DatabaseRecoveryRouteDeps): void {
  app.post("/api/admin/v1/recovery/disclosure", async (req, res) => {
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

      const body = req.body ?? {};
      if (typeof body.restorePointId !== "string") {
        res.status(400).json({ error: "'restorePointId' (string) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const disclosure = await computeDisclosure({
        deps: { watermarkSource: deps.disclosureWatermarkSource, coveredCategories: COVERED_CATEGORIES },
        input: { restorePointId: body.restorePointId },
      });

      res.json(disclosure);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}

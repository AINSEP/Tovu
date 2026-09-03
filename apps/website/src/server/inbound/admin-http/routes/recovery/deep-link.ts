import type { Express } from "express";

import { resolveDeepLinkContext, type DatabaseContextEnvelope } from "#src/features/recovery/deep-link";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { DatabaseRecoveryRouteDeps } from "../database-recovery/deps.js";

/**
 * @file design-spec.md §4.5/§4.8 — `POST /api/admin/v1/recovery/deep-link` (re-resolves a
 * `DatabaseContextEnvelope` server-side on arrival, INV-04, ADR-041 §7 / ADR-045 §5). Gated by
 * `backup.read`.
 */
export function registerAdminRecoveryDeepLinkRoute(app: Express, deps: DatabaseRecoveryRouteDeps): void {
  app.post("/api/admin/v1/recovery/deep-link", async (req, res) => {
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
      const envelope = body.envelope as DatabaseContextEnvelope | undefined;
      if (!envelope || typeof envelope !== "object") {
        res.status(400).json({ error: "'envelope' (object) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const result = await resolveDeepLinkContext({
        deps: { lookup: deps.deepLinkRestorePointLookup },
        input: { principalId: principal.id, principalKind: "user", envelope },
      });

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}

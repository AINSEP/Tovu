import type { Express } from "express";

import { listEntries } from "../../../../features/entries/list";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { ContentTypesRouteDeps } from "../content-types/deps";

/**
 * @file design-spec.md §1.4/§1.9 — `GET /api/admin/v1/entries?type=` (a Collection's entry list,
 * ADR-022/ADR-043). Gated by `admin.collections.read`.
 */
export function registerAdminEntryListRoute(app: Express, deps: ContentTypesRouteDeps): void {
  app.get("/api/admin/v1/entries", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.collections.read",
        workspaceId: deps.workspaceId,
        entityType: "entry",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.collections.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.collections.read", reason: authResult.reason },
        });
        return;
      }

      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const result = await listEntries({ repo: deps.entryRepo, workspaceId: deps.workspaceId, type });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}

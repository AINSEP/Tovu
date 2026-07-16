import type { Express } from "express";

import { listContentTypes } from "../../../../features/content-types/list";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteDeps } from "../../types";

/**
 * @file design-spec.md §1.9 — `GET /api/admin/v1/content-types` (Collections' content-type
 * registry list, ADR-022/ADR-043). Gated by `admin.collections.read` (ADR-043 §permissions).
 *
 * Follows `routes/admin/storage/timeline.ts`'s exact shape: `getAuthedPrincipal` ->
 * `deps.authorize()` -> 403 on denial -> call the domain read function -> `res.json()`.
 */
export function registerAdminContentTypeListRoute(app: Express, deps: RouteDeps): void {
  app.get("/api/admin/v1/content-types", async (_req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.collections.read",
        workspaceId: deps.workspaceId,
        entityType: "content-type",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.collections.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.collections.read", reason: authResult.reason },
        });
        return;
      }

      const result = await listContentTypes({ repo: deps.contentTypeRepo, workspaceId: deps.workspaceId });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}

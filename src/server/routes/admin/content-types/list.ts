import type { Express } from "express";

import { listContentTypes } from "#src/features/content-types/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ContentTypesRouteDeps } from "./deps";

/**
 * @file design-spec.md §1.9 — `GET /api/admin/v1/content-types` (Collections' content-type
 * registry list, ADR-022/ADR-043). Gated by `admin.collections.read` (ADR-043 §permissions).
 *
 * Follows `routes/admin/database/timeline.ts`'s exact shape: `getAuthedPrincipal` ->
 * `deps.authorize()` -> 403 on denial -> call the domain read function -> `res.json()`.
 */
export function registerAdminContentTypeListRoute(app: Express, deps: ContentTypesRouteDeps): void {
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

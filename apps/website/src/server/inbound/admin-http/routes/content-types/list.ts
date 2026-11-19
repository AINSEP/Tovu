import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express } from "express";

import { listContentTypes } from "#src/features/content-types/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentTypesRouteDeps } from "./deps.js";

/**
 * @file design-spec.md §1.9 — `GET /api/admin/v1/content-types` (Collections' content-type
 * registry list, ADR-022/ADR-043). Gated by `admin.collections.read` (ADR-043 §permissions).
 *
 * Follows `apps/website/src/server/inbound/admin-http/routes/database/timeline.ts`'s exact shape: `getAuthedPrincipal` ->
 * `deps.authorize()` -> 403 on denial -> call the domain read function -> `res.json()`.
 */
export function registerAdminContentTypeListRoute({ app, deps }: { app: Express; deps: ContentTypesRouteDeps }, _optional: Record<string, never> = {}): void {
  app.get("/api/admin/v1/content-types", async (_req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.collections.read", workspaceId: deps.workspaceId, entityType: "content-type" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const result = await listContentTypes({ repo: deps.contentTypeRepo, workspaceId: deps.workspaceId });
      res.json(result);
    } catch (err) {
      sendAdminFailure({ res, error: err }, { operation: "routes/content-types/list", code: "INTERNAL_ERROR" });
    }
  });
}

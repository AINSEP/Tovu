import type { Express } from "express";

import { getReadinessSnapshot } from "#src/server/readiness-state";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file ADR-046 Phase 2 (SPEC-030 REQ-10) — admin module-status view.
 *
 * Registers `GET /api/admin/v1/workspaces/:workspaceId/system/module-status` — an authenticated,
 * `system.read`-gated read over the full boot lifecycle result (every attempted module's
 * name/owner/criticality/lifecycle status), for operators who need more than `/readyz`'s
 * deliberately minimized public-adjacent response. Mirrors the workspace-id 404 check → authorize
 * → 403-on-denial shape used throughout this session's admin routes (e.g.
 * `analytics/recent-hits.ts`).
 */
export type AdminModuleStatusDeps = Pick<RouteDeps, "workspaceId" | "authorize">;

export function registerAdminModuleStatusRoute(app: Express, deps: AdminModuleStatusDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/system/module-status", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const principal = getAuthedPrincipal(res);
    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: "system.read",
      workspaceId: deps.workspaceId,
      entityType: "boot-module",
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for 'system.read' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: "system.read", reason: authResult.reason },
      });
      return;
    }

    res.json(getReadinessSnapshot());
  });
}

import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express } from "express";

import { getReadinessSnapshot } from "#src/server/runtime/lifecycle/readiness-state";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

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

export function registerAdminModuleStatusRoute({ app, deps }: { app: Express; deps: AdminModuleStatusDeps }, _optional: Record<string, never> = {}): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/system/module-status", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "system.read", workspaceId: deps.workspaceId, entityType: "boot-module" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      // Mirrors `/readyz`'s status-code mapping (`ops/health.ts`'s `registerReadyzRoute`): `ok:false`
      // in the snapshot means a CRITICAL module actually failed to come up, which is a real failure
      // state for the caller to notice programmatically (a monitoring probe polling this route, not
      // just an operator reading the JSON by eye) — not something a 200 should paper over. The body is
      // unchanged either way; this route's whole reason to exist over `/readyz` is the full detail, and
      // that must stay readable exactly the same regardless of status code.
      const snapshot = getReadinessSnapshot();
      res.status(snapshot.ok ? 200 : 503).json(snapshot);
    } catch (err) {
      sendAdminFailure({ res, error: err }, { operation: "routes/system/module-status", code: "INTERNAL_ERROR" });
    }
  });
}

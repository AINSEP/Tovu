import type { Express } from "express";

import { resolveObservabilityConfig } from "#src/platform/observability/config";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Observability admin page, Overview tab (`development/todos.md` 2026-09-09 owner ask) —
 * `GET /api/admin/v1/workspaces/:workspaceId/system/observability-status`.
 *
 * Reports whether `platform/observability`'s real OTel adapter is currently enabled (an operator
 * has set `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) or the process is
 * running the default no-op — never the endpoint value itself, which could carry a collector's
 * hostname or an embedded credential (the same discipline `RequestTrackingOutcome.routePattern`
 * already applies to inbound paths, per `ports.ts`). `resolveObservabilityConfig()` is already
 * unit-tested (`platform/observability/__tests__/unit/config.unit.test.ts`); this route only wires
 * that existing, pure decision through the same workspace-id-404 -> authorize -> 403 shape every
 * sibling route in this directory uses (`module-status.ts`, `deployment-overview.ts`).
 */
export type AdminObservabilityStatusDeps = Pick<RouteDeps, "workspaceId" | "authorize">;

export function registerAdminObservabilityStatusRoute(app: Express, deps: AdminObservabilityStatusDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/system/observability-status", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "system.read",
        workspaceId: deps.workspaceId,
        entityType: "observability",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'system.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "system.read", reason: authResult.reason },
        });
        return;
      }

      const config = resolveObservabilityConfig();
      res.status(200).json({
        enabled: config.enabled,
        serviceName: config.enabled ? config.serviceName : null,
      });
    } catch (err) {
      console.error("[system/observability-status] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}

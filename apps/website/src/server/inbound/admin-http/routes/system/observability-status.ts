import type { Express } from "express";

import { isNoopObservabilityPort } from "#src/platform/observability/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Observability admin page, Overview tab (`development/todos.md` 2026-09-09 owner ask) —
 * `GET /api/admin/v1/workspaces/:workspaceId/system/observability-status`.
 *
 * Reports whether a configured observability provider plugin backs `RouteDeps.observability`
 * (since provider wave 2; before it, whether an operator had set `OTEL_EXPORTER_OTLP_ENDPOINT`/
 * `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) or the process is running the default no-op — never the
 * endpoint value itself, which could carry a collector's hostname or an embedded credential (the same
 * discipline `RequestTrackingOutcome.routePattern` already applies to inbound paths, per `ports.ts`).
 * The selection itself is `server/runtime/composition/provider-plugins.ts`'s; this route only wires
 * that decision through the same workspace-id-404 -> authorize -> 403 shape every sibling route in
 * this directory uses (`module-status.ts`, `deployment-overview.ts`).
 */
export type AdminObservabilityStatusDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "observability" | "observabilityEnabled" | "telemetryStatus" | "sendTelemetryTest" | "tracker">;

function observabilityStatusBody(
  { deps, enabled, testAccess }: { deps: AdminObservabilityStatusDeps; enabled: boolean; testAccess: { allowed: boolean } | undefined },
  _optional = {},
) {
  return { enabled, serviceName: enabled ? "tovu" : null,
    ...(deps.telemetryStatus ? { providers: deps.telemetryStatus({}) } : {}),
    ...(testAccess ? { canSendTestError: testAccess.allowed } : {}) };
}

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

      // Whether a configured provider plugin backs the port, and the fixed service identity it
      // reports under. Never the collector endpoint, DSN or any credential: those live only in the
      // provider plugins' sealed key cards and must not be disclosed by this status route.
      const enabled = deps.observabilityEnabled?.() ?? !isNoopObservabilityPort(deps.observability);
      const testAccess = deps.sendTelemetryTest ? await deps.authorize({ principalId: principal.id,
        permission: "system.write", workspaceId: deps.workspaceId, entityType: "observability" }) : undefined;
      res.status(200).json(observabilityStatusBody({ deps, enabled, testAccess }));
    } catch (err) {
      console.error("[system/observability-status] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
  app.post("/api/admin/v1/workspaces/:workspaceId/system/observability/test-error", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" }); return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      const access = await deps.authorize({ principalId: principal.id, permission: "system.write",
        workspaceId: deps.workspaceId, entityType: "observability" });
      if (!access.allowed) { res.status(403).json({ error: "not authorized to send a test error", code: "FORBIDDEN" }); return; }
      if (!deps.sendTelemetryTest) { res.status(503).json({ error: "telemetry test is unavailable" }); return; }
      // No submitted error text: only the fixed diagnostic bound by the composition root is sent.
      res.status(200).json(await deps.sendTelemetryTest({}));
    } catch (error) {
      deps.tracker.error({ error: error instanceof Error ? error : new Error("telemetry test failed") }, { context: { operation: "telemetry.test_action" } });
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}

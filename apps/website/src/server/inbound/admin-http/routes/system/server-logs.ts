import type { Express } from "express";

import { processServerLogSource } from "#src/features/server-logs/process-source";
import { parseServerLogFilters, readServerLogs, ServerLogFilterError, type ServerLogSourcePort } from "#src/features/server-logs/read-server-logs";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file `GET /api/admin/v1/workspaces/:workspaceId/system/server-logs` — recent captured server log
 * lines (gap A-04). Query: `level`, `sinceIso`, `contains`, `limit`, the same filters and the same
 * `readServerLogs` call as the `system_read_server_logs` chat tool. Same workspace-404 -> authorize
 * -> 403 shape as `observability-status.ts`.
 */
export type AdminServerLogsDeps = Pick<RouteDeps, "workspaceId" | "authorize">;

function queryRecord(query: Record<string, unknown>): Record<string, unknown> {
  // Express parses `?level=a&level=b` into an array; keep the first so validation sees one value.
  return Object.fromEntries(Object.entries(query).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
}

export function registerAdminServerLogsRoute(app: Express, deps: AdminServerLogsDeps, optional: { logs?: ServerLogSourcePort } = {}): void {
  const logs = optional.logs ?? processServerLogSource;
  app.get("/api/admin/v1/workspaces/:workspaceId/system/server-logs", async (req, res) => {
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
        entityType: "server-logs",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'system.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "system.read", reason: authResult.reason },
        });
        return;
      }

      const filters = parseServerLogFilters({ raw: queryRecord(req.query as Record<string, unknown>) });
      res.status(200).json(readServerLogs({ logs }, filters));
    } catch (err) {
      if (err instanceof ServerLogFilterError) {
        res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
        return;
      }
      console.error("[system/server-logs] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}

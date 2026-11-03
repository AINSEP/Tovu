import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { readServerAdmissions } from "#src/server/runtime/services/external-mcp-admissions";
import type { ExternalMcpRouteRegistrar } from "./deps.js";
import { guardExternalMcpRequest } from "./guard.js";

/**
 * Reports the server-owned federation's live admissions after the workspace/permission gate.
 * A missing or still-connecting reader answers a distinguishable 503, never an empty roster:
 * an empty list means no tools were admitted, whereas an unavailable report cannot say that.
 * The legacy failure code remains until the admin client's unavailable-state contract migrates.
 * @complexity O(1) dispatch plus the server reader's bounded federation wait.
 */
export const registerAdminExternalMcpAdmissionsRoute: ExternalMcpRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/mcp-servers/admissions", async (req, res) => {
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;

      const result = await (deps.externalMcpAdmissions?.() ?? readServerAdmissions({}, {}));
      if (!result.ok) {
        res.status(503).json(result.body);
        return;
      }
      res
        .status(200)
        .json(result.configFailures !== undefined ? { connections: result.connections, configFailures: result.configFailures } : { connections: result.connections });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/external-mcp/admissions", code: "INTERNAL_ERROR" });
    }
  });
};

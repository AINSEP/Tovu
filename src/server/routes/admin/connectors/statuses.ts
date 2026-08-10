import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ConnectorsRouteRegistrar } from "./deps";
import { sendConnectorError } from "./errors";

/**
 * GET every connector's connection status. Answers `ConnectorsPort.fetchConnectorStatuses`.
 *
 * Returns a bare `Record<connectorId, { status, accountLabel?, lastError? }>` rather than a
 * `{ data }` envelope, because the port resolves the map directly and `{}` is a meaningful answer
 * ("reached, nothing connected") that must stay distinguishable from the unreachable case the
 * client models as a rejected promise — the same contract `media/get-providers.ts` documents.
 *
 * Purely in-process: statuses come from the service's own status/credential state, so this makes
 * no outbound Composio request and works unconfigured. Until the OAuth connect flow lands every
 * Composio-backed entry reports `available`.
 *
 * MUST be registered before `get-by-id.ts` — see `server/modules/connectors.ts` for why.
 */
export const registerAdminConnectorsStatusesRoute: ConnectorsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/connectors/statuses", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.integrations.manage",
        workspaceId: deps.workspaceId,
        entityType: "integration",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.integrations.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.integrations.manage", reason: authResult.reason },
        });
        return;
      }

      res.json(deps.composioConnectors.service.listConnectorStatuses());
    } catch (error) {
      sendConnectorError(res, error);
    }
  });
};

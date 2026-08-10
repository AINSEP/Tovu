import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ConnectorsRouteRegistrar } from "./deps";
import { sendConnectorError } from "./errors";

/**
 * POST to disconnect a connector, and POST to cancel an in-flight authorization.
 *
 * Both live here because they are the same shape and the same permission, and both differ from
 * `connect.ts` in one way that matters: neither ever produces a redirect, so the client can treat
 * the response as final.
 *
 * `disconnect` revokes the account at Composio AND deletes the sealed local credentials; the flush
 * is awaited so a 200 really means the row is gone. `cancel` only drops the provider's in-memory
 * pending-authorization entry — nothing was ever stored, so there is nothing to flush.
 */
export const registerAdminConnectorsDisconnectRoute: ConnectorsRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/connectors/:connectorId/disconnect", async (req, res) => {
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

      const connector = await deps.composioConnectors.service.disconnect(String(req.params.connectorId ?? ""));
      await deps.composioConnectors.flushCredentials();
      res.json(connector);
    } catch (error) {
      sendConnectorError(res, error);
    }
  });
};

export const registerAdminConnectorsCancelRoute: ConnectorsRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/connectors/:connectorId/cancel", async (req, res) => {
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

      res.json(
        await deps.composioConnectors.service.cancelPendingAuthorization(String(req.params.connectorId ?? ""))
      );
    } catch (error) {
      sendConnectorError(res, error);
    }
  });
};

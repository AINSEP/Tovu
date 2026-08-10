import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { composioCallbackUrl } from "./callback-url";
import type { ConnectorsRouteRegistrar } from "./deps";
import { sendConnectorError } from "./errors";

/**
 * POST to begin authorizing a connector. Answers `ConnectorsPort.connectConnector`.
 *
 * Returns `{ connector, auth }` where `auth.kind` is one of:
 * - `redirect_required` — the normal OAuth path; `auth.redirectUrl` is opened in a popup and the
 *   handshake finishes at the public callback route.
 * - `connected` — Composio already had a validated account for this connector and user, so no
 *   round trip was needed.
 * - `pending` — Composio accepted the request but has not produced a redirect yet.
 *
 * The credential flush is awaited before responding: `connected` writes real account credentials
 * synchronously into the snapshot store, and returning before they are sealed to disk would report
 * a connection that disappears on the next restart.
 */
export const registerAdminConnectorsConnectRoute: ConnectorsRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/connectors/:connectorId/connect", async (req, res) => {
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

      const connectorId = String(req.params.connectorId ?? "");
      const result = await deps.composioConnectors.service.connect(connectorId, {
        callbackUrl: composioCallbackUrl(req, connectorId),
      });
      await deps.composioConnectors.flushCredentials();
      res.json(result);
    } catch (error) {
      sendConnectorError(res, error);
    }
  });
};

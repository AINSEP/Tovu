import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ConnectorsRouteRegistrar } from "./deps";
import { sendConnectorError } from "./errors";

/**
 * GET the Composio connector catalog. Answers `ConnectorsPort.fetchConnectors` (and, with
 * `?refresh=1`, `fetchConnectorEnrichment`) in `@jini-ai/ui`'s connectors feature.
 *
 * Without `refresh` this serves the provider's STATIC catalog — 3 featured connectors plus 183
 * documented toolkits, built in-process at construction. That path needs no Composio API key and
 * makes no outbound request, which is why the tab renders a populated grid even on a workspace
 * that has never configured Composio.
 *
 * `?refresh=1` asks the provider to re-fetch from Composio and therefore DOES require a configured
 * key; it is the enrichment call `ConnectorsBrowser` only makes once `unlocked`.
 *
 * Gated by `admin.integrations.manage` — the existing third-party-integration permission, reused
 * rather than minting a new string, the same call `assistant/mcp-federation/trust.ts` documents.
 */
export const registerAdminConnectorsListRoute: ConnectorsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/connectors", async (req, res) => {
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

      const refresh = req.query.refresh === "1" || req.query.refresh === "true";
      const result = await deps.composioConnectors.service.listConnectorDiscovery(
        refresh ? { refresh: true } : {}
      );
      res.json(result);
    } catch (error) {
      sendConnectorError(res, error);
    }
  });
};

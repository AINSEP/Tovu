import { getComposioConfigView } from "#src/platform/connectors/composio-config-store";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ConnectorsConfigRouteRegistrar } from "./deps.js";

/**
 * GET whether this workspace has a Composio API key, as markers only — never key material.
 * Drives `ConnectorsBrowser`'s `unlocked` prop and the tab's masked-key label.
 *
 * Never decrypts (`keyTail` is a plain column computed at write time), so it cannot fail on a
 * misconfigured or rotated master secret — the same property `media/get-providers.ts` relies on.
 *
 * MUST be registered before `get-by-id.ts`, or `/connectors/config` matches `:connectorId`.
 */
export const registerAdminConnectorsGetConfigRoute: ConnectorsConfigRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/connectors/config", async (req, res) => {
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

      res.json(await getComposioConfigView({ repo: deps.composioConfigRepo }, { workspaceId: deps.workspaceId }));
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};

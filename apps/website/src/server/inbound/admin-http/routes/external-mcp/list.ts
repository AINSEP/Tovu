import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { describeExternalMcpOwnership } from "@jini-ai/mcp/external/built-in-connections";
import { listExternalMcpServerViews } from "../../../../../features/external-mcp/external-mcp-store.js";
import type { ExternalMcpRouteRegistrar } from "./deps.js";
import { guardExternalMcpRequest } from "./guard.js";

/**
 * GET the workspace's configured external MCP servers, for Settings → External MCP.
 *
 * Serves the read model only: `envNames` without any env VALUE. There is deliberately no route
 * anywhere that returns a stored env value — the tab has no use for one, and an endpoint that
 * decrypted credentials for display would be a strictly worse trade than showing which variables
 * are set. That property is asserted in `external-mcp-store.test.ts`, not merely intended.
 *
 * Never decrypts, so it cannot fail on a rotated or missing site key — the same property
 * the connector configuration reader and `media/get-providers.ts` rely on.
 * Owner 2026-10-07: safe hints now unseal on the server, without returning secret values. Missing
 * keys still degrade to metadata-only reads; they must not make this settings list unavailable.
 */
export const registerAdminExternalMcpListRoute: ExternalMcpRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/mcp-servers", async (req, res) => {
    try {
      if (!(await guardExternalMcpRequest({ deps, requestedWorkspaceId: req.params.workspaceId, res }))) return;
      const servers = await listExternalMcpServerViews({ deps: { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer }, workspaceId: deps.workspaceId });
      res.json({ servers: servers.map(server => describeExternalMcpOwnership({ server, ids: deps.builtInExternalMcpServerIds })) });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/external-mcp/list", code: "INTERNAL_ERROR" });
    }
  });
};

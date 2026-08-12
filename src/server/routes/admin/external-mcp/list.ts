import { listExternalMcpServerViews } from "#src/assistant/index";
import type { ExternalMcpRouteRegistrar } from "./deps";
import { guardExternalMcpRequest } from "./guard";

/**
 * GET the workspace's configured external MCP servers, for Settings → External MCP.
 *
 * Serves the read model only: `envNames` without any env VALUE. There is deliberately no route
 * anywhere that returns a stored env value — the tab has no use for one, and an endpoint that
 * decrypted credentials for display would be a strictly worse trade than showing which variables
 * are set. That property is asserted in `external-mcp-store.test.ts`, not merely intended.
 *
 * Never decrypts, so it cannot fail on a rotated or missing master secret — the same property
 * `connectors/get-config.ts` and `media/get-providers.ts` rely on.
 */
export const registerAdminExternalMcpListRoute: ExternalMcpRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/mcp-servers", async (req, res) => {
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;
      const servers = await listExternalMcpServerViews({ repo: deps.externalMcpServerRepo }, deps.workspaceId);
      res.json({ servers });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};

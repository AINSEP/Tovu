import { deleteExternalMcpServer } from "#src/assistant/index";
import type { ExternalMcpRouteRegistrar } from "./deps.js";
import { guardExternalMcpRequest } from "./guard.js";

/**
 * DELETE one external MCP server from the workspace's roster.
 *
 * Answers 404 when no row was removed rather than reporting success for an id that never existed —
 * a silent success here would tell an operator a server is gone when what actually happened is that
 * they deleted a typo and the real one is still configured and still being launched at every boot.
 *
 * Like the write route, the effect lands at the next daemon restart, so `restartRequired` is
 * returned for the same reason: a still-running daemon holds an already-connected session for this
 * server, and the tab must not imply otherwise.
 */
export const registerAdminExternalMcpDeleteRoute: ExternalMcpRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId", async (req, res) => {
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;

      const removed = await deleteExternalMcpServer(
        { repo: deps.externalMcpServerRepo },
        { workspaceId: deps.workspaceId, serverId: String(req.params.serverId ?? "") },
      );
      if (!removed) {
        res.status(404).json({ error: "external MCP server was not found", code: "NOT_FOUND" });
        return;
      }

      res.json({ removed: true, restartRequired: true });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};

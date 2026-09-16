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
 * Its tools refuse from the next call — `external-mcp-revocation.ts`'s per-call gate re-reads the
 * row on every federated call and refuses one whose row is gone. `restartRequired` stays true
 * because the running assistant still holds the open connection and lists the tools until it
 * restarts. The delete itself is unchanged and permanent.
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

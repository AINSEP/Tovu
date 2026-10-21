import type { ExternalMcpRouteRegistrar } from "./deps.js";
import { guardExternalMcpRequest } from "./guard.js";

/**
 * @file The Integrations "Always allow" list (owner call 2026-09-28): which remote tools the site
 * owner told the approval card to stop asking about, per external MCP server, and a revoke for each.
 *
 * Reads and deletes `external_mcp_tool_approvals` rows (`assistant/external-mcp-tool-approvals.ts`).
 * Revoking is reversible — the tool's next call just shows the card again — so there is no confirm
 * step anywhere on this path. Granting stays on the card: a grant is pinned to a fingerprint of the
 * tool exactly as the running daemon admitted it, which only the card's own call path has.
 *
 * The fingerprint is never sent: it is a hash the page has no use for.
 *
 * A composition with no store (`externalMcpToolApprovalRepo` unset) can have saved nothing, so its
 * list is empty and every revoke is a 404 — the truthful answer, not an error.
 */
export const registerAdminExternalMcpToolApprovalsRoutes: ExternalMcpRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/mcp-servers/tool-approvals", async (req, res) => {
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;
      const rows = (await deps.externalMcpToolApprovalRepo?.listByWorkspaceId(deps.workspaceId)) ?? [];
      const approvals = rows
        .map(({ serverId, toolName, grantedByPrincipalId, grantedAt }) => ({ serverId, toolName, grantedByPrincipalId, grantedAt }))
        .sort((a, b) => a.serverId.localeCompare(b.serverId) || a.toolName.localeCompare(b.toolName));
      res.json({ approvals });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });

  app.delete("/api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId/tool-approvals/:toolName", async (req, res) => {
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;
      const removed =
        (await deps.externalMcpToolApprovalRepo?.delete({
          workspaceId: deps.workspaceId,
          serverId: String(req.params.serverId ?? ""),
          toolName: String(req.params.toolName ?? ""),
        })) ?? false;
      if (!removed) {
        res.status(404).json({ error: "no Always allow is saved for that tool", code: "NOT_FOUND" });
        return;
      }
      res.json({ removed: true });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};

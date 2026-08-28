import { deleteWorkspace, WorkspaceLastRemainingError, WorkspaceNotFoundError } from "#src/features/workspace/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { WorkspaceRouteRegistrar } from "./deps.js";

/**
 * DELETE workspaces/:workspaceId — `DELETE_WORKSPACE` (SPEC-044 REQ-05/INV-03, AC-06).
 * `:workspaceId` must equal the caller's own workspace (INV-04, checked before authorization, and
 * before the last-workspace guard — EC-04: an unauthorized caller learns nothing about workspace
 * count). Gated by `workspace.manage`. Always refuses in v1 (`LAST_WORKSPACE`) — see
 * `features/workspace/delete.ts`'s header for why that is correct, guarded behavior.
 */
export const registerAdminWorkspaceDeleteRoute: WorkspaceRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "workspace.manage",
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'workspace.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "workspace.manage", reason: authResult.reason },
        });
        return;
      }

      await deleteWorkspace({ deps: { repo: deps.workspaceRepo }, input: { id: deps.workspaceId } });

      res.status(204).send();
    } catch (err) {
      if (err instanceof WorkspaceLastRemainingError) {
        res.status(409).json({ error: err.message, code: "LAST_WORKSPACE" });
        return;
      }

      if (err instanceof WorkspaceNotFoundError) {
        res.status(404).json({ error: err.message, code: "RESOURCE_NOT_FOUND" });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};

import { toAdminWorkspaceResponse } from "#src/server/http/admin/workspace";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { WorkspaceRouteRegistrar } from "./deps.js";

/**
 * GET workspaces/:workspaceId — SPEC-044 REQ-03. `:workspaceId` must equal the caller's own
 * (boot-wired) workspace, else `404` (INV-04 — matches every other admin route's existing
 * mismatched-workspaceId convention, e.g. `routes/admin/users/list.ts`; checked before
 * authorization so a mismatched id never discloses whether a permission grant exists). Gated by
 * `workspace.manage`.
 */
export const registerAdminWorkspaceGetRoute: WorkspaceRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId", async (req, res) => {
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

      const workspace = await deps.workspaceRepo.findById(deps.workspaceId);
      if (!workspace) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }

      res.json({ workspace: toAdminWorkspaceResponse(workspace) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

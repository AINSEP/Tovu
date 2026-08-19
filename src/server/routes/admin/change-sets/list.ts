import { toChangeSetHeaderResponse } from "#src/server/http/admin/change-sets";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/**
 * GET change sets, newest-first, workspace-scoped (SPEC-001 REQ-06).
 *
 * Gated by the existing `changeset.read` permission, checked directly via `authorize()`.
 */
export const registerAdminChangeSetListRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/change-sets", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "changeset.read",
        workspaceId: deps.workspaceId,
        entityType: "change_set",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'changeset.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "changeset.read", reason: authResult.reason },
        });
        return;
      }

      const changeSets = await deps.changeSets.listByWorkspace({ workspaceId: deps.workspaceId });
      res.json({ changeSets: changeSets.map(toChangeSetHeaderResponse) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

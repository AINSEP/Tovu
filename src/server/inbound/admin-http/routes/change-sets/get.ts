import {
  toChangeSetHeaderResponse,
  toChangeSetItemResponse,
} from "#src/server/inbound/admin-http/http/change-sets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/**
 * GET one change set with its items (SPEC-001 REQ-06).
 *
 * Gated by the existing `changeset.read` permission, checked directly via `authorize()`.
 */
export const registerAdminChangeSetGetRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/change-sets/:changeSetId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const changeSetId = String(req.params.changeSetId ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "changeset.read",
        workspaceId: deps.workspaceId,
        entityType: "change_set",
        entityId: changeSetId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'changeset.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "changeset.read", reason: authResult.reason },
        });
        return;
      }

      const found = await deps.changeSets.findById({
        workspaceId: deps.workspaceId,
        id: changeSetId,
      });
      if (!found) {
        res.status(404).json({ error: "change set was not found", code: "CHANGE_SET_NOT_FOUND" });
        return;
      }

      res.json({
        changeSet: toChangeSetHeaderResponse(found.changeSet),
        items: found.items.map(toChangeSetItemResponse),
      });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

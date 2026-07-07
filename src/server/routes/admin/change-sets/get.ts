import {
  toChangeSetHeaderResponse,
  toChangeSetItemResponse,
} from "../../../../server/http/admin/change-sets";
import type { RouteRegistrar } from "../../../routes/types";

/** GET one change set with its items (SPEC-001 REQ-06). */
export const registerAdminChangeSetGetRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/change-sets/:changeSetId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const found = await deps.changeSets.findById({
        workspaceId: deps.workspaceId,
        id: String(req.params.changeSetId ?? ""),
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

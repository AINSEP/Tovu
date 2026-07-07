import { toChangeSetHeaderResponse } from "../../../../server/http/admin/change-sets";
import type { RouteRegistrar } from "../../../routes/types";

/** GET change sets, newest-first, workspace-scoped (SPEC-001 REQ-06). */
export const registerAdminChangeSetListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/change-sets", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const changeSets = await deps.changeSets.listByWorkspace({ workspaceId: deps.workspaceId });
      res.json({ changeSets: changeSets.map(toChangeSetHeaderResponse) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

import { listMedia } from "../../../../media";
import { toAdminMediaListResponse } from "../../../http/admin/media";
import type { RouteRegistrar } from "../../types";

/** GET all media in the workspace (all statuses — active + trashed; mirrors `listAdminPosts`). */
export const registerAdminMediaListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/media", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const { media } = await listMedia({
        deps: { mediaRepo: deps.mediaRepo },
        input: { workspaceId: deps.workspaceId },
      });
      res.json(toAdminMediaListResponse(media));
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

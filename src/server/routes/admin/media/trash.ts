import { MediaNotFoundError, trashMedia } from "../../../../media";
import { toAdminMediaResponse } from "../../../http/admin/media";
import type { RouteRegistrar } from "../../types";

/** POST soft-delete (trash) a media asset — first rung of the ADR-027 §5 deletion ladder. */
export const registerAdminMediaTrashRoute: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/media/:mediaId/trash", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const { media } = await trashMedia({
        deps: { clock: deps.clock, mediaRepo: deps.mediaRepo },
        input: { workspaceId: deps.workspaceId, id: String(req.params.mediaId ?? "") },
      });
      res.json({ media: toAdminMediaResponse(media) });
    } catch (err) {
      if (err instanceof MediaNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};

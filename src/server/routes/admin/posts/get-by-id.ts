import { getAdminPostById, PostNotFoundError } from "../../../../features/post";
import { toAdminPostResponse } from "../../../../server/http/admin/posts";
import type { RouteRegistrar } from "../../../routes/types";

export const registerAdminPostGetRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/posts/:postId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const result = await getAdminPostById({
        deps: { repo: deps.postRepo },
        input: { workspaceId: deps.workspaceId, id: String(req.params.postId ?? "") },
      });

      res.json(toAdminPostResponse(result.post));
    } catch (err) {
      if (err instanceof PostNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};

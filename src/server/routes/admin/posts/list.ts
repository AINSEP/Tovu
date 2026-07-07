import { listAdminPosts } from "../../../../features/post";
import { toAdminPostResponse } from "../../../../server/http/admin/posts";
import type { RouteRegistrar } from "../../../routes/types";

export const registerAdminPostListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/posts", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const result = await listAdminPosts({
        deps: { repo: deps.postRepo },
        input: { workspaceId: deps.workspaceId },
      });
      res.json({ posts: result.posts.map(toAdminPostResponse) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

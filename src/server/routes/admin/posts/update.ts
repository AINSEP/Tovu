import { PostConflictError, PostNotFoundError, PostValidationError, updatePost } from "../../../../features/post";
import { toAdminPostResponse } from "../../../../server/http/admin/posts";
import type { RouteRegistrar } from "../../../routes/types";

export const registerAdminPostUpdateRoute: RouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/posts/:postId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const result = await updatePost({
        deps: { repo: deps.postRepo, clock: deps.clock },
        input: {
          workspaceId: deps.workspaceId,
          id: String(req.params.postId ?? ""),
          title: String(req.body?.title ?? ""),
          slug: String(req.body?.slug ?? ""),
          bodyJson: req.body?.bodyJson,
          status: req.body?.status,
        },
      });

      res.json(toAdminPostResponse(result.post));
    } catch (err) {
      if (err instanceof PostValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      if (err instanceof PostConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }

      if (err instanceof PostNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};

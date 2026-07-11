import { listAdminPages } from "../../../../features/post";
import { toAdminPostResponse } from "../../../../server/http/admin/posts";
import type { RouteRegistrar } from "../../../routes/types";

/**
 * GET admin pages — same shape as `posts/list.ts`, filtered to `kind: "page"`
 * (see `features/post/post.ts`'s `PostKind` doc: a page is a post row with
 * `kind: "page"`, same table, same repo, same editor).
 */
export const registerAdminPageListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/pages", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const result = await listAdminPages({
        deps: { repo: deps.postRepo },
        input: { workspaceId: deps.workspaceId },
      });
      res.json({ posts: result.posts.map(toAdminPostResponse) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

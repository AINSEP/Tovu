import { listAdminPosts } from "#src/features/post/index";
import { toAdminPostResponse } from "#src/server/inbound/admin-http/http/posts";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/** Gated by `content.read` (2026-07-16 authz sweep: previously had zero permission check
 * beyond session auth — `content.read` was defined in the catalog but never enforced anywhere). */
export const registerAdminPostListRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/posts", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "content.read",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

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

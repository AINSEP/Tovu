import { listAdminPosts } from "../../../../features/post";
import { toAdminPostResponse } from "../../../../server/http/admin/posts";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../../routes/types";

/** Gated by `content.read` (2026-07-16 authz sweep: previously had zero permission check
 * beyond session auth — `content.read` was defined in the catalog but never enforced anywhere). */
export const registerAdminPostListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/posts", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "content.read",
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'content.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "content.read", reason: authResult.reason },
        });
        return;
      }

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

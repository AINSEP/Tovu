import { getAdminPostById, PostNotFoundError } from "../../../../features/post";
import { toAdminPostResponse } from "../../../../server/http/admin/posts";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../../routes/types";

/** Gated by `content.read` (2026-07-16 authz sweep — see `posts/list.ts`'s identical fix/note). */
export const registerAdminPostGetRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/posts/:postId", async (req, res) => {
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

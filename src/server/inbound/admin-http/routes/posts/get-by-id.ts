import { getAdminPostByIdOrSlug, PostNotFoundError } from "#src/features/post/index";
import { toAdminPostResponse } from "#src/server/inbound/admin-http/http/posts";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/** Gated by `content.read` (2026-07-16 authz sweep — see `posts/list.ts`'s identical fix/note). */
export const registerAdminPostGetRoute: ContentRouteRegistrar = (app, deps) => {
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

      // Admin URLs use the slug when one resolves (cleaner than the raw stored id, 2026-08-10) — this
      // route accepts either so an old id-based bookmark/link keeps working (getAdminPostByIdOrSlug
      // tries id first, falls back to slug; see that function's own doc).
      const result = await getAdminPostByIdOrSlug({
        deps: { repo: deps.postRepo },
        input: { workspaceId: deps.workspaceId, idOrSlug: String(req.params.postId ?? "") },
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

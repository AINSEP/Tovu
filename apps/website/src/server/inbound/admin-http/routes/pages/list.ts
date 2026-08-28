import { listAdminPages } from "#src/features/post/index";
import { toAdminPostResponse } from "#src/server/inbound/admin-http/http/posts";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/**
 * GET admin pages — same shape as `posts/list.ts`, filtered to `kind: "page"`
 * (see `features/post/post.ts`'s `PostKind` doc: a page is a post row with
 * `kind: "page"`, same table, same repo, same editor).
 *
 * Gated by `content.read` (2026-07-16 authz sweep — see `posts/list.ts`'s identical fix/note).
 */
export const registerAdminPageListRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/pages", async (req, res) => {
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

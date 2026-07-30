import { getAdminPostById, PostNotFoundError } from "../../../../features/post";
import { toAdminPostResponse } from "../../../../server/http/admin/posts";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps";

/**
 * GET one page (SPEC-002 api.spec.md `PAGE_GET`) — same underlying
 * `getAdminPostById` lookup `posts/get-by-id.ts` uses (same `post` table, same
 * repo), plus a `kind === "page"` guard: api.spec.md §6 documents `PAGE_GET`'s
 * 404 as "unknown workspace / `ENTRY_NOT_FOUND` (incl. kind mismatch)" — a
 * `kind: "post"` row fetched through `/pages/:pageId` must 404 exactly like an
 * unknown id, not leak the post's existence through this route family
 * ("kind-mismatch 404s are deliberately indistinguishable from not-found",
 * api.spec.md §7).
 *
 * Gated by `content.read` (mirrors `pages/list.ts`'s identical 2026-07-16 authz
 * sweep fix, and `posts/get-by-id.ts`'s own doc note).
 *
 * `code: "ENTRY_NOT_FOUND"` is included on both 404 branches — unlike the legacy
 * `posts/get-by-id.ts` (message-only 404, a modified not new endpoint),
 * errors.spec.md §1/§4 requires `code` on every new endpoint's error response,
 * and names `ENTRY_NOT_FOUND` as exactly this route's not-found/kind-mismatch code.
 */
export const registerAdminPageGetRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/pages/:pageId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const pageId = String(req.params.pageId ?? "");

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
        input: { workspaceId: deps.workspaceId, id: pageId },
      });

      if (result.post.kind !== "page") {
        // Kind mismatch — treated identically to not-found (api.spec.md §6/§7).
        res.status(404).json({ error: `page '${pageId}' was not found`, code: "ENTRY_NOT_FOUND" });
        return;
      }

      res.json(toAdminPostResponse(result.post));
    } catch (err) {
      if (err instanceof PostNotFoundError) {
        res.status(404).json({ error: err.message, code: "ENTRY_NOT_FOUND" });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};

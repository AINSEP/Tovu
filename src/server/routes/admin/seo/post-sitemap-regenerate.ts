import { regenerateSitemapCache } from "../../../../seo";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../../routes/types";

/** POST force-rebuild the cached sitemap (SPEC-008 api.spec.md `SEO_POST_SITEMAP_REGENERATE`, tasks.md T047). */
export const registerAdminSeoPostSitemapRegenerateRoute: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/seo/sitemap/regenerate", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.seoReady;
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.seo.manage",
        workspaceId: deps.workspaceId,
        entityType: "seo-sitemap",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.seo.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.seo.manage", reason: authResult.reason },
        });
        return;
      }

      await regenerateSitemapCache(
        { postRepo: deps.postRepo, settingsRepo: deps.settingsRepo, media: deps },
        { workspaceId: deps.workspaceId }
      );
      res.status(202).json({ data: { accepted: true } });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};

import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { SeoRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/** POST force-rebuild the cached sitemap (SPEC-008 api.spec.md `SEO_POST_SITEMAP_REGENERATE`, tasks.md T047). */
export const registerAdminSeoPostSitemapRegenerateRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/seo/sitemap/regenerate", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      await deps.seoReady;
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.seo.manage", workspaceId: deps.workspaceId, entityType: "seo-sitemap" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      await deps.sitemapService.regenerateSitemapCache({ workspaceId: deps.workspaceId }, {});
      res.status(202).json({ data: { accepted: true } });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/seo/post-sitemap-regenerate", code: "INTERNAL_ERROR" });
    }
  });
};

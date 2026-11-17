import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { setSeoSettings } from "#src/features/seo/index";
import { SeoSettingsValidationError } from "@jini-ai/cms/seo";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { SeoRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/** PUT (partial) workspace-level `seo.*` settings (SPEC-008 api.spec.md `SEO_PUT_SETTINGS`, tasks.md T047). */
export const registerAdminSeoPutSettingsRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/seo/settings", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      await deps.seoReady;
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.seo.manage", workspaceId: deps.workspaceId, entityType: "seo-settings" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const settings = await setSeoSettings(
        {
          settingsRepo: deps.settingsRepo,
          clock: deps.clock,
          ids: deps.idGen,
          authorize: deps.authorize,
          principals: deps.principalRepo,
          invalidateSitemap: deps.sitemapService.invalidateSitemapCache,
          media: deps.seoDeps.media,
        },
        { workspaceId: deps.workspaceId, patch: req.body ?? {}, callerPrincipalId: principal.id }
      );
      res.json({ data: settings });
    } catch (err) {
      if (err instanceof SeoSettingsValidationError) {
        res.status(400).json({ error: err.message, code: "SEO_SETTINGS_VALIDATION_ERROR" });
        return;
      }
      sendAdminFailure({ res, error: err }, { operation: "routes/seo/put-settings", code: "INTERNAL_ERROR" });
    }
  });
};

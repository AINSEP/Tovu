import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { getSeoSettings } from "#src/features/seo/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { SeoRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/** GET workspace-level `seo.*` settings (SPEC-008 api.spec.md `SEO_GET_SETTINGS`, tasks.md T047). */
export const registerAdminSeoGetSettingsRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/seo/settings", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      await deps.seoReady;
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.seo.manage", workspaceId: deps.workspaceId, entityType: "seo-settings" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const settings = await getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId });
      res.json({ data: settings });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/seo/get-settings", code: "INTERNAL_ERROR" });
    }
  });
};

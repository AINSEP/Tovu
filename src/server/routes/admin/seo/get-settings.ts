import { getSeoSettings } from "../../../../seo";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { SeoRouteRegistrar } from "./deps";

/** GET workspace-level `seo.*` settings (SPEC-008 api.spec.md `SEO_GET_SETTINGS`, tasks.md T047). */
export const registerAdminSeoGetSettingsRoute: SeoRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/seo/settings", async (req, res) => {
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
        entityType: "seo-settings",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.seo.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.seo.manage", reason: authResult.reason },
        });
        return;
      }

      const settings = await getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId });
      res.json({ data: settings });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};

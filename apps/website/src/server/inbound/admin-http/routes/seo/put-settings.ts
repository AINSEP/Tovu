import { setSeoSettings, SeoSettingsValidationError } from "#src/features/seo/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { SeoRouteRegistrar } from "./deps.js";

/** PUT (partial) workspace-level `seo.*` settings (SPEC-008 api.spec.md `SEO_PUT_SETTINGS`, tasks.md T047). */
export const registerAdminSeoPutSettingsRoute: SeoRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/seo/settings", async (req, res) => {
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

      const settings = await setSeoSettings(
        {
          settingsRepo: deps.settingsRepo,
          clock: deps.clock,
          ids: deps.idGen,
          authorize: deps.authorize,
          principals: deps.principalRepo,
        },
        { workspaceId: deps.workspaceId, patch: req.body ?? {}, callerPrincipalId: principal.id }
      );
      res.json({ data: settings });
    } catch (err) {
      if (err instanceof SeoSettingsValidationError) {
        res.status(400).json({ error: err.message, code: "SEO_SETTINGS_VALIDATION_ERROR" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};

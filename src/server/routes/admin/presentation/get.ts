import {
  getPresentationSettings,
  PresentationSettingsNotFoundError,
} from "#src/features/presentation/index";
import { validThemeIds } from "#src/features/theme/index";
import { toAdminPresentationResponse } from "#src/server/http/admin/presentation";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps";

/**
 * GET presentation settings (active theme + available themes).
 *
 * Gated by the existing `theme.set` permission — there is no dedicated read permission for
 * presentation settings in the catalog, and `activeThemeId` is currently the only field this
 * resource has, so the same permission that gates changing it also gates reading it (same
 * single-permission-per-domain reasoning as `member.manage`). Disclosed explicitly in the
 * Programmer handoff since this reuses a write-shaped permission name for a read route.
 */
export const registerAdminPresentationGetRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/presentation", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "theme.set",
        workspaceId: deps.workspaceId,
        entityType: "presentation",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'theme.set' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "theme.set", reason: authResult.reason },
        });
        return;
      }

      const result = await getPresentationSettings({
        deps: { repo: deps.presentationRepo, availableThemeIds: validThemeIds(deps.themes) },
        input: { workspaceId: deps.workspaceId },
      });

      // Template-picker feature (2026-08-10, unified 2026-08-11) — the active theme's own declared
      // template list, so BOTH the Post editor's and the Pages editor's pickers always reflect
      // whichever theme is actually live right now (one shared field since the unified `content`
      // marker — see `AdminPresentation.activeThemeTemplates`'s own doc).
      const activeTheme = deps.themes.find((t) => t.manifest.id === result.settings.activeThemeId);
      const activeThemeTemplates = activeTheme?.manifest.templates ?? [];
      // Slug-collision override (2026-08-10) — every page id the active theme ships, so the editor
      // can warn when a post's own slug is currently claimed by one of the theme's own pages.
      const activeThemeStaticPageIds = activeTheme ? Object.keys(activeTheme.pages) : [];
      // Themes admin screen (2026-08-10) — tier alongside id for every valid theme, so the Themes
      // screen can group cards by tier without a second round trip. Filtered to `status === "valid"`
      // to match `validThemeIds`'s own filter above (an invalid theme is not one an operator can pick).
      const availableThemes = deps.themes
        .filter((t) => t.status === "valid")
        .map((t) => ({ id: t.manifest.id, tier: t.manifest.tier }));

      res.json(
        toAdminPresentationResponse({
          settings: result.settings,
          availableThemeIds: result.availableThemeIds,
          availableThemes,
          activeThemeTemplates,
          activeThemeStaticPageIds,
        })
      );
    } catch (err) {
      if (err instanceof PresentationSettingsNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};

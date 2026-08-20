import {
  PresentationSettingsNotFoundError,
  PresentationSettingsValidationError,
  setActiveTheme,
} from "#src/features/presentation/index";
import { validThemeIds } from "#src/features/theme/index";
import { toAdminPresentationResponse } from "#src/server/http/admin/presentation";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/**
 * PATCH the active theme.
 *
 * Gated by the existing `theme.set` permission, checked directly via `authorize()` — mirrors
 * `members/disable.ts`'s pattern since `setActiveTheme` is a direct feature call, not routed
 * through the SPEC-001 command gateway.
 */
export const registerAdminPresentationPatchRoute: ContentRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/presentation", async (req, res) => {
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

      const result = await setActiveTheme({
        deps: {
          repo: deps.presentationRepo,
          clock: deps.clock,
          availableThemeIds: validThemeIds(deps.themes),
        },
        input: {
          workspaceId: deps.workspaceId,
          activeThemeId: String(req.body?.activeThemeId ?? ""),
        },
      });

      // Template-picker feature (2026-08-10, unified 2026-08-11) — recomputed from the NEWLY active
      // theme (not the one that was active before this PATCH), so switching themes immediately
      // updates what BOTH pickers offer, matching `get.ts`'s identical computation.
      const activeTheme = deps.themes.find((t) => t.manifest.id === result.settings.activeThemeId);
      const activeThemeTemplates = activeTheme?.manifest.templates ?? [];
      const activeThemeStaticPageIds = activeTheme ? Object.keys(activeTheme.pages) : [];
      // Themes admin screen (2026-08-10) — same computation as `get.ts`, so a theme switch's
      // response keeps the tab-grouping data in sync without a follow-up GET.
      const availableThemes = deps.themes
        .filter((t) => t.status === "valid")
        .map((t) => ({ id: t.manifest.id, tier: t.manifest.tier, apiVersion: t.manifest.apiVersion }));

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
      if (err instanceof PresentationSettingsValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      if (err instanceof PresentationSettingsNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};

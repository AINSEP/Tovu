import {
  getPresentationSettings,
  PresentationSettingsNotFoundError,
  type PresentationSettingsRecord,
} from "#src/features/presentation/index";
import { applicableThemeTemplates, findStoredTheme, validThemeIds, isPackageShippedTheme, type ThemeTemplateKind } from "#src/features/theme/index";
import { themeCardPreviewUrl } from "#src/features/theme/theme-preview-image";
import { themePreviewServiceForHost } from "#src/server/runtime/lifecycle/theme-preview-host";
import { registerAdminThemePreviewRoute } from "../themes/preview.js";
import { toAdminPresentationResponse } from "#src/server/inbound/admin-http/http/presentation";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteDeps, ContentRouteRegistrar } from "../content/deps.js";

function activeThemeResponseFields(
  { themes, settings, kind }: {
    themes: ContentRouteDeps["themes"];
    settings: PresentationSettingsRecord;
    kind?: ThemeTemplateKind;
  },
  _optional: Record<string, never> = {},
) {
  // Template-picker feature (2026-08-10, unified 2026-08-11) — the active theme's own declared
  // template list, so BOTH the Post editor's and the Pages editor's pickers always reflect
  // whichever theme is actually live right now (one shared field since the unified `content`
  // marker — see `AdminPresentation.activeThemeTemplates`'s own doc).
  // `findStoredTheme`, not an exact match: a stored retired id (`basic`, renamed `tovu-theme`)
  // still names the active theme, and the response reports the id the theme list shows.
  const activeTheme = findStoredTheme({ themes, id: settings.activeThemeId });
  // Editors request their kind; catalog callers omit it and retain the full list.
  const activeThemeTemplates = applicableThemeTemplates({ manifest: activeTheme?.manifest, kind });
  // Slug-collision override (2026-08-10) — every page id the active theme ships, so the editor
  // can warn when a post's own slug is currently claimed by one of the theme's own pages.
  const activeThemeStaticPageIds = activeTheme ? Object.keys(activeTheme.pages) : [];
  return {
    settings: activeTheme
      ? { ...settings, activeThemeId: activeTheme.manifest.id }
      : settings,
    activeThemeTemplates,
    activeThemeStaticPageIds,
  };
}

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
  // The image route behind every card URL this listing hands out, registered with it so the two
  // cannot be mounted apart.
  registerAdminThemePreviewRoute({ app, deps });
  app.get("/api/admin/v1/workspaces/:workspaceId/presentation", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const kind = req.query.kind;
      if (kind !== undefined && kind !== "post" && kind !== "page") {
        res.status(400).json({ error: "kind must be 'post' or 'page'" });
        return;
      }
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

      // **Deliberately NOT the write allowlist.** This list is echoed straight back to the client as
      // `AdminPresentation.availableThemeIds` and is what the admin's theme picker renders one card
      // per entry from — it is a READ CATALOGUE of themes an operator can pick, not a set of values
      // the API will accept.
      //
      // `patch-active-theme.ts` passes a DIFFERENT list through an identically-named field: its
      // `writableThemeIds` appends `NO_THEME_ID` so "turn the theme off" is a storable value. That
      // sentinel must never appear HERE — it would render as a blank card in the picker, with no
      // type error, no failing test and no gate to catch it. The two expressions used to be
      // character-for-character identical, which is exactly why this note exists on the side that
      // did not change: a reader reducing duplication in this directory sees two identical calls in
      // sibling files and no reason not to merge them. There is one, and it is this.
      const result = await getPresentationSettings({
        deps: { repo: deps.presentationRepo, availableThemeIds: validThemeIds(deps.themes) },
        input: { workspaceId: deps.workspaceId },
      });

      const { settings, activeThemeTemplates, activeThemeStaticPageIds } = activeThemeResponseFields({
        themes: deps.themes, settings: result.settings, kind,
      });
      // Card previews are captures of each theme's own render where this site can take them (see
      // `routes/themes/preview.ts`); elsewhere the shipped `screenshots/` file, as before.
      const capturesEnabled = deps.siteBinding !== undefined && themePreviewServiceForHost({ binding: deps.siteBinding }) !== undefined;
      // Themes admin screen (2026-08-10) — tier alongside id for every valid theme, so the Themes
      // screen can group cards by tier without a second round trip. Filtered to `status === "valid"`
      // to match `validThemeIds`'s own filter above (an invalid theme is not one an operator can pick).
      // `builtIn` (2026-10-10): a theme the package ships, which the card menu won't offer to delete.
      const availableThemes = deps.themes
        .filter((t) => t.status === "valid")
        .map((t) => ({ id: t.manifest.id, name: t.manifest.name, tier: t.manifest.tier, apiVersion: t.manifest.apiVersion,
          builtIn: isPackageShippedTheme({ manifest: t.manifest, packageThemesRoot: deps.packageThemesDir }),
          previewImageUrl: themeCardPreviewUrl({ theme: { dir: t.dir, id: t.manifest.id, tier: t.manifest.tier }, workspaceId: deps.workspaceId }, { capturesEnabled }) }));

      res.json(
        toAdminPresentationResponse({
          settings,
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

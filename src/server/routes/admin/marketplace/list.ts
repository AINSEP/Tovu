import { listMarketplaceThemes } from "#src/features/theme/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps";

/**
 * GET — list themes installable from the local marketplace fixture (`src/themes/__marketplace__/`;
 * see its README — this is a local stand-in for a remote marketplace, not a real one: no network, no
 * search, no versioning).
 *
 * Gated on `theme.set`, matching every other route on the theme surface (`rescan-themes.ts`,
 * `themes/list.ts`): browsing what COULD be installed changes nothing by itself, but it is part of
 * the same operator surface as installing it, and there is no finer-grained permission for it in the
 * catalog.
 */
export const registerAdminMarketplaceThemesListRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/marketplace/themes", async (req, res) => {
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

      res.json({ themes: listMarketplaceThemes({ themesRoot: deps.themesDir }) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

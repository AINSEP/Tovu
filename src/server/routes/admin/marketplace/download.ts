import { downloadMarketplaceTheme, MarketplaceThemeError } from "#src/features/theme/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/**
 * POST — download one marketplace fixture theme, installing it under a freshly assigned id (see
 * `nextAvailableThemeId`) and rescanning so it is immediately usable without a server restart. See
 * `content/themes/__marketplace__/README.md`: this is a local fixture standing in for a remote
 * marketplace, not a real download — no network call is made.
 *
 * Gated on `theme.set` — the same permission that governs the rest of the theme surface. Installing a
 * theme is a stronger action than `rescan-themes.ts`'s re-scan, but there is no finer-grained
 * permission for it in the catalog, matching that route's identical disclosed reuse.
 */
export const registerAdminMarketplaceThemeDownloadRoute: ContentRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/marketplace/themes/:themeId/download", async (req, res) => {
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

      const result = downloadMarketplaceTheme({
        themesRoot: deps.themesDir,
        themes: deps.themes,
        marketplaceId: String(req.params.themeId ?? ""),
      });

      res.json({
        id: result.assignedId,
        suffixed: result.suffixed,
        tier: result.tier,
        lineage: result.lineage,
        rescan: result.rescan,
      });
    } catch (err) {
      if (err instanceof MarketplaceThemeError) {
        res.status(err.code === "NOT_FOUND" ? 404 : 400).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};

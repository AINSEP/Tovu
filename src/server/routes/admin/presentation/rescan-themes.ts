import { duplicateThemeIds, rescanThemes, validThemeIds } from "#src/features/theme/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/**
 * POST — re-run theme discovery against the themes directory.
 *
 * Exists because discovery is otherwise a boot-time snapshot (see `rescanThemes`), so a theme that
 * arrives on disk after startup is invisible until the process restarts. Two different things put
 * one there: an in-app action (download from the marketplace, copy an original), which should rescan
 * on its own without anyone asking, and an out-of-band change (git pull, our own CLI, a folder
 * dropped in by hand), which nothing can hook — that second case is what this route is for, and why
 * the admin needs a visible control rather than only an implicit refresh.
 *
 * Gated on `theme.set`, matching the GET and PATCH on this same resource: rescanning cannot change
 * what any theme contains, but it changes which themes an operator can activate, so it belongs with
 * the permission that governs the theme surface rather than being left ungated.
 *
 * Reports `added`/`removed` rather than a bare 204 — a rescan that found nothing looks exactly like a
 * rescan that never ran, and "I pressed it and nothing happened" is the whole failure this route is
 * meant to end.
 */
export const registerAdminThemeRescanRoute: ContentRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/themes/rescan", async (req, res) => {
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

      const changed = rescanThemes({ themes: deps.themes, dir: deps.themesDir });

      res.json({
        added: changed.added,
        removed: changed.removed,
        total: changed.total,
        availableThemeIds: validThemeIds(deps.themes),
        // Two themes can claim the same id (ids are unique per folder, not globally), in which case
        // the site silently renders whichever sorts first. Reported here rather than swallowed,
        // because a rescan is exactly when a colliding theme most likely just arrived.
        duplicateIds: duplicateThemeIds(deps.themes),
      });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { duplicateThemeIds, rescanThemes, validThemeIds } from "#src/features/theme/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/**
 * POST — re-run theme discovery against the themes directory.
 *
 * Exists because discovery is otherwise a boot-time snapshot (see `rescanThemes`), so a theme that
 * arrives on disk after startup is invisible until the process restarts. Two different things put
 * one there: an in-app action (copy an original), which should rescan
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
export const registerAdminThemeRescanRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/themes/rescan", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "theme.set", workspaceId: deps.workspaceId, entityType: "presentation" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const changed = rescanThemes({ themes: deps.themes, dir: deps.themesDir });

      res.json({
        added: changed.added,
        removed: changed.removed,
        total: changed.total,
        availableThemeIds: validThemeIds({ themes: deps.themes }),
        // Two themes can claim the same id (ids are unique per folder, not globally), in which case
        // the site silently renders whichever sorts first. Reported here rather than swallowed,
        // because a rescan is exactly when a colliding theme most likely just arrived.
        duplicateIds: duplicateThemeIds({ themes: deps.themes }),
      });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/presentation/rescan-themes", code: "INTERNAL_ERROR" });
    }
  });
};

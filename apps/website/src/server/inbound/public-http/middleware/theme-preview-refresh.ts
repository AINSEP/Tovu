import { isReservedThemePreviewPath } from "#src/features/theme/preview-policy";
import type { Express, RequestHandler } from "express";
import { requestThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import { syncThemeRoster } from "@jini-ai/cms/themes/preview/roster";
import { themeRosterPorts } from "#src/features/theme/theme-roster-ports";
import { requireAdminSession, getAuthedPrincipal } from "../../admin-http/dev-auth.js";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { RouteDeps } from "#src/server/routes/types";
import { asyncRoute } from "../../../../platform/express/async-route.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import {
  createPreviewRevisionCache,
  freshThemePreviewHtml,
  isThemeAssetPath,
  previewRevisionOf,
  runThemePreviewReload,
} from "@jini-ai/cms/public-http/middleware/theme-preview-refresh";

/**
 * A query token opts into authenticated preview rendering; ordinary public caching is untouched.
 *
 * `syncThemes` runs ahead of EVERY request except a theme asset's — public pages, the admin API
 * (the Themes screen lists the roster; the active-theme PATCH validates against it) and previews
 * alike — and must be a cheap no-op when nothing changed (`syncThemeRoster`). It used to run for
 * public GETs only and to re-load just the themes this process already had, which is how a theme the
 * agent daemon created and activated stayed unknown here until a manual Rescan (2026-10-08). Asset
 * requests skip it: a page load fans out into dozens of them, and the page request ahead of them has
 * already synced.
 */
export function createThemePreviewMiddleware(
  { authenticate, syncThemes, rememberRevision }: { authenticate: RequestHandler; syncThemes: () => void; rememberRevision?: (required: { revision: string }, optional: {}) => void },
  _optional: Record<string, never> = {},
): RequestHandler {
  return (req, res, next) => {
    const isAsset = isThemeAssetPath({ path: req.path });
    const revision = previewRevisionOf({ value: req.query.__tovu_preview });
    if (revision === undefined) {
      try {
        // The outer desktop guest uses public URLs. Daemon writes must update its render maps too,
        // while visitor caching and the asset response bytes keep their ordinary public behavior.
        if (!isAsset) syncThemes();
      } catch (error) { next(error); return; }
      next();
      return;
    }
    authenticate(req, res, (error?: unknown) => {
      if (error) {
        next(error);
        return;
      }
      try {
        // The daemon and external editors do not update this process's boot-time source maps.
        if (!isAsset) syncThemes();
        rememberRevision?.({ revision }, {});
        res.locals ??= {};
        res.locals.themePreviewRevision = revision;
        const send = res.send.bind(res);
        res.send = (body: unknown) => {
          // Public routes set their cache policy later; force preview policy at the final send.
          res.set("Cache-Control", "no-store");
          return send(typeof body === "string" && !isAsset ? freshThemePreviewHtml({ html: body, revision }) : body);
        };
        next();
      } catch (error) {
        next(error);
      }
    });
  };
}

export function registerThemePreviewRefresh(
  { app, deps }: { app: Express; deps: RouteDeps },
  _optional: Record<string, never> = {},
): (required: { revision: string }, optional?: {}) => boolean {
  const authenticatedRevisions = createPreviewRevisionCache({ limit: 512 });
  app.use(
    createThemePreviewMiddleware({
      authenticate: requireAdminSession(deps),
      rememberRevision: ({ revision }) => authenticatedRevisions.remember({ revision }),
      syncThemes: () => {
        syncThemeRoster({ ...themeRosterPorts, themes: deps.themes, themesDir: deps.themesDir });
      },
    }),
  );
  app.post(
    "/api/admin/v1/workspaces/:workspaceId/themes/preview-reload",
    requireAdminSession(deps),
    asyncRoute({ handler: async (req, res) => {
      if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;
      const principal = getAuthedPrincipal(res);
      const outcome = await runThemePreviewReload({
        principalId: principal.id,
        workspaceId: deps.workspaceId,
        authorize: (required) => deps.authorize(required),
        refresh: () => requestThemePreviewRefresh({ themesDir: deps.themesDir, isReservedPath: isReservedThemePreviewPath }),
      });
      if (outcome.kind === "forbidden") res.status(403).json(outcome.body);
      else if (outcome.kind === "reloaded") res.json(outcome.body);
      else sendAdminFailure({ res, error: outcome.error }, { operation: "theme-preview:refresh", message: "The preview could not be reloaded." });
    } }),
  );
  return ({ revision }) => authenticatedRevisions.has({ revision });
}

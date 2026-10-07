import type { Express, RequestHandler } from "express";
import { loadTheme, requestThemePreviewRefresh } from "#src/features/theme/index";
import { requireAdminSession, getAuthedPrincipal } from "../../admin-http/dev-auth.js";
import type { RouteDeps } from "#src/server/routes/types";

/** Unique asset directory also versions relative CSS imports, url() assets and JS module imports. */
export function freshThemePreviewHtml(
  { html, revision }: { html: string; revision: string },
  _optional: Record<string, never> = {},
): string {
  return html.replaceAll("/theme-assets/", `/theme-preview-assets/${encodeURIComponent(revision)}/`);
}

/** A query token opts into authenticated preview rendering; ordinary public caching is untouched. */
export function createThemePreviewMiddleware(
  { authenticate, refreshThemes }: { authenticate: RequestHandler; refreshThemes: () => void },
  _optional: Record<string, never> = {},
): RequestHandler {
  return (req, res, next) => {
    const revision = req.query.__tovu_preview;
    if (typeof revision !== "string" || !/^[\w-]{1,100}$/.test(revision)) {
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
        refreshThemes();
        const send = res.send.bind(res);
        res.send = (body: unknown) => {
          // Public routes set their cache policy later; force preview policy at the final send.
          res.set("Cache-Control", "no-store");
          return send(typeof body === "string" ? freshThemePreviewHtml({ html: body, revision }) : body);
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
): void {
  app.use(
    createThemePreviewMiddleware({
      authenticate: requireAdminSession(deps),
      refreshThemes: () => {
        for (let index = 0; index < deps.themes.length; index++) {
          const theme = deps.themes[index];
          deps.themes[index] = loadTheme({
            themeDir: theme.dir,
            id: theme.manifest.id,
            source: theme.source,
          });
        }
      },
    }),
  );
  app.post(
    "/api/admin/v1/workspaces/:workspaceId/themes/preview-reload",
    requireAdminSession(deps),
    async (req, res) => {
      if (String(req.params.workspaceId) !== deps.workspaceId) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }
      const principal = getAuthedPrincipal(res);
      const auth = await deps.authorize({
        principalId: principal.id,
        workspaceId: deps.workspaceId,
        permission: "theme.set",
        entityType: "theme",
      });
      if (!auth.allowed) {
        res.status(403).json({ error: "not authorized for 'theme.set'" });
        return;
      }
      try {
        res.json(requestThemePreviewRefresh({ themesDir: deps.themesDir }));
      } catch {
        res.status(500).json({ error: "preview reload failed" });
      }
    },
  );
}

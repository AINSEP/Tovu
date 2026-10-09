import type { Express, RequestHandler } from "express";
import { requestThemePreviewRefresh, syncThemeRoster } from "#src/features/theme/index";
import { requireAdminSession, getAuthedPrincipal } from "../../admin-http/dev-auth.js";
import type { RouteDeps } from "#src/server/routes/types";

/** Unique asset directory also versions relative CSS imports, url() assets and JS module imports. */
export function freshThemePreviewHtml(
  { html, revision }: { html: string; revision: string },
  _optional: Record<string, never> = {},
): string {
  return html.replaceAll("/theme-assets/", `/theme-preview-assets/${encodeURIComponent(revision)}/`);
}

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
    const isAsset = /^\/(?:theme-assets|theme-preview-assets)(?:\/|$)/.test(req.path ?? "");
    const revision = req.query.__tovu_preview;
    if (typeof revision !== "string" || !/^[\w-]{1,100}$/.test(revision)) {
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
  // Asset loads from sandboxed previews may omit cookies (fonts use anonymous CORS). The
  // authenticated document establishes the namespace; only that namespace rewrites public CSS.
  const authenticatedRevisions = new Set<string>();
  app.use(
    createThemePreviewMiddleware({
      authenticate: requireAdminSession(deps),
      rememberRevision: ({ revision }) => {
        authenticatedRevisions.add(revision);
        if (authenticatedRevisions.size > 512) authenticatedRevisions.delete(authenticatedRevisions.values().next().value!);
      },
      syncThemes: () => {
        syncThemeRoster({ themes: deps.themes, themesDir: deps.themesDir });
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
  return ({ revision }) => authenticatedRevisions.has(revision);
}

import { getPresentationSettings } from "../../../features/presentation";
import { getPublishedPostBySlug, listPublishedPosts, PostNotFoundError } from "../../../features/post";
import { findTheme, type DiscoveredTheme } from "../../../features/theme";
import { renderSite } from "../../http/site/render";
import type { RouteDeps, RouteRegistrar } from "../types";

const SITE_TITLE = "Tovu Demo Site";

/**
 * Resolve the theme to render with: the active theme when discovered and valid,
 * otherwise the first valid theme, otherwise the first discovered theme. This is
 * the render-time fallback that keeps the public site from 500-ing when the
 * active theme id is missing/invalid (SPEC-004 REQ-10, spike-level).
 */
function resolveActiveTheme(deps: RouteDeps, activeThemeId: string): DiscoveredTheme | null {
  const active = findTheme(deps.themes, activeThemeId);
  if (active && active.status === "valid") return active;
  return deps.themes.find((t) => t.status === "valid") ?? deps.themes[0] ?? null;
}

/**
 * Public site: server-rendered home and post pages through the active
 * declarative theme. Registered LAST — GET /:slug is a catch-all for
 * single-segment paths.
 */
export const registerSiteRoutes: RouteRegistrar = (app, deps) => {
  app.get("/", async (_req, res) => {
    try {
      const [{ posts }, settings] = await Promise.all([
        listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
      ]);

      const theme = resolveActiveTheme(deps, settings.settings.activeThemeId);
      if (!theme) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }

      res.type("html").send(renderSite({ theme, route: "home", siteTitle: SITE_TITLE, posts }));
    } catch {
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });

  app.get("/:slug", async (req, res, next) => {
    const slug = String(req.params.slug ?? "");
    // Not a site page — let API/static/404 handling continue.
    if (!slug.match(/^[a-z0-9-]+$/) || slug === "admin" || slug === "api") {
      next();
      return;
    }

    try {
      const [{ post }, settings, { posts }] = await Promise.all([
        getPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug } }),
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
        listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
      ]);

      const theme = resolveActiveTheme(deps, settings.settings.activeThemeId);
      if (!theme) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }

      res.type("html").send(renderSite({ theme, route: "post", siteTitle: SITE_TITLE, posts, post }));
    } catch (err) {
      if (err instanceof PostNotFoundError) {
        res.status(404).type("html").send("<h1>404 — page not found</h1><p><a href='/'>Home</a></p>");
        return;
      }
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });
};

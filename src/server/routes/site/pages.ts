import { getPresentationSettings } from "../../../features/presentation";
import { getPublishedPostBySlug, listPublishedPosts, PostNotFoundError } from "../../../features/post";
import { renderHomePage, renderPostPage } from "../../http/site/render";
import type { RouteRegistrar } from "../types";

const SITE_TITLE = "Tovu Demo Site";

/**
 * Public dummy site: server-rendered home and post pages using the active
 * theme. Registered LAST — GET /:slug is a catch-all for single-segment paths.
 */
export const registerSiteRoutes: RouteRegistrar = (app, deps) => {
  app.get("/", async (_req, res) => {
    try {
      const [{ posts }, settings] = await Promise.all([
        listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
      ]);
      res
        .type("html")
        .send(renderHomePage({ posts, themeId: settings.settings.activeThemeId, siteTitle: SITE_TITLE }));
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
      const [{ post }, settings] = await Promise.all([
        getPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug } }),
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
      ]);
      res
        .type("html")
        .send(renderPostPage({ post, themeId: settings.settings.activeThemeId, siteTitle: SITE_TITLE }));
    } catch (err) {
      if (err instanceof PostNotFoundError) {
        res.status(404).type("html").send("<h1>404 — page not found</h1><p><a href='/'>Home</a></p>");
        return;
      }
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });
};

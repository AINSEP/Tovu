import { getPresentationSettings } from "../../../features/presentation";
import { getPublishedPostBySlug, listPublishedPosts, PostNotFoundError } from "../../../features/post";
import { findTheme, type DiscoveredTheme } from "../../../features/theme";
import { resolvePageWidgets, type ResolvePageWidgetsResult } from "../../../widgets/resolver-service";
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
 * SPEC-043/ADR-047 W-004 — resolves every widget placed in one of `theme.manifest.regions` (REQ-13)
 * ahead of `renderSite`, per REQ-23. `render.ts` stays a pure "resolved data -> HTML" renderer (it
 * receives `posts`/`post` pre-resolved the exact same way); this is the one call site, mirroring
 * the outline's Wiring Map row W-004. `resolvePageWidgets` itself never throws (REQ-27) — no extra
 * try/catch needed beyond the route handler's own existing one.
 *
 * `pageEntryId` is always omitted here: `PostRecord` (`features/post`) is a separate, pre-ADR-022
 * table, not an `entries` row `EntryRepoPort.findById` can resolve — so inline `widgetEmbed`
 * resolution (REQ-21) has no reachable target on the live `home`/`post` routes yet. A
 * `widgetEmbed` node authored into a post's body today (the TipTap extension has no per-content-type
 * gate) still renders safely — `renderDocNode`'s `widgetEmbed` case degrades any unresolved
 * reference to the REQ-28 public-safe placeholder, never a crash or a raw attrs dump — but does not
 * resolve to real content until a generic `entries`-backed site route exists to supply a real
 * `pageEntryId`. Disclosed, not silently assumed away (implementation-outline-addendum.md Finding 1b).
 */
async function resolveWidgetsForRender(deps: RouteDeps, theme: DiscoveredTheme): Promise<ResolvePageWidgetsResult> {
  return resolvePageWidgets({
    deps: { bindingRepo: deps.widgetBindingRepo, entryRepo: deps.entryRepo },
    input: { workspaceId: deps.workspaceId, resolvedRegions: theme.manifest.regions ?? [] },
  });
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

      const widgets = await resolveWidgetsForRender(deps, theme);
      res.type("html").send(await renderSite({ theme, route: "home", siteTitle: SITE_TITLE, posts, widgets }));
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

      const widgets = await resolveWidgetsForRender(deps, theme);
      res.type("html").send(await renderSite({ theme, route: "post", siteTitle: SITE_TITLE, posts, post, widgets }));
    } catch (err) {
      if (err instanceof PostNotFoundError) {
        res.status(404).type("html").send("<h1>404 — page not found</h1><p><a href='/'>Home</a></p>");
        return;
      }
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });
};

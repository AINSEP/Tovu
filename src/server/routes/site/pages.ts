import type { Response } from "express";

import type { PostRecord } from "../../../features/post";
import { getPresentationSettings } from "../../../features/presentation";
import { getPublishedPostBySlug, listPublishedPosts, PostNotFoundError } from "../../../features/post";
import { findTheme, type DiscoveredTheme } from "../../../features/theme";
import { runPostContentPhase, runPreContentPhase, urlFor } from "../../../routing";
import { foldPageHead, serializeHeadElements, type PageHeadContext } from "../../http/site/page-head";
import { renderSite } from "../../http/site/render";
import type { RouteDeps, RouteRegistrar } from "../types";

/**
 * SPEC-008 T049 — builds the `PageHeadContext` for one render (home has no
 * `entry`; the post route's `entry` is a serializable snapshot per
 * `page-head.ts`'s own "by value, not a live PostRecord" contract) and folds
 * every registered `page.head` contributor's output into one escaped string
 * ready for `renderSite`'s `extraHead`. Never throws — `foldPageHead` itself
 * is fail-closed-per-contributor (a broken SEO lookup degrades to no extra
 * head tags, never a 500).
 */
async function buildExtraHead(
  deps: RouteDeps,
  route: "home" | "post",
  siteTitle: string,
  post: PostRecord | undefined
): Promise<string> {
  const canonical = post
    ? (await urlFor({ deps: { postRepo: deps.postRepo }, target: { kind: "entryRef", entryId: post.id, contentType: post.kind }, ctx: { workspaceId: deps.workspaceId } }))?.canonicalUrl
    : undefined;

  const ctx: PageHeadContext = {
    workspaceId: deps.workspaceId,
    route,
    siteTitle,
    canonicalUrl: canonical ?? (post ? `/${post.slug}` : "/"),
    entry: post
      ? {
          id: post.id,
          type: post.kind,
          slug: post.slug,
          title: post.title,
          status: post.status,
          updatedAt: post.updatedAt,
          ext: {},
        }
      : undefined,
  };

  const elements = await foldPageHead(ctx);
  return serializeHeadElements(elements);
}

/**
 * SPEC-009 (Redirects) REQ-18/19: run the registered `pre_content` phase
 * (redirect rules with `overrideContent: true`) before any content lookup,
 * and `post_content` (the default case) only after a content lookup has
 * failed — the exact `pre_content -> content-resolve -> post_content` order
 * ADR-039 §1 documents. Issues the redirect and returns `true` if a phase
 * matched; the caller falls through to its own content/404 handling on `false`.
 */
async function tryRedirectPhase(
  phase: "pre_content" | "post_content",
  path: string,
  workspaceId: string,
  res: Response
): Promise<boolean> {
  const outcome =
    phase === "pre_content"
      ? await runPreContentPhase(path, { workspaceId })
      : await runPostContentPhase(path, { workspaceId });
  if (!outcome || outcome.kind !== "redirect") return false;
  res.redirect(outcome.statusCode, outcome.location);
  return true;
}

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
  app.get("/", async (req, res) => {
    try {
      if (await tryRedirectPhase("pre_content", req.path, deps.workspaceId, res)) return;

      const [{ posts }, settings] = await Promise.all([
        listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
      ]);

      const theme = resolveActiveTheme(deps, settings.settings.activeThemeId);
      if (!theme) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }

      const extraHead = await buildExtraHead(deps, "home", SITE_TITLE, undefined);
      res.type("html").send(renderSite({ theme, route: "home", siteTitle: SITE_TITLE, posts, extraHead }));
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
      if (await tryRedirectPhase("pre_content", req.path, deps.workspaceId, res)) return;

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

      const extraHead = await buildExtraHead(deps, "post", SITE_TITLE, post);
      res.type("html").send(renderSite({ theme, route: "post", siteTitle: SITE_TITLE, posts, post, extraHead }));
    } catch (err) {
      if (err instanceof PostNotFoundError) {
        if (await tryRedirectPhase("post_content", req.path, deps.workspaceId, res)) return;
        res.status(404).type("html").send("<h1>404 — page not found</h1><p><a href='/'>Home</a></p>");
        return;
      }
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });
};

import type { Response } from "express";

import type { PostRecord } from "#src/features/post/index";
import { getPresentationSettings } from "#src/features/presentation/index";
import { getPublishedPostBySlug, listPublishedPosts, PostNotFoundError } from "#src/features/post/index";
import { isPublicAssistantEnabled } from "#src/assistant/public-assistant-settings";
import { findTheme, type DiscoveredTheme } from "#src/features/theme/index";
import {
  resolveHtmlPageEmbeds,
  resolvePageWidgets,
  type ResolveHtmlPageEmbedsResult,
  type ResolvePageWidgetsResult,
} from "#src/widgets/resolver-service";
import { runPostContentPhase, runPreContentPhase, urlFor } from "#src/routing/index";
import { getLatestTransformDefinition } from "#src/media/index";
import { CORE_PUBLIC_TRANSFORM_NAME } from "#src/media/bootstrap";
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
  const active = findTheme({ themes: deps.themes, id: activeThemeId });
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
 * SPEC-047 Slice 2 — resolves an `"html"`-format Page's `data-widget-embed`/`data-form-embed`
 * placeholders ahead of `renderSite`, mirroring `resolveWidgetsForRender`'s own "route resolves,
 * `render.ts` stays I/O-free" split immediately above. `undefined` for a `"doc"` post (nothing to
 * resolve — `renderSite`'s `pageHtmlEmbeds` param is optional for exactly this case) so this is a
 * no-op call on every route/render that isn't an html Page.
 */
async function resolveHtmlEmbedsForRender(deps: RouteDeps, post: PostRecord | undefined): Promise<ResolveHtmlPageEmbedsResult | undefined> {
  if (!post || post.bodyFormat !== "html") return undefined;
  return resolveHtmlPageEmbeds({
    deps: { entryRepo: deps.entryRepo },
    input: { workspaceId: deps.workspaceId, html: post.bodyHtml ?? "" },
  });
}

/**
 * ADR-027 §4 — resolves the latest registered version of the one core transform NAME a
 * ref-based `{assetId, transformName}` image node can use today
 * (`CORE_PUBLIC_TRANSFORM_NAME`, `media/bootstrap.ts`), ahead of `renderSite`. Mirrors
 * `resolveWidgetsForRender`'s "route resolves, `render.ts` stays I/O-free" split — this is the
 * ONE call site for media resolution, same shape as that function's own doc.
 *
 * Deliberately does NOT scan `post.bodyJson` for every distinct `transformName` an author's doc
 * might reference (the way `resolveHtmlPageEmbeds` scans a Page's `body_html` for embed ids):
 * `registerTransform` has exactly one caller anywhere in this codebase
 * (`ensureCoreMediaTransform`, `server/deps.ts`'s boot chain), which only ever registers
 * `CORE_PUBLIC_TRANSFORM_NAME` — there is no OTHER registered name a real ref could resolve
 * against yet, so a single-name lookup is behavior-identical to a full scan at today's real
 * scale. A second core-declared transform (`thumb`, `hero`, ...) would need this widened to a
 * real scan, same as the widget/html-embed resolvers already do for their own multi-id case —
 * disclosed here rather than silently assumed permanent.
 *
 * Returns an empty map (not a thrown error) when the transform is not yet registered (a
 * mid-boot race, or a workspace this hasn't run for) — `renderDocNode`'s `image` case already
 * treats a missing map entry as "not resolvable" and degrades to the placeholder, so this
 * function never needs its own try/catch beyond the route handler's existing one.
 */
async function resolveMediaTransformVersionsForRender(deps: RouteDeps): Promise<ReadonlyMap<string, number>> {
  const definition = await getLatestTransformDefinition({
    deps: { transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, name: CORE_PUBLIC_TRANSFORM_NAME },
  });
  return definition ? new Map([[CORE_PUBLIC_TRANSFORM_NAME, definition.version]]) : new Map();
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

      const [{ posts }, settings, siteAssistantEnabled] = await Promise.all([
        listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
        // ADR-054 — the visitor-chat master switch. `render.ts` never reads settings itself; every
        // route that calls `renderSite` resolves this the same way (see `pages.ts`'s other handler
        // and `products.ts`'s two handlers).
        isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId }),
      ]);

      const theme = resolveActiveTheme(deps, settings.settings.activeThemeId);
      if (!theme) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }

      const [widgets, mediaTransformVersions, extraHead] = await Promise.all([
        resolveWidgetsForRender(deps, theme),
        resolveMediaTransformVersionsForRender(deps),
        buildExtraHead(deps, "home", SITE_TITLE, undefined),
      ]);
      res.type("html").send(
        await renderSite({ theme, route: "home", siteTitle: SITE_TITLE, posts, widgets, mediaTransformVersions, extraHead, siteAssistantEnabled }),
      );
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

      const [{ post }, settings, { posts }, siteAssistantEnabled] = await Promise.all([
        getPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug } }),
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
        listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
        isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId }),
      ]);

      const theme = resolveActiveTheme(deps, settings.settings.activeThemeId);
      if (!theme) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }

      const [widgets, pageHtmlEmbeds, mediaTransformVersions, extraHead] = await Promise.all([
        resolveWidgetsForRender(deps, theme),
        resolveHtmlEmbedsForRender(deps, post),
        resolveMediaTransformVersionsForRender(deps),
        buildExtraHead(deps, "post", SITE_TITLE, post),
      ]);
      res.type("html").send(
        await renderSite({ theme, route: "post", siteTitle: SITE_TITLE, posts, post, widgets, pageHtmlEmbeds, mediaTransformVersions, extraHead, siteAssistantEnabled }),
      );
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

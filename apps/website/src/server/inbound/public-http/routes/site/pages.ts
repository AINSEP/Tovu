import type { NextFunction, Request, Response } from "express";
import type { JsonObject } from "@jini-ai/cms/core";

import type { PostRecord } from "#src/features/post/index";
import { getPublishedPostBySlug, findPublishedPostById, listPublishedPosts, PostNotFoundError } from "#src/features/post/index";
import { isPublicAssistantEnabled } from "#src/assistant/index";
import { resolveActiveThemeId } from "#src/features/presentation/index";
import {
  renderStaticPage,
  injectCurrentEntityContentId,
  injectPageTitle,
  resolveTemplate,
  isEligibleForTemplateBranch,
  scanMenuEmbedIds,
  resolveActiveTheme,
  tokenStylesheetSentinel,
  isStandaloneThemePage,
  type DiscoveredTheme,
  type StaticMenuItem,
} from "#src/features/theme/index";
import { markersOfType, substituteMarkers, withInnerContentFinal } from "#src/contracts/core/embeds/marker";
import {
  resolveHtmlPageEmbeds,
  resolvePageWidgets,
  type ResolveHtmlPageEmbedsResult,
  type ResolvePageWidgetsResult,
} from "#src/features/widgets/resolver-service";
import { runPostContentPhase, runPreContentPhase, urlFor } from "#src/platform/routing/index";
import type { RouteTarget } from "#src/platform/routing/index";
import { resolveMenuDoc } from "#src/features/navigation/index";
import type { NavTarget, ResolveTargetHrefFn } from "#src/features/navigation/index";
import { getLatestTransformDefinition } from "#src/features/media/index";
import { CORE_PUBLIC_TRANSFORM_NAME } from "#src/features/media/index";
import { foldPageHead, serializeHeadElements, type PageHeadContext } from "../../http/site/page-head.js";
import {
  renderSite,
  renderHtmlPageBody,
  injectExtraHeadIntoStaticPage,
  injectSiteAssistantIntoStaticPage,
  decodeFormSubmissionResultFromQuery,
  injectFormSubmissionResultIntoHtml,
  decodeFormFlashCookieValue,
  mergeFormFlashIntoResult,
  FORM_FLASH_COOKIE_NAME,
  type FormSubmissionRedirectResult,
  type MediaAssetRenderMeta,
} from "../../http/site/render.js";
import { isHttpsRequest } from "../oauth/public-origin.js";
import type { RouteDeps, RouteRegistrar } from "#src/server/routes/types";

/**
 * SPEC-008 T049 — builds the `PageHeadContext` for one render (home/page have
 * no `entry`; the post route's `entry` is a serializable snapshot per
 * `page-head.ts`'s own "by value, not a live PostRecord" contract) and folds
 * every registered `page.head` contributor's output into one escaped string
 * ready for `renderSite`'s `extraHead`. Never throws — `foldPageHead` itself
 * is fail-closed-per-contributor (a broken SEO lookup degrades to no extra
 * head tags, never a 500).
 *
 * `"page"` (2026-08-19, SPEC-008 T045 gap fix part 2) — a static theme's own
 * marketing page (`theme.pages[slug]`) has no backing `PostRecord` at all, so
 * it folds the same entry-less shape `"home"` always has (site-level title +
 * canonical only, per `createSeoPageHeadHook`'s `!ctx.entry` branch — there is
 * no per-page SEO metadata to resolve without an entry, a disclosed limit of
 * today's SEO data model, not something this fix invents). The one thing that
 * DOES differ from `"home"` is the canonical path: `"/"` is only correct for
 * the home route itself, so `canonicalFallbackPath` lets a `"page"` caller
 * supply its own (`/${slug}`) instead of silently reusing home's `"/"`.
 * Ignored whenever `post` is provided (its own resolved/derived slug path
 * always wins), so every pre-existing `"home"`/`"post"` call site is
 * unaffected by this parameter's addition.
 */
async function buildExtraHead(
  deps: RouteDeps,
  route: "home" | "post" | "page",
  siteTitle: string,
  post: PostRecord | undefined,
  canonicalFallbackPath: string = "/"
): Promise<string> {
  const canonical = post
    ? (await urlFor({ deps: { postRepo: deps.postRepo }, target: { kind: "entryRef", entryId: post.id, contentType: post.kind }, ctx: { workspaceId: deps.workspaceId } }))?.canonicalUrl
    : undefined;

  const ctx: PageHeadContext = {
    workspaceId: deps.workspaceId,
    route,
    siteTitle,
    canonicalUrl: canonical ?? (post ? `/${post.slug}` : canonicalFallbackPath),
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
  // `outcome.kind !== "redirect"` has two type-level arms — `"resolved"` and `"not_found"`
  // (`RouteResolvePhaseOutcome`, routing/types.ts) — but only one is reachable through this
  // codebase's real registrants today: `registerResolvePhase` (routing.ts) has exactly one
  // non-test caller repo-wide, `registerRedirectsPhaseHandlers` (redirects/phase-handler.ts),
  // whose own `toOutcome` is the ONLY constructor of this type anywhere in the tree and returns
  // only `null` or `{ kind: "redirect", ... }` — never `"resolved"`/`"not_found"`. Testing that
  // sub-arm would require pushing a resolver onto `registerResolvePhase`'s module-level,
  // append-only `phaseRegistry` (no unregister exists) from a test, permanently polluting every
  // other test sharing this process for the rest of the run — a worse trade than leaving this
  // documented rather than covered. A future SECOND registrant that legitimately returns
  // `"resolved"`/`"not_found"` would make this reachable again; this comment is the disclosure,
  // not a claim that it can never happen.
  if (!outcome || outcome.kind !== "redirect") return false;
  res.redirect(outcome.statusCode, outcome.location);
  return true;
}

/** Exported (2026-08-12, `.liquid` Preview-tab fix) so `middleware/theme-page-preview.ts`'s
 *  templated-theme preview route renders with the SAME site title text a live visitor would see —
 *  a template that reads `site.title`/`ctx.siteTitle` should preview identically to how it renders
 *  live, not under a stand-in string this file's own callers don't use. */
export const SITE_TITLE = "Tovu Demo Site";

/**
 * Owner decision (TM-TOVU-2026-08-12-A request-cost audit, Phase 2 change 2 of 2). Applied to every
 * success response this file sends — home, the static-theme-page short-circuit, the template
 * branch, and the generic dynamic post render — because all four share the SAME cacheability
 * property the audit's deliverable A proved empirically: none of `resolveWidgetsForRender`/
 * `buildExtraHead`/`resolveStaticMenusForRender`/`renderViaTemplate`/`renderSite` even receive `req`
 * as an argument, so the output is identical for every anonymous visitor requesting the same URL —
 * confirmed by diffing real responses across different cookies/Accept-Language headers, not assumed.
 *
 * `max-age=60`: an edit becomes publicly visible within a minute. `stale-while-revalidate=300`: a
 * CDN can serve a slightly-stale copy while it revalidates in the background, absorbing traffic
 * spikes without a thundering-herd re-render. 5 minutes (rather than 60s) for the base `max-age` was
 * considered and rejected — long enough that an author fixing a typo would reasonably think their
 * edit hadn't saved.
 *
 * Deliberately NOT applied to error responses (404/500) in this file — a fresh render is generally
 * the same page again, but a 500 is exactly the response a CDN must never cache as if it were
 * durable, and 404 caching wasn't part of what the audit measured or the owner decided on.
 */
const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

/**
 * `resolveActiveThemeId`/`resolveActiveTheme` moved out of this file 2026-08-16 — both were pure
 * `(deps) => value` queries with zero `req`/`res` coupling, and living here forced `export/
 * route-manifest.ts` to import a routing-layer file just to reuse them (a `check:architecture`-
 * flagged runtime edge into the composition-root module; see `ADS-memory/reports/
 * 2026-08-16-export-edge-decoupling.md`). Different homes, not the same one — `resolveActiveThemeId`
 * has zero theme-data dependency (it only reads presentation settings) so it moved to
 * `#src/features/presentation/index` (`active-theme-id.ts`); `resolveActiveTheme` genuinely needs
 * theme data (`findTheme`/`DiscoveredTheme`) so it moved to `#src/features/theme/index`
 * (`active-theme.ts`). Splitting them, rather than bundling both into one file because every real
 * call site uses them together, avoided a measured `check:architecture` regression a combined home
 * would have caused — see `active-theme.ts`'s own file header for the SCC trace. Both re-exported
 * below, unchanged in behavior, so `routes/admin/posts/template-preview.ts`'s existing
 * `from "../../site/pages"` import of `resolveActiveTheme` keeps working — only `route-manifest.ts`
 * was updated to import both new homes directly.
 */
export { resolveActiveThemeId, resolveActiveTheme };

/**
 * SPEC-043/ADR-047 W-004 — resolves every widget placed in one of `theme.manifest.regions` (REQ-13)
 * ahead of `renderSite`, per REQ-23, PLUS (2026-08-05 fix) any inline `widgetEmbed` node in `post`'s
 * own `bodyJson` when rendering a real post. `render.ts` stays a pure "resolved data -> HTML"
 * renderer (it receives `posts`/`post` pre-resolved the exact same way); this is the one call site,
 * mirroring the outline's Wiring Map row W-004. `resolvePageWidgets` itself never throws (REQ-27) —
 * no extra try/catch needed beyond the route handler's own existing one.
 *
 * Was previously always omitted: `resolvePageWidgets` took a `pageEntryId` to fetch via
 * `EntryRepoPort.findById`, but `PostRecord` (`features/post`) is a separate, pre-ADR-022 table no
 * `entries` lookup can ever resolve, so no real caller ever supplied one and every `widgetEmbed`
 * node authored into a post's body rendered the REQ-28 placeholder forever (implementation-outline-
 * addendum.md Finding 1b). Fixed by having `resolvePageWidgets` accept the already-fetched
 * `post.bodyJson` directly (`pageBodyJson`) instead of an id to re-fetch — this route already holds
 * `post` by the time it calls this, so no extra lookup is needed either way.
 */
export async function resolveWidgetsForRender(deps: RenderContextResolutionDeps, theme: DiscoveredTheme, post?: PostRecord): Promise<ResolvePageWidgetsResult> {
  return resolvePageWidgets({
    deps: { bindingRepo: deps.widgetBindingRepo, entryRepo: deps.entryRepo },
    input: { workspaceId: deps.workspaceId, pageBodyJson: post?.bodyJson, resolvedRegions: theme.manifest.regions ?? [] },
  });
}

/**
 * SPEC-047 Slice 2 — resolves an `"html"`-format Page's `data-embed-type`
 * placeholders ahead of `renderSite`, mirroring `resolveWidgetsForRender`'s own "route resolves,
 * `render.ts` stays I/O-free" split immediately above. `undefined` for a `"doc"` post (nothing to
 * resolve — `renderSite`'s `pageHtmlEmbeds` param is optional for exactly this case) so this is a
 * no-op call on every route/render that isn't an html Page.
 *
 * `postRepo` is threaded through (2026-08-11) so a `"doc"`-format `content` reference authored
 * directly inside a Page's own freeform body (e.g. "see this related page") resolves here too, not
 * only within a template render — the visibility-filtered `content`/`post` resolvers
 * (`resolver-service.ts`) degrade to the REQ-28 placeholder without it, same as `media` already does
 * without `mediaRepo`. Deliberately NOT extended to also run the `renderViaTemplate`-only recursive
 * `"html"`-format pre-splice (`pages.ts`'s `resolveHtmlFormatContentMarkers`) — that needs both
 * `resolveHtmlPageEmbeds` and `render.ts`'s `renderHtmlPageBody` interleaved across recursive calls,
 * which this function's single-pass shape does not do; a nested `"html"`-format `content` reference
 * from a non-templated Page's own body is a disclosed, out-of-scope gap for this pass, not silently
 * unhandled — it degrades to the same honest placeholder any other unresolved reference gets.
 */
export async function resolveHtmlEmbedsForRender(deps: RenderContextResolutionDeps, post: PostRecord | undefined): Promise<ResolveHtmlPageEmbedsResult | undefined> {
  if (!post || post.bodyFormat !== "html") return undefined;
  return resolveHtmlPageEmbeds({
    deps: {
      entryRepo: deps.entryRepo,
      mediaRepo: deps.mediaRepo,
      transformRepo: deps.transformDefinitionRepo,
      postRepo: deps.postRepo,
      mediaContentTypeStore: deps.mediaContentTypeStore,
    },
    input: { workspaceId: deps.workspaceId, html: post.bodyHtml ?? "" },
  });
}

/** `NavTarget` (`navigation`) and `RouteTarget` (`routing`) are two independently-declared
 * discriminated unions with the same four kinds and matching fields (see `routing/types.ts`'s file
 * header: the vocabulary was "promoted from Menus-local to routing-owned" precisely so both domains
 * share it) — but they remain two separate type declarations, not one shared import, so this maps
 * explicitly per-kind rather than relying on structural assignability compiling by coincidence.
 */
function navTargetToRouteTarget(target: NavTarget): RouteTarget {
  switch (target.kind) {
    case "entryRef":
      return { kind: "entryRef", entryId: target.entryId };
    case "termRef":
      return { kind: "termRef", termId: target.termId, taxonomy: target.taxonomy };
    case "url":
      return { kind: "url", href: target.href };
    case "route":
      return { kind: "route", route: target.route, params: target.params };
  }
}

/**
 * Direct menu-embed wiring (2026-08-10, superseding the earlier `header`/`footer`
 * navLocationBindings scheme) — resolves every `data-embed-type="menu"` marker a `static`-tier
 * active theme's own pages/partials reference (`scanMenuEmbedIds`) into render-ready link data,
 * ahead of `renderSite`/`renderStaticPage`. Mirrors `resolveWidgetsForRender`'s own "route resolves,
 * render stays I/O-free" split (this is the one call site for this resolution).
 *
 * A theme marker now names a real stored menu `id` directly (e.g. `data-embed-id="menu-header-nav"`)
 * — the same `data-embed-type`/`data-embed-id` convention posts already use (`injectCurrentEntityContentId`) —
 * rather than a theme-independent named location resolved through `nav_location_bindings`. This
 * intentionally leaves `resolveForLocation`, `navLocationBindingRepo`, and the Menus admin screen's
 * "Assign location" feature in place but UNUSED for static-tier header/footer rendering specifically:
 * they are not deleted (other tiers or a future deprecation may still want them), simply no longer
 * on this call path. `resolveMenuDoc` (`navigation`) is the doc-level building block
 * `resolveForLocation` itself composed on top of a location lookup — called directly here per
 * referenced menu id instead. It still needs the same injected `resolveTargetHref` seam `routing`'s
 * own `urlFor` backs, for exactly the same reason `resolveForLocation` needed it.
 *
 * Non-static themes never call this (checked by the caller); declarative/templated/handlebars themes
 * have their own, separate `menu` WIDGET type (`widgets/resolvers/menu.ts`, `resolveMenuDoc` over an
 * explicit per-instance `menuRef`) that already renders real menu content today — a different,
 * narrower mechanism (one specific menu placed by an author, not a theme marker naming a shared
 * site-wide menu), left untouched by this change.
 *
 * A referenced id absent from the returned map (no such menu, wrong workspace, or a theme-authoring
 * typo) is `renderStaticPage`'s own `injectMenuEmbed` treating "no entry" as "leave the theme's
 * authored fallback content untouched" — no caller-side branching needed for that case either.
 *
 * @complexity One `menuRepo.findById` + `resolveMenuDoc` pair per distinct menu id the theme's
 * markup references (bounded in practice to the small, fixed set an author wrote into the theme's
 * own files), run concurrently.
 */
export async function resolveStaticMenusForRender(
  deps: TemplateRenderDeps,
  theme: DiscoveredTheme,
  currentPath: string
): Promise<Readonly<Record<string, readonly StaticMenuItem[]>>> {
  if (theme.manifest.tier !== "static") return {};

  const menuIds = scanMenuEmbedIds(theme);
  if (menuIds.length === 0) return {};

  const resolveTargetHref: ResolveTargetHrefFn = async (target) => {
    const resolved = await urlFor({
      deps: { postRepo: deps.postRepo },
      target: navTargetToRouteTarget(target),
      ctx: { workspaceId: deps.workspaceId },
    });
    return resolved ? { path: resolved.path, available: true } : null;
  };

  const entries = await Promise.all(
    menuIds.map(async (menuId): Promise<readonly [string, readonly StaticMenuItem[]] | undefined> => {
      // Resolved by SLUG first, id second. A theme marker is authored once and shipped to every
      // install, but `createMenu` mints a menu's id with `idGen.newId()` — so a hardcoded
      // `data-embed-id` could only ever match on the one install where that random id happened to
      // be generated. The slug is the stable machine handle the model already documents for exactly
      // this ("e.g. `primary-nav`", navigation/types.ts:161), so it is what a shipped theme can
      // actually name. The id lookup stays as the fallback for a marker pointing at a specific
      // stored menu, which is what the pre-2026-08-10 behavior did unconditionally.
      const menu =
        (await deps.menuRepo.findBySlug({ workspaceId: deps.workspaceId, slug: menuId })) ??
        (await deps.menuRepo.findById({ workspaceId: deps.workspaceId, id: menuId }));
      if (!menu) return undefined;
      const items = await resolveMenuDoc({
        doc: menu.doc,
        context: { workspaceId: deps.workspaceId, currentPath },
        resolveTargetHref,
      });
      return [menuId, items] as const;
    })
  );

  return Object.fromEntries(
    entries.filter((entry): entry is readonly [string, readonly StaticMenuItem[]] => entry !== undefined)
  );
}

/**
 * Template-picker feature (2026-08-10, unified 2026-08-11) — an explicit "not configured" page, in
 * the owner's own words from the design conversation, rather than a silent fallback to generic
 * rendering. Reuses the theme's own `.hero`/`.wrap` centering (proven correct this session — an
 * earlier attempt at a DIFFERENT centered page on this same theme used the wrong CSS class and
 * silently rendered left-aligned; `.hero` is the one already confirmed to center via real
 * `margin: auto`, not just `text-align: center` on a narrow box) and the same nav/footer/
 * token-injection shell every static page gets, via `renderStaticPage`'s `htmlOverride` — so this
 * looks like a real page on the site, not a bare error string.
 *
 * One builder for both kinds now (was `buildMissingPostTemplateHtml`/`buildMissingPageTemplateHtml`,
 * separate only because Posts and Pages used to resolve against separate template arrays) — the copy
 * below is worded kind-neutrally ("this content") rather than naming either editor, since the SAME
 * diagnostic page is now reachable from either.
 *
 * `apiVersion` (2026-08-19 architecture audit finding 4): this used to hardcode `../css/styles.css` —
 * v1's stylesheet filename — regardless of the active theme's schema version. `renderStaticPage`
 * itself already picks the matching sentinel per `apiVersion` via {@link tokenStylesheetSentinel}
 * (`static-asset-contract.ts`) before splicing in the token `<style>` block; this diagnostic page
 * renders through that SAME `renderStaticPage` call (see `renderViaTemplate` below), so its own
 * `<link>` must spell the identical sentinel `renderStaticPage` will string-match against, or design
 * tokens silently fail to inject and `rewriteAssetPaths` rewrites the folder prefix onto a filename
 * that does not exist for a v2 theme (an extra 404 on top of the unstyled page).
 */
function buildMissingTemplateHtml(apiVersion: 2 | undefined): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>Template not configured</title>",
    tokenStylesheetSentinel(apiVersion),
    "</head>",
    "<body>",
    // Authored in the same marker vocabulary a theme file uses, because `renderStaticPage` resolves
    // this override through the exact same `resolveSlots` pass — the retired `data-tovu-slot`
    // spelling this carried until 2026-08-10 would have left two raw `<div>`s in the diagnostic
    // page, i.e. the error page telling an author something is misconfigured would itself have been
    // the most visibly broken page on the site.
    `<div data-embed-config='{"type":"partial","id":"nav","current":""}'></div>`,
    "<main>",
    '<section class="hero wrap">',
    '<div class="eyebrow-row"><span class="status-pill"><span class="dot"></span>Not configured</span></div>',
    "<h1>This content has no usable template</h1>",
    '<p class="lede">This content has no template chosen, or its chosen template has no content slot to render into. Pick a template in its editor to fix this.</p>',
    "</section>",
    "</main>",
    `<div data-embed-config='{"type":"partial","id":"footer"}'></div>`,
    "</body>",
    "</html>",
  ].join("\n");
}

/**
 * Guard 3 of the unified-content-marker design (`ADS-memory/reports/design/
 * 2026-08-11-unified-content-marker-and-templates.md`) — bounds BOTH how deep a chain of
 * `"html"`-format `content` embeds may recurse and how many distinct entities may be fetched across
 * the whole recursive resolution, so a self-referencing body (A embeds A) or a mutually-referencing
 * one (A embeds B embeds A) TERMINATES instead of hanging, and a wide, adversarially-branching chain
 * cannot fan out into an unbounded number of DB round trips either. `MAX_HTML_EMBEDS_PER_PAGE` (the
 * existing precedent, `widgets/html-embeds.ts`) is a per-page COUNT and does not, by itself, bound a
 * CYCLE — a page can legally contain the same single marker that, once resolved, contains another
 * one referencing back, which no per-page count alone stops. Depth AND a total-fetch budget together
 * do: depth alone is sufficient for a SIMPLE cycle (bounded steps regardless of shape), and the
 * shared budget additionally caps the WORST-CASE adversarial branching case (many distinct ids at
 * every level) to a fixed number of fetches instead of depth^branching-factor.
 */
export const MAX_CONTENT_EMBED_DEPTH = 5;
/** Total distinct entities this function will ever fetch across one full recursive resolution — see
 * {@link MAX_CONTENT_EMBED_DEPTH}'s doc for why depth alone does not bound adversarial branching. */
export const MAX_CONTENT_EMBED_FETCHES = 50;

/** The narrow dependency slice {@link resolveHtmlFormatContentMarkers} actually needs — a `Pick` of
 * `RouteDeps` rather than the whole route-composition-root shape, so a direct unit test (guard 3's
 * termination property) can construct a minimal, real (`InMemoryPostRepo`-backed) deps object instead
 * of a full server boot's worth of repos it would never touch. `RouteDeps` remains a structural
 * supertype of this, so every real call site passes its own full `deps` through unchanged. */
export type ContentMarkerResolutionDeps = Pick<
  RouteDeps,
  "workspaceId" | "postRepo" | "entryRepo" | "mediaRepo" | "transformDefinitionRepo" | "mediaContentTypeStore"
>;

/** The narrow dependency slice {@link renderViaTemplate} and {@link resolveStaticMenusForRender}
 * actually need — same "`Pick` of `RouteDeps`, not the whole composition-root shape" reasoning as
 * {@link ContentMarkerResolutionDeps} immediately above (a superset of it: adds `menuRepo`, for
 * {@link resolveStaticMenusForRender}'s theme-nav lookup, and `themes`, originally added for
 * `resolveActiveTheme`'s discovery-list scan before that function moved to
 * `#src/features/theme/index` 2026-08-16 — its own `ActiveThemeResolutionDeps` only needs `themes`,
 * which this type is still a structural superset of, so every call site below that passes a
 * `TemplateRenderDeps`-shaped `deps` to the now-imported `resolveActiveTheme` keeps type-checking
 * unchanged). Exported (2026-08-11 template-preview fix) so `routes/admin/posts/template-preview.ts`
 * can call these real-pipeline functions with `ContentRouteDeps` — a `Pick` in its own right —
 * without needing the full `RouteDeps` shape neither one actually reads down to. `RouteDeps` remains
 * a structural supertype of this, so every pre-existing call site in this file keeps passing its own
 * full `deps` through unchanged. */
export type TemplateRenderDeps = Pick<
  RouteDeps,
  "workspaceId" | "postRepo" | "entryRepo" | "mediaRepo" | "transformDefinitionRepo" | "menuRepo" | "themes" | "mediaContentTypeStore"
>;

/**
 * The narrow dependency slice the four `resolve*ForRender` helpers below need — same "`Pick` of
 * `RouteDeps`, not the whole composition-root shape" reasoning as {@link TemplateRenderDeps}/
 * {@link ContentMarkerResolutionDeps} above (a superset of `ContentMarkerResolutionDeps`: adds
 * `widgetBindingRepo`, for {@link resolveWidgetsForRender}'s region lookup). Exported (2026-08-12,
 * `.liquid` Preview-tab fix) so `middleware/theme-page-preview.ts`'s templated-theme preview route can
 * assemble the same `SiteRenderContext` inputs the live site renders with, via `ContentRouteDeps` — a
 * `Pick` in its own right, widened by one field for this — without needing the full `RouteDeps` shape
 * none of these four functions actually read down to. `RouteDeps` remains a structural supertype of
 * this, so `registerSiteRoutes`/`registerProductRoutes`, the pre-existing callers, keep passing their
 * own full `deps` through unchanged.
 */
export type RenderContextResolutionDeps = Pick<
  RouteDeps,
  "workspaceId" | "postRepo" | "entryRepo" | "mediaRepo" | "transformDefinitionRepo" | "widgetBindingRepo" | "mediaContentTypeStore"
>;

/**
 * Recursively resolves every `{"type":"content","id":...}` marker in `html` whose target is an
 * `"html"`-format entity: fetches the entity (visibility-filtered — guard 2), resolves ITS OWN
 * embeds (every type, including further `content` markers, via a nested call to this same function
 * plus `resolveHtmlPageEmbeds`), splices the fully-rendered result into `html` in place of the
 * marker, and repeats until no `"html"`-format `content` markers remain or the depth/budget guard
 * (above) stops it.
 *
 * A `"doc"`-format target is left as an ordinary id-carrying marker for `resolveHtmlPageEmbeds`'s
 * registered `"content"` resolver to handle in the FINAL pass the caller runs afterward — a TipTap
 * document has no markers of its own to recurse into, and rendering it needs `renderDocNode`, which
 * only `render.ts` has in scope (this module must stay free of that dependency, same as every other
 * I/O-orchestration function in this file).
 *
 * Lives here, not in `widgets/resolver-service.ts` or `features/theme/static-render.ts`, because it
 * is the one place in the codebase that legitimately needs BOTH `resolveHtmlPageEmbeds` (resolves
 * IDs to data) AND `renderHtmlPageBody` (splices IR into HTML) for the SAME nested string — those two
 * modules must not depend on each other (`render.ts` already depends on `resolver-service.ts`; the
 * reverse would be circular), so only the route layer, which already imports both, can orchestrate
 * the resolve-then-splice-then-rescan loop this recursion needs.
 *
 * Uses {@link withInnerContentFinal}, not `withInnerContent`, for the final splice: an ordinary
 * `withInnerContent` call would leave `data-embed-config` intact on the rebuilt element, and the
 * CALLER's later `resolveHtmlPageEmbeds`/`renderHtmlPageBody` pass would then rediscover it as a
 * fresh, unresolved marker and try to resolve it again — `withInnerContentFinal` strips the marker
 * attribute so the already-rendered result is inert to any later scan.
 *
 * @complexity Bounded by {@link MAX_CONTENT_EMBED_FETCHES} total `findPublishedPostById` calls across
 * the whole call tree (the `budget` object is a single mutable counter threaded through every
 * recursive call), each followed by an O(n) `resolveHtmlPageEmbeds`/`renderHtmlPageBody` pass over
 * that one fetched entity's own body length. Never unbounded, regardless of the input's shape.
 *
 * Exported for direct testing of guard 3's termination property (`resolve-html-format-content-
 * markers.test.ts`) — the testability seam this function's own dependency shape
 * ({@link ContentMarkerResolutionDeps}) was narrowed for.
 */
export async function resolveHtmlFormatContentMarkers(
  deps: ContentMarkerResolutionDeps,
  html: string,
  depth: number,
  budget: { remaining: number }
): Promise<string> {
  if (depth >= MAX_CONTENT_EMBED_DEPTH || budget.remaining <= 0) return html;

  const ids = [...new Set(markersOfType(html, "content").map((m) => m.id).filter((id): id is string => id !== undefined))];
  if (ids.length === 0) return html;
  const idsToFetch = ids.slice(0, budget.remaining);
  budget.remaining -= idsToFetch.length;

  const replacements = new Map<string, string>();
  await Promise.all(
    idsToFetch.map(async (id) => {
      const entity = await findPublishedPostById({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, id } });
      // Missing/unpublished, or `"doc"`-format: leave this id for the final `resolveHtmlPageEmbeds`
      // pass — a `"doc"`-format target has nothing here to recurse into, and an unresolved id (guard
      // 2) degrades to the same REQ-28 placeholder that pass already produces for any other miss.
      if (!entity || entity.bodyFormat !== "html") return;
      const ownBody = entity.bodyHtml ?? "";
      const nestedHtml = await resolveHtmlFormatContentMarkers(deps, ownBody, depth + 1, budget);
      const nestedResolved = await resolveHtmlPageEmbeds({
        deps: {
          entryRepo: deps.entryRepo,
          postRepo: deps.postRepo,
          mediaRepo: deps.mediaRepo,
          transformRepo: deps.transformDefinitionRepo,
          mediaContentTypeStore: deps.mediaContentTypeStore,
        },
        input: { workspaceId: deps.workspaceId, html: nestedHtml },
      });
      replacements.set(id, renderHtmlPageBody(nestedHtml, nestedResolved));
    })
  );
  if (replacements.size === 0) return html;

  return substituteMarkers(html, (marker) => {
    if (marker.type !== "content" || marker.id === undefined) return undefined;
    const replacement = replacements.get(marker.id);
    return replacement === undefined ? undefined : withInnerContentFinal(marker, replacement);
  });
}

/**
 * Template-picker feature (2026-08-10, unified 2026-08-11) — renders `post` (a Post OR a Page, either
 * `"doc"`- or `"html"`-format) through its chosen static-theme template (`theme.json`'s `templates`
 * array), or the explicit diagnostic page above when unresolvable. Only called when the active theme
 * is `static` tier AND declares a non-empty `templates` array AND {@link isEligibleForTemplateBranch}
 * returned `true` for this row (checked by the caller) — a theme that doesn't declare `templates`
 * simply doesn't support the feature yet, which is a theme-capability gap, not a per-row
 * misconfiguration, so those themes fall through to the pre-existing generic rendering unchanged.
 *
 * Replaces the separate `renderPostViaTemplate`/`renderPageViaTemplate` — collapsible now that both
 * resolve against the SAME `templates` array and the SAME `"content"` marker, and both need the exact
 * same sequence: resolve which template, fill in the current entity's id, resolve any nested
 * `"html"`-format content, then resolve everything else. Which template (or the diagnostic page) a
 * row resolves to is decided by the pure {@link resolveTemplate} — including the `templateChoice`
 * tri-state, whose `null` vs `""` distinction that function's own doc explains in full. This function
 * owns only the embed-resolution I/O that follows.
 *
 * `injectPageTitle` now runs for BOTH kinds (previously Page-only): a template carrying the
 * `{{title}}` placeholder (`page-shell.html`) gets the row's real title regardless of whether a Post
 * or a Page rendered through it; a template with no such placeholder (`blog-post.html`, a disclosed,
 * unchanged limitation — see that function's own doc) is simply unaffected, the same no-op-when-absent
 * contract it already had.
 *
 * Exported (2026-08-11 template-preview fix) for `routes/admin/posts/template-preview.ts`, the
 * admin-only "preview this row through a PENDING, not-yet-saved template choice" endpoint —
 * `resolveTemplate` reads `post.templateChoice` alone, so that caller passes a shallow clone of the
 * real record with only `templateChoice` overridden, never persisting the override. Reusing this
 * function directly (rather than a second implementation) is the same "one render pipeline, zero
 * drift" reasoning the file header above gives for the live-site iframe branch in both editors.
 *
 * `pendingBodyJson` (2026-08-12, same fix's `bodyJson` half) — an optional, explicitly-passed
 * override for `post`'s OWN body, threaded into `resolveHtmlPageEmbeds` as a
 * {@link ResolveHtmlPageEmbedsDeps.pendingContentOverride} keyed to `post.id`. Without this, the
 * current entity's own `{"type":"content"}` slot (`injectCurrentEntityContentId`, immediately below)
 * re-fetches `post.id` from `postRepo` regardless of what `post.bodyJson` the caller passed in here —
 * `post`'s OTHER fields (title via `injectPageTitle` two lines below, `templateChoice` via
 * `resolveTemplate` above) already flow through because this function reads them directly, but the
 * BODY only ever reaches the page through that separate marker-resolution round trip. `undefined`
 * (every pre-existing call site) is byte-identical to before this parameter existed — see the
 * override field's own doc for why this is scoped to one id and never ambient state.
 *
 * `extraHead` (2026-08-19, SPEC-008 T045 gap fix part 3) — this function's own `renderStaticPage`
 * call bypasses `renderSite`/`pageShell` exactly like the marketing-page branch and static-tier home
 * do, so it had the identical SEO-fold drop; spliced in via
 * {@link injectExtraHeadIntoStaticPage} on the resolved-template return only. Deliberately NOT
 * applied to the `"diagnostic"` ("template not configured") return above: that page is an
 * operator-facing error state, not real indexable content — carrying the real entry's canonical/OG
 * tags on it would tell a crawler the broken diagnostic page IS the entry, worse than the drop this
 * fixes. Same reasoning `registerSiteRoutes`'s themed-404 branch is left out for (see that call
 * site's own comment). Optional and omitted by both existing callers that don't render the live
 * public page (`routes/admin/posts/template-preview.ts`'s pending-preview endpoint), matching every
 * other optional parameter's "omit = unchanged prior behavior" contract in this file.
 *
 * `siteAssistantEnabled` (ADR-054 gap fix) — this function's own `renderStaticPage` call has the
 * identical `pageShell`-bypassing shape the visitor-chat widget missed the same way `extraHead` did;
 * spliced in via {@link injectSiteAssistantIntoStaticPage} on the resolved-template return only, same
 * "not the diagnostic branch" scoping `extraHead` already follows immediately above. Defaults to
 * `false` so both existing callers (the admin preview endpoint, which must never show the public
 * widget in a preview iframe, and the two direct tests) keep their prior behavior unchanged.
 */
export async function renderViaTemplate(
  deps: TemplateRenderDeps,
  theme: DiscoveredTheme,
  post: PostRecord,
  staticMenus: Readonly<Record<string, readonly StaticMenuItem[]>> | undefined,
  pendingBodyJson?: JsonObject,
  extraHead?: string,
  siteAssistantEnabled = false
): Promise<string> {
  const resolution = resolveTemplate({ theme, templateChoice: post.templateChoice });
  if (resolution.kind === "diagnostic") {
    // `renderStaticPage`'s `| null` return (static-render.ts) is exactly its own `source ===
    // undefined` case, where `source = htmlOverride ?? theme.pages[pageId]` — reachable only when
    // BOTH are undefined. `htmlOverride` here is `buildMissingTemplateHtml(...)`'s return value,
    // typed `string` (never `undefined`), so `source` can never be undefined at this call site and
    // `renderStaticPage` can never return `null` here. The `?? ""` below is accordingly unreachable
    // dead code by construction, not merely untested — proper fix is narrowing `renderStaticPage`'s
    // own return type via an overload keyed on a required `htmlOverride`, which lives outside this
    // file (static-render.ts) and is out of this pass's scope.
    return (
      renderStaticPage({
        theme,
        pageId: "template-missing",
        htmlOverride: buildMissingTemplateHtml(theme.manifest.apiVersion),
        menus: staticMenus,
      }) ?? ""
    );
  }
  const { pageId, html: rawTemplate } = resolution;

  const withTitle = injectPageTitle(rawTemplate, post.title);
  const withCurrentId = injectCurrentEntityContentId(withTitle, post.id);
  const withNestedContent = await resolveHtmlFormatContentMarkers(deps, withCurrentId, 0, { remaining: MAX_CONTENT_EMBED_FETCHES });
  const resolved = await resolveHtmlPageEmbeds({
    deps: {
      entryRepo: deps.entryRepo,
      postRepo: deps.postRepo,
      mediaRepo: deps.mediaRepo,
      transformRepo: deps.transformDefinitionRepo,
      mediaContentTypeStore: deps.mediaContentTypeStore,
      ...(pendingBodyJson !== undefined
        ? { pendingContentOverride: { id: post.id, title: post.title, slug: post.slug, updatedAt: post.updatedAt, bodyJson: pendingBodyJson } }
        : {}),
    },
    input: { workspaceId: deps.workspaceId, html: withNestedContent },
  });
  const bodyResolvedHtml = renderHtmlPageBody(withNestedContent, resolved);
  // Same unreachable-`?? ""` situation as the diagnostic branch above: `bodyResolvedHtml` is
  // `renderHtmlPageBody`'s `string` return, never `undefined`, so `renderStaticPage`'s own
  // `source === undefined` null case can't fire here either. See that branch's comment for the
  // full proof; not fixed here for the same out-of-scope reason (the real fix narrows
  // `renderStaticPage`'s return type in static-render.ts, outside this file).
  const rendered = renderStaticPage({ theme, pageId, htmlOverride: bodyResolvedHtml, menus: staticMenus }) ?? "";
  return injectSiteAssistantIntoStaticPage(injectExtraHeadIntoStaticPage(rendered, extraHead), siteAssistantEnabled);
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
export async function resolveMediaTransformVersionsForRender(deps: RenderContextResolutionDeps): Promise<ReadonlyMap<string, number>> {
  const definition = await getLatestTransformDefinition({
    deps: { transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, name: CORE_PUBLIC_TRANSFORM_NAME },
  });
  return definition ? new Map([[CORE_PUBLIC_TRANSFORM_NAME, definition.version]]) : new Map();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Walks a TipTap-shaped `bodyJson` tree collecting every ref-based `image` node's `assetId`
 * (ADR-027 §4's `{assetId, transformName}` shape) — same walk shape as `resolver-service.ts`'s
 * `collectWidgetEmbeds`, kept as a separate local copy since this module has no dependency on
 * that one. A legacy `image` node (only `attrs.src`/`attrs.title`, no `assetId`) is simply never
 * added — `render.ts`'s `image` case never reads `src`/`title` at all (see that case's own
 * comment), so there is nothing for a sizing override to key off for that shape anyway. */
function collectImageAssetIds(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectImageAssetIds(child, out);
    return;
  }
  if (!isPlainObject(node)) return;
  if (node.type === "image" && isPlainObject(node.attrs) && typeof node.attrs.assetId === "string") {
    out.add(node.attrs.assetId);
  }
  if (Array.isArray(node.content)) collectImageAssetIds(node.content, out);
}

/**
 * Quick-and-dirty public-render sizing fix (owner-directed skip-the-ADR fix, 2026-08-05) —
 * resolves each ref-based image node's `MediaRecord.width`/`height`/`cssClass` override ahead of
 * `renderSite`, mirroring `resolveWidgetsForRender`/`resolveMediaTransformVersionsForRender`'s own
 * "route resolves, `render.ts` stays I/O-free" split (this is the one call site for this
 * resolution, same shape as those functions' own doc).
 *
 * Unlike `resolveMediaTransformVersionsForRender`, there is no single-name shortcut available here
 * — width/height/class are genuinely PER-ASSET values, not a property of `(workspaceId,
 * transformName)` alone — so this scans `post.bodyJson` for every distinct `assetId` a ref-based
 * `image` node references (mirroring `resolveHtmlPageEmbeds`'s own per-id scan for a Page's
 * `body_html`), then batch-fetches each one. `MediaRepoPort` (`@jini-ai/cms/media`) has no
 * `findByIds`/batch-by-id primitive — only `findById` — the same frozen-contract situation
 * `resolvePageWidgets`'s own file header discloses for `EntryRepoPort`; one `findById` per
 * distinct `assetId`, run concurrently, is the available primitive at today's real scale (a post
 * body with dozens of distinct images would need this widened to a real batch query, same as the
 * widget/html-embed resolvers already disclose for their own multi-id case).
 *
 * Never throws — a lookup that resolves to `null` (deleted, wrong workspace, or an id that was
 * never a real asset) is skipped, not thrown; the caller's `image` case already treats an
 * `assetId` absent from the returned map as "no override" (omit the attribute), never a crash.
 *
 * @complexity O(a) over the distinct `assetId`s referenced, each behind one `findById` call
 * (run concurrently via `Promise.all`, not serially).
 */
export async function resolveMediaAssetMetadataForRender(
  deps: RenderContextResolutionDeps,
  post: PostRecord | undefined
): Promise<ReadonlyMap<string, MediaAssetRenderMeta>> {
  if (!post) return new Map();
  const assetIds = new Set<string>();
  collectImageAssetIds(post.bodyJson, assetIds);
  if (assetIds.size === 0) return new Map();

  const entries = await Promise.all(
    Array.from(assetIds).map(async (assetId): Promise<readonly [string, MediaAssetRenderMeta] | undefined> => {
      const record = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: assetId });
      if (!record) return undefined;
      return [assetId, { width: record.width, height: record.height, cssClass: record.cssClass }] as const;
    })
  );
  return new Map(entries.filter((entry): entry is readonly [string, MediaAssetRenderMeta] => entry !== undefined));
}

/** Local alias for the per-menu-id resolved link map {@link resolveStaticMenusForRender} returns —
 *  used by the `GET /:slug` handler's own extracted helpers below to avoid repeating the full
 *  `Readonly<Record<string, readonly StaticMenuItem[]>>` shape at each call site. */
type StaticMenuMap = Readonly<Record<string, readonly StaticMenuItem[]>>;

/** Sends the shared "no themes installed" 500 both site routes fall back to when
 * `resolveActiveTheme` finds nothing — a workspace with zero discovered themes at all (a fresh
 * boot before the default theme seed, or every theme dir failing to parse). Not a per-request
 * condition either route can recover from, so both `GET /` and `GET /:slug` short-circuit here
 * identically. */
function sendNoThemesInstalled(res: Response): void {
  res.status(500).type("html").send("<h1>No themes installed</h1>");
}

/**
 * `GET /:slug`'s own slug-shaped-request gate: strips an accepted trailing `.html`, then rejects
 * anything that isn't a clean single-segment site slug — calling `next()` and returning
 * `undefined` so the caller falls through to API/static/404 handling exactly as Express's own
 * routing would if this middleware weren't here. Returns the cleaned slug string otherwise.
 */
function resolveRequestedSlug(req: Request, next: NextFunction): string | undefined {
  // A trailing .html is accepted and stripped so /blog.html resolves identically to /blog — a
  // static theme's own page files are still named foo.html on disk, and someone can always type
  // or bookmark the literal filename even though rewritePageLinks() only ever emits clean routes.
  const slug = String(req.params.slug ?? "").replace(/\.html$/, "");
  // Not a site page — let API/static/404 handling continue.
  if (!slug.match(/^[a-z0-9-]+$/) || slug === "admin" || slug === "api") {
    next();
    return undefined;
  }
  return slug;
}

// Fixed routes for a static theme's own marketing pages (pricing/docs/blog/…), checked before
// the post lookup in `resolvePostAfterMarketingCheck` below — a static theme page is never
// expected to also be a Post row, so this must resolve before `getPublishedPostBySlug` gets a
// chance to throw `PostNotFoundError` for a slug that was never meant to be a post in the first
// place (it used to run inside the same `Promise.all` as the post lookup, so that throw
// short-circuited straight past this check).
//
// The "is this page id actually its own public URL" half is `isStandaloneThemePage` (see its own
// doc in `features/theme/theme.ts`) — shared with `export/route-manifest.ts` rather than respelled
// here, which is what let this route serve `/blog-post` and `/404` as 200s while the exporter
// correctly omitted both.
function isMarketingPageSlug(theme: DiscoveredTheme, slug: string): boolean {
  return theme.manifest.tier === "static" && isStandaloneThemePage(theme, slug);
}

/** {@link resolveMarketingPageOrOverride}'s outcome — `"responded"` means the caller must send
 *  nothing further (the themed marketing page already went out), `"overridingPost"` means a real
 *  Post row at this slug won the slug collision and should render as a normal post, and
 *  `"fallthrough"` means neither applies and the caller should resolve `post` the ordinary way. */
type MarketingPageResolution =
  | { kind: "responded"; html: string }
  | { kind: "overridingPost"; post: PostRecord }
  | { kind: "fallthrough" };

/**
 * Resolves a `GET /:slug` request against a static theme's own fixed marketing pages, handling
 * the slug-collision policy between a theme page and a real Post row at the same slug.
 *
 * Slug-collision override (2026-08-10, default flipped to post-wins 2026-08-15) — one of the
 * two resources at this slug must win. `overridesThemePage` is tri-state (see
 * `PostRecord.overridesThemePage`'s own doc, `features/post/post.ts`): `null`/absent means the
 * author never had an opinion, in which case THIS is the one place the current default policy
 * is allowed to live — post wins. `false` is a permanent explicit choice (made via the admin
 * UI's collision warning) that keeps the theme page winning regardless of the default; `true`
 * is the same explicit choice in the post's favor, which was already the pre-2026-08-15
 * behavior and needs no special case here. Flipping the default again later is this one
 * comparison changing, never a migration — that is the entire reason the column is nullable
 * instead of `NOT NULL DEFAULT`. Checked with its own lookup here, swallowing
 * `PostNotFoundError` locally rather than letting it reach the outer catch — "no post at this
 * slug" is the overwhelmingly common case for a marketing-page route and must NOT 404 the theme
 * page that's about to render fine.
 */
export async function resolveMarketingPageOrOverride(
  deps: RouteDeps,
  theme: DiscoveredTheme,
  slug: string,
  staticMenus: StaticMenuMap | undefined,
  siteAssistantEnabled: boolean
): Promise<MarketingPageResolution> {
  if (!isMarketingPageSlug(theme, slug)) return { kind: "fallthrough" };

  const candidate = await getPublishedPostBySlug({
    deps: { repo: deps.postRepo },
    input: { workspaceId: deps.workspaceId, slug },
  }).catch((err) => {
    if (err instanceof PostNotFoundError) return null;
    throw err;
  });
  if (candidate && candidate.post.overridesThemePage !== false) {
    return { kind: "overridingPost", post: candidate.post };
  }

  const staticHtml = renderStaticPage({ theme, pageId: slug, menus: staticMenus });
  if (!staticHtml) return { kind: "fallthrough" };

  // SPEC-008 T045 gap fix, part 2 (2026-08-19) — this branch renders a theme's own marketing
  // page directly via `renderStaticPage`, the same `pageShell`-bypassing shape the static-tier
  // home route already had `injectExtraHeadIntoStaticPage` wired for in `9e7786b9`; this call
  // site was the one flagged there and left unfixed. No backing `post`, so `buildExtraHead`'s
  // `"page"` mode (entry-less, same shape as `"home"`) with this page's own `/${slug}` as the
  // canonical fallback — never home's `"/"`.
  const extraHead = await buildExtraHead(deps, "page", SITE_TITLE, undefined, `/${slug}`);
  // ADR-054 gap fix — same `pageShell`-bypassing shape missed the visitor-chat widget the same way
  // it missed `extraHead` above; a static theme's marketing pages (pricing/docs/blog/…) never showed
  // the widget even with the setting on, because `pageShell`'s own injection never ran here.
  const html = injectSiteAssistantIntoStaticPage(injectExtraHeadIntoStaticPage(staticHtml, extraHead), siteAssistantEnabled);
  return { kind: "responded", html };
}

/** Resolves the `post` a `GET /:slug` request renders: the slug-collision winner from
 *  {@link resolveMarketingPageOrOverride} when there is one, otherwise the ordinary published-post
 *  lookup at this slug (which throws `PostNotFoundError`, caught by the route's own outer catch,
 *  when nothing exists there either). Never called with a `"responded"` resolution — that case
 *  already sent its own response and returns from the route handler before this would run. */
export async function resolvePostAfterMarketingCheck(
  deps: RouteDeps,
  slug: string,
  marketingResolution: Exclude<MarketingPageResolution, { kind: "responded" }>
): Promise<PostRecord> {
  if (marketingResolution.kind === "overridingPost") return marketingResolution.post;
  const { post } = await getPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug } });
  return post;
}

/**
 * Template-picker feature (2026-08-10, unified 2026-08-11) — a `bodyFormat: "doc"` post
 * ("formulaic" content, the owner's own term) or an `"html"`-format Page with an explicit
 * choice renders through its chosen theme template instead of the generic rendering path,
 * whenever the active theme actually supports templates. Returns the rendered HTML, or
 * `undefined` when `post` isn't eligible — the caller falls through to the generic dynamic
 * post render in that case.
 *
 * `kind: "page"` rows DO also flow through this branch, but only on an explicit
 * `templateChoice` (see `isEligibleForTemplateBranch`'s doc) — NOT on the "never chosen, fall
 * back to the theme's first template" arm that Posts rely on. That arm is safe for Posts (an
 * author genuinely had no opinion) but was firing for legacy Pages that never had any admin
 * surface to set `template_choice` at all, which is how `terms-of-service` et al. were
 * rendering under the theme's first template (`<title>Blog post — Basic</title>`) on the live
 * site — fixed by gating on `kind`, not just `bodyFormat`.
 */
export async function renderTemplateBranchIfEligible(
  deps: RouteDeps,
  theme: DiscoveredTheme,
  post: PostRecord,
  staticMenus: StaticMenuMap | undefined,
  siteAssistantEnabled: boolean
): Promise<string | undefined> {
  if (!isEligibleForTemplateBranch({ theme, post })) return undefined;
  // SPEC-008 T045 gap fix, part 3 (2026-08-19) — `renderViaTemplate` has the same
  // pageShell-bypassing `renderStaticPage` shape as the marketing-page branch above; unlike
  // that branch this one DOES have a real backing `post`, so it folds through the same
  // entry-bearing `"post"` shape the generic (non-template) render below already uses. Same ADR-054
  // gap `resolveMarketingPageOrOverride` above threads through, for the same reason.
  const extraHead = await buildExtraHead(deps, "post", SITE_TITLE, post);
  return renderViaTemplate(deps, theme, post, staticMenus, undefined, extraHead, siteAssistantEnabled);
}

/** The generic (non-template) dynamic post render: resolves every widget/embed/media input
 *  `renderSite`'s `"post"` route needs and renders through it. This is the fallback path for any
 *  post that isn't eligible for {@link renderTemplateBranchIfEligible}'s template branch. */
export async function renderGenericPostPage(
  deps: RouteDeps,
  theme: DiscoveredTheme,
  post: PostRecord,
  posts: PostRecord[],
  siteAssistantEnabled: boolean
): Promise<string> {
  const [widgets, pageHtmlEmbeds, mediaTransformVersions, mediaAssetMetadata, extraHead] = await Promise.all([
    resolveWidgetsForRender(deps, theme, post),
    resolveHtmlEmbedsForRender(deps, post),
    resolveMediaTransformVersionsForRender(deps),
    resolveMediaAssetMetadataForRender(deps, post),
    buildExtraHead(deps, "post", SITE_TITLE, post),
  ]);
  return renderSite({
    theme,
    route: "post",
    siteTitle: SITE_TITLE,
    posts,
    post,
    widgets,
    pageHtmlEmbeds,
    mediaTransformVersions,
    mediaAssetMetadata,
    extraHead,
    siteAssistantEnabled,
  });
}

/**
 * `GET /:slug`'s `PostNotFoundError` handling — always fully handles the response (a redirect, a
 * themed 404, or the bare fallback 404), never falls through. Split out of the route's own catch
 * block so that block's `err instanceof PostNotFoundError` discriminant is the only branch left
 * inline at the call site.
 */
export async function handlePostNotFoundOnSlugRoute(
  req: Request,
  res: Response,
  deps: RouteDeps,
  theme: DiscoveredTheme | null,
  staticMenus: StaticMenuMap | undefined
): Promise<void> {
  if (await tryRedirectPhase("post_content", req.path, deps.workspaceId, res)) return;

  // A static theme that ships its own pages/404.html gets a themed not-found page instead of
  // the bare fallback below — same renderStaticPage path the marketing-page routes above use.
  if (theme && theme.manifest.tier === "static" && theme.pages["404"] !== undefined) {
    const staticHtml = renderStaticPage({ theme, pageId: "404", menus: staticMenus });
    if (staticHtml) {
      res.status(404).type("html").send(staticHtml);
      return;
    }
  }

  res.status(404).type("html").send("<h1>404 — page not found</h1><p><a href='/'>Home</a></p>");
}

/** Manual `req.headers.cookie` parse — no `cookie-parser` middleware mounted anywhere in this app;
 *  mirrors `dev-auth.ts`'s `readSessionToken`, the established convention for every cookie this
 *  codebase reads. */
function readRawCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/** Clears the validation flash cookie (2026-08-31 field-wipe fix) — read-once contract: once THIS
 *  GET has read it, a later plain reload of the same page must NOT resurrect the same stale values.
 *  Attributes mirror what `forms-submit.ts`'s `setFormFlashCookie` set it with; matching them isn't
 *  required for the browser to recognize this as the same cookie (only name+Path are), but keeps the
 *  set/clear pair symmetric, same as `dev-auth.ts`'s own `setSessionCookie`/`clearSessionCookie`. */
function clearFormFlashCookie(req: Request, res: Response): void {
  const secureAttr = isHttpsRequest(req) ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${FORM_FLASH_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secureAttr}`);
}

/** Resolves this request's {@link FormSubmissionRedirectResult}, if any — the query-string half
 *  (`decodeFormSubmissionResultFromQuery`) plus, for a `"validation"` result, the same-slug flash
 *  cookie's field values (`mergeFormFlashIntoResult`) so the OTHER fields the visitor already typed
 *  survive the Post/Redirect/Get round trip instead of coming back wiped (2026-08-31 fix). The flash
 *  cookie is READ-ONCE: whether or not one was present, it is cleared on `res` right here, in the
 *  same response that reads it. Resolved once per request and reused across every render branch —
 *  same "compute once, thread to every branch" shape `siteAssistantEnabled` already uses on the
 *  `/:slug` handler (ADR-054).
 * @complexity O(1) plus the bounded cost already documented on the functions it calls. */
function resolveFormSubmissionResult(req: Request, res: Response): FormSubmissionRedirectResult | undefined {
  const queryResult = decodeFormSubmissionResultFromQuery(req.query);
  const flash = decodeFormFlashCookieValue(readRawCookie(req, FORM_FLASH_COOKIE_NAME));
  if (flash) clearFormFlashCookie(req, res);
  return mergeFormFlashIntoResult(queryResult, flash);
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

      const [{ posts }, activeThemeId, siteAssistantEnabled] = await Promise.all([
        listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
        resolveActiveThemeId(deps),
        // ADR-054 — the visitor-chat master switch. `render.ts` never reads settings itself; every
        // route that calls `renderSite` resolves this the same way (see `pages.ts`'s other handler
        // and `products.ts`'s two handlers).
        isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective }, { workspaceId: deps.workspaceId }),
      ]);

      const theme = resolveActiveTheme(deps, activeThemeId);
      if (!theme) {
        sendNoThemesInstalled(res);
        return;
      }

      const [widgets, mediaTransformVersions, extraHead, staticMenus] = await Promise.all([
        resolveWidgetsForRender(deps, theme),
        resolveMediaTransformVersionsForRender(deps),
        buildExtraHead(deps, "home", SITE_TITLE, undefined),
        resolveStaticMenusForRender(deps, theme, "/"),
      ]);
      const html = await renderSite({
        theme,
        route: "home",
        siteTitle: SITE_TITLE,
        posts,
        widgets,
        mediaTransformVersions,
        extraHead,
        siteAssistantEnabled,
        staticMenus,
      });
      // Post/Redirect/Get result for a form widget on the home page (2026-08-31 fix, generalized
      // the same day) — `forms-submit.ts` redirects back here with `?form=...&form_status=...` after
      // a JS-disabled submission; a request with none of those params is the ordinary case and this
      // is a no-op. Also reads (and clears) the validation flash cookie, if any — see
      // `resolveFormSubmissionResult`'s own doc.
      const formSubmissionResult = resolveFormSubmissionResult(req, res);
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("html").send(injectFormSubmissionResultIntoHtml(html, formSubmissionResult));
    } catch {
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });

  app.get("/:slug", async (req, res, next) => {
    const slug = resolveRequestedSlug(req, next);
    if (slug === undefined) return;

    let theme: DiscoveredTheme | null = null;
    let staticMenus: StaticMenuMap | undefined;
    try {
      if (await tryRedirectPhase("pre_content", req.path, deps.workspaceId, res)) return;

      const [activeThemeId, { posts }, siteAssistantEnabled] = await Promise.all([
        resolveActiveThemeId(deps),
        listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
        isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective }, { workspaceId: deps.workspaceId }),
      ]);

      theme = resolveActiveTheme(deps, activeThemeId);
      if (!theme) {
        sendNoThemesInstalled(res);
        return;
      }

      // Resolved once per request (not just for the marketing-page branch below) — the requested
      // path is the correct `currentPath` for `isCurrent` regardless of whether this request ends up
      // rendering a marketing page, a post-template page, or the themed 404 below; all three share
      // this one resolve rather than re-querying the same two locations per branch.
      staticMenus = await resolveStaticMenusForRender(deps, theme, req.path);

      // Post/Redirect/Get result for a form widget on THIS route (2026-08-31 fix, generalized the
      // same day) — resolved once and applied uniformly across all three branches below, the same
      // "compute once, thread to every branch" shape `siteAssistantEnabled` already uses on this
      // handler (ADR-054). A request with none of the `form_*` params (the ordinary case) decodes to
      // `undefined`, and `injectFormSubmissionResultIntoHtml` is a no-op for that. Also reads (and
      // clears) the validation flash cookie, if any — see `resolveFormSubmissionResult`'s own doc.
      const formSubmissionResult = resolveFormSubmissionResult(req, res);

      const marketingResolution = await resolveMarketingPageOrOverride(deps, theme, slug, staticMenus, siteAssistantEnabled);
      if (marketingResolution.kind === "responded") {
        res
          .set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE)
          .type("html")
          .send(injectFormSubmissionResultIntoHtml(marketingResolution.html, formSubmissionResult));
        return;
      }

      const post = await resolvePostAfterMarketingCheck(deps, slug, marketingResolution);

      const templateHtml = await renderTemplateBranchIfEligible(deps, theme, post, staticMenus, siteAssistantEnabled);
      if (templateHtml !== undefined) {
        res
          .set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE)
          .type("html")
          .send(injectFormSubmissionResultIntoHtml(templateHtml, formSubmissionResult));
        return;
      }

      const genericPostHtml = await renderGenericPostPage(deps, theme, post, posts, siteAssistantEnabled);
      res
        .set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE)
        .type("html")
        .send(injectFormSubmissionResultIntoHtml(genericPostHtml, formSubmissionResult));
    } catch (err) {
      if (err instanceof PostNotFoundError) {
        await handlePostNotFoundOnSlugRoute(req, res, deps, theme, staticMenus);
        return;
      }
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });
};

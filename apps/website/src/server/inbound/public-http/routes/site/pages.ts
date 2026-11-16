
import { captureVisitorEvent } from "../../visitor-analytics.js";
import { renderCommentsMarkers } from '#src/features/comments/public-markers';
import type { SiteChatSelection } from "../../http/site/site-chat-markup.js";
import type { NextFunction, Request, Response } from "express";

import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import { getPublishedPostBySlug, listPublishedPosts, PostNotFoundError, ROOT_SLUG } from "#src/features/post/post";
import { createMemberAccessResolver } from "#src/features/members/access-resolver";
import type { MemberContext, MemberAccessResolver } from "#src/features/members/index";
import { resolveActiveThemeId } from "#src/features/presentation/active-theme-id";
import { resolveRenderThemeId } from "../../middleware/render-theme-override.js";
import { resolveTemplateBranchChoice, isBarePageChoice } from "#src/features/theme/static-render";
import { NO_THEME_ID, resolveActiveTheme } from "#src/features/theme/active-theme";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { comparePostsByDisplayDate } from "#src/contracts/core/scheduled-publish";
import { postPublicPath } from "#src/platform/routing/index";
import { checkSiteRelativeTarget } from "#src/platform/routing/index";
import { renderSite } from "../../http/site/render-site.js";
import { renderBareEntryDocument } from "../../http/site/bare-page.js";
import type { RouteDeps, RouteRegistrar } from "#src/server/routes/types";
import { asyncRoute } from "../../../shared/async-route.js";
import type { SiteRequestDeps, PostPreviewsAccess } from "./pages/render-context/deps.js";
import { resolveAssignedTermsForRender } from "./pages/render-context/taxonomy.js";
import { resolveSiteTitleForRender, resolveSiteTimeZoneForRender } from "./pages/render-context/site-title.js";
import { ListingBatchNotFoundError } from "./pages/listing/listing-state.js";
import { resolveRequestedSlug, redirectLookupPath } from "./pages/request-policy.js";
import { withListingBatch } from "./pages/listing/listing-batch.js";
import { resolveMemberContextForRequest, decidePostMemberAccess, filterVisiblePosts } from "./pages/render-context/member-access.js";
import { resolveSiteAssistantWidgetForRequest, resolveWidgetsForRender, resolveHtmlEmbedsForRender } from "./pages/render-context/widgets.js";
import { resolveStaticMenusForRender, type StaticMenuMap } from "./pages/render-context/static-menus.js";
import { resolveMediaTransformVersionsForRender, resolveMediaAssetMetadataForRender } from "./pages/render-context/media-metadata.js";
import { tryRedirectPhase } from "./pages/redirect-phase.js";
import { buildExtraHead } from "./pages/extra-head.js";
import { resolvePerVisitorResponse, sendPublicPage } from "./pages/response.js";
import { finishStaticTierDocument, isStaticThemeWithIndex, serveStaticThemeIndex } from "./pages/static-tier.js";
import { renderViaTemplate } from "./pages/template-render.js";
import { listingBatchNotFound, registerListingRewrites } from "./pages/handlers/listing.js";
import { resolveMarketingPageOrOverride, resolvePostAfterMarketingCheck } from "./pages/handlers/marketing.js";

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
 * below, unchanged in behavior, so `apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts`'s existing
 * `from "../../site/pages"` import of `resolveActiveTheme` keeps working — only `route-manifest.ts`
 * was updated to import both new homes directly.
 */
export { resolveActiveThemeId, resolveActiveTheme };

/** Sends the shared "no themes installed" 500 both site routes fall back to when
 * `resolveActiveTheme` finds nothing — a workspace with zero discovered themes at all (a fresh
 * boot before the default theme seed, or every theme dir failing to parse). Not a per-request
 * condition either route can recover from, so both `GET /` and `GET /:slug` short-circuit here
 * identically. */
function sendNoThemesInstalled(res: Response): void {
  res.status(500).type("html").send("<h1>No themes installed</h1>");
}

/**
 * The one place either site route's outer catch records an unexpected fault before sending the
 * branded `<h1>Site error</h1>` 500. `GET /`'s catch used to be a literal bare `catch {}` and
 * `GET /:slug`'s discarded everything that was not a `PostNotFoundError`, so a site could 500 on
 * `/` and `/pricing` at once with no record anywhere of what had actually failed. `products.ts`'s
 * own file header records what that cost in practice: a missing `presentation_settings` row 500ed
 * one public route for as long as it did precisely because the catch that absorbed it said nothing,
 * while the sibling route silently degraded past the same missing row.
 *
 * REPORTING, not rethrowing, is the fix here, and the difference is not cosmetic:
 *  - Express 4 (this app's version) does not forward a rejected `async` handler to its error
 *    middleware — that is Express 5 behaviour. A `throw` from these catches escapes as an unhandled
 *    rejection, which Node terminates the process for by default, so rethrowing would trade one
 *    broken URL for every URL on the site, including the ones rendering perfectly.
 *  - The 500 really is per-request-recoverable: nothing in this render path is cached between
 *    requests (theme, settings, menus, widgets and content are all re-resolved per request), so a
 *    fault on one render implies nothing about the next one. Failing the process closed would be
 *    strictly worse than failing this response closed.
 * Only the diagnosis was ever missing, so the diagnosis is all this adds — the visitor-facing body
 * stays the same opaque `<h1>Site error</h1>`, deliberately: an internal message or stack must not
 * reach an anonymous visitor.
 *
 * `console.error` matches what this same route tree's other handlers already use
 * (`comments-submit.ts`, `payments-webhook.ts`). `RouteDeps` carries no logger port to inject, and
 * `platform/observability` deliberately exposes one method (`trackRequest`) with no error channel —
 * see its `ports.ts` header.
 *
 * @param detail the route PATTERN plus, at most, values already validated to a bounded shape —
 *   never a raw request URL. The only request-derived value any caller passes is `GET /:slug`'s
 *   `slug`, which `resolveRequestedSlug` has already matched against `/^[a-z0-9-]+$/`, so it can
 *   carry neither unbounded log volume nor a newline.
 * @param err whatever the catch received, passed through unchanged so the stack survives.
 * @complexity O(1).
 */
function reportSiteRenderFault({ detail, err }: { detail: string; err: unknown }, _optional = {}): void {
  console.error(`[site/pages] ${detail}`, err);
}

/**
 * Bare-page render (owner ruling 2026-09-23, `no-template-bare-plan-2026-09-23.md` S4) — resolves
 * every input `renderBareEntryDocument` (`http/site/bare-page.ts`) needs and calls it. Mirrors
 * {@link renderGenericPostPage}'s own "route resolves I/O, render.ts/bare-page.ts stays pure" split,
 * with two deliberate differences: `resolveWidgetsForRender` is called with `theme: null` (a bare
 * Page gets no theme-declared REGION widgets — only inline `widgetEmbed` nodes in its own body,
 * which resolve from `pageBodyJson` regardless of the theme argument), and `assignedTerms`/`posts`
 * are never resolved at all, since {@link renderBareEntryDocument} never appends a terms block or
 * reads the sibling-posts list (plan §3, point 2).
 *
 * `extraHead` is built via `buildExtraHead(deps, "post", ...)` — the SAME SEO/og fold every other
 * post/page route gets. This is the ONE thing this function adds beyond the Page's own HTML; see
 * `bare-page.ts`'s own file header for why that's not a contradiction of "no theme chrome".
 */
async function renderBarePage(deps: RouteDeps, post: PostRecord): Promise<string> {
  const siteTitle = await resolveSiteTitleForRender(deps);
  const [widgets, pageHtmlEmbeds, mediaTransformVersions, mediaAssetMetadata, extraHead] = await Promise.all([
    resolveWidgetsForRender({ deps, theme: null }, { post }),
    resolveHtmlEmbedsForRender({ deps, post }),
    resolveMediaTransformVersionsForRender(deps),
    resolveMediaAssetMetadataForRender({ deps, post }),
    buildExtraHead({ deps, route: "post", siteTitle, post }),
  ]);
  return renderBareEntryDocument({
    documentAssets: await deps.documentAssets?.({ scripts: [] }),
    post,
    siteTitle,
    extraHead,
    pageHtmlEmbeds,
    widgetInlineResolved: widgets.inlineResolved,
    mediaTransformVersions,
    mediaAssetMetadata,
  });
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
 *
 * `pageShellFallback` (2026-09-02) — when `post` is ineligible for the branch above (the common
 * case: no admin surface sets `templateChoice` on create), an `html`-format `kind: "page"` row on a
 * `static`-tier theme gets ONE more chance before falling through to the caller's generic path: the
 * theme's own canonical page-shell document shell (`pages-default.html`, or legacy `page-shell.html`
 * — see `resolveStaticTierPageShellFallback`'s own doc), via that same function.
 * This is NOT a second "which content template" guess — `isEligibleForTemplateBranch`'s own
 * `kind: "page"` gate is completely untouched, so a `doc`-format Page or a Post with no opinion never
 * reaches this arm, and the `terms-of-service`-shaped regression that gate exists to prevent cannot
 * reopen through it. It exists because the generic (non-template) path this row would otherwise fall
 * to renders through Tovu's own `pageShell()` — correct for the other three tiers, which have no
 * standalone documents of their own, but not for `static` tier, whose real pages are complete
 * documents `pageShell()` cannot reproduce (see that function's own doc for the full live-bug trace).
 * `renderViaTemplate` is called with a shallow clone carrying the resolved filename ONLY for this
 * render — nothing is written back to `post.templateChoice`, so the row stays `null`/`undefined` and
 * a later explicit choice (or a theme switch) is free to override this every time.
 *
 * **Bare page** (owner ruling 2026-09-23, plan §2 P1-P6) — checked FIRST, before the `theme === null`
 * early return below: a `kind: "page"` row with `templateChoice === ""` ({@link isBarePageChoice})
 * renders NONE of a theme's chrome, so it doesn't matter whether a theme is even active. Routing it
 * through {@link renderBarePage} here — rather than adding a THIRD "is this bare" check at every one
 * of this function's five call sites (`GET /`, `GET /:slug`, the marketing-override branch, the
 * member-gated path, and the admin preview route, S5) — means the member-access gate at each call
 * site (checked strictly BEFORE this function runs) still applies unchanged: a bare Page is gated
 * exactly like every other Page, never bypassed.
 */
export async function renderTemplateBranchIfEligible({ deps, theme, post, staticMenus, siteAssistantEnabled }: { deps: RouteDeps; /* `null` when the operator turned the theme off — see the early return at the top of the body. */ theme: DiscoveredTheme | null; post: PostRecord; staticMenus: StaticMenuMap | undefined; siteAssistantEnabled: SiteChatSelection }, { postPreviewsAccess }: { /* Post-previews marker (2026-09-03) — threaded straight through to `renderViaTemplate`'s own identically-shaped parameter; see that function's doc for the full rationale. */ postPreviewsAccess?: { resolver: MemberAccessResolver; context: MemberContext } } = {}): Promise<string | undefined> {
  // Checked before the theme-off early return below: a bare Page renders identically with or
  // without an active theme, so this must not be gated on one being present. See this function's
  // own doc, "Bare page" paragraph.
  if (isBarePageChoice(post)) return renderBarePage(deps, post);

  // The template branch renders a THEME's template file, so with no theme it cannot run and the
  // caller falls through to the generic render. `post.templateChoice` is IGNORED here, never
  // cleared — which is what makes "turn the theme off, then back on" fully reversible rather than
  // approximately so: the stored choice takes effect again the moment a theme is reactivated.
  if (theme === null) return undefined;

  // One shared decision, never the two underlying functions in sequence — see
  // `resolveTemplateBranchChoice`'s own doc (`features/theme/static-render.ts`) for the 2026-09-16
  // preview divergence that extraction closed. Behavior here is unchanged by it.
  const branch = resolveTemplateBranchChoice({ theme, post });
  if (branch.kind === "ineligible") return undefined;

  // SPEC-008 T045 gap fix, part 3 (2026-08-19) — `renderViaTemplate` has the same
  // pageShell-bypassing `renderStaticPage` shape as the marketing-page branch above; unlike
  // that branch this one DOES have a real backing `post`, so it folds through the same
  // entry-bearing `"post"` shape the generic (non-template) render below already uses. Same ADR-054
  // gap `resolveMarketingPageOrOverride` above threads through, for the same reason.
  const extraHead = await buildExtraHead({ deps, route: "post", siteTitle: await resolveSiteTitleForRender(deps), post });
  const renderedPost = branch.kind === "page-shell" ? { ...post, templateChoice: branch.templateChoice } : post;
  return renderViaTemplate({ deps, theme, post: renderedPost, staticMenus }, { pendingBodyJson: undefined, pendingBodyHtml: undefined, extraHead, siteAssistantEnabled, postPreviewsAccess });
}

/** The generic (non-template) dynamic post render: resolves every widget/embed/media input
 *  `renderSite`'s `"post"` route needs and renders through it. This is the fallback path for any
 *  post that isn't eligible for {@link renderTemplateBranchIfEligible}'s template branch. */
export async function renderGenericPostPage({ deps, theme, post, posts, siteAssistantEnabled }: { deps: RouteDeps; /* `null` when the operator turned the theme off — `renderSite` renders the page unstyled. */ theme: DiscoveredTheme | null; post: PostRecord; posts: PostRecord[]; siteAssistantEnabled: SiteChatSelection }, _optional = {}): Promise<string> {
  const siteTitle = await resolveSiteTitleForRender(deps);
  const [widgets, pageHtmlEmbeds, mediaTransformVersions, mediaAssetMetadata, extraHead, assignedTerms] = await Promise.all([
    resolveWidgetsForRender({ deps, theme }, { post }),
    resolveHtmlEmbedsForRender({ deps, post }),
    resolveMediaTransformVersionsForRender(deps),
    resolveMediaAssetMetadataForRender({ deps, post }, { listed: posts }),
    buildExtraHead({ deps, route: "post", siteTitle, post }),
    // Taxonomy render-surface gap fix (2026-09-03) — this is the generic (non-template) render path;
    // `renderTemplateBranchIfEligible`/`renderViaTemplate` above already resolves this same input for
    // the static-tier template branch. See `SiteRenderContext.assignedTerms`'s own doc for where this
    // lands (`render.ts`'s `renderPostBody`, shared by the declarative/templated/handlebars tiers).
    resolveAssignedTermsForRender(deps, post),
  ]);
  return renderSite({
    renderAssets: deps.documentAssets,
    transformBody: ({ html }) => renderCommentsMarkers({ html, providers: deps.commentsProviders, siteId: deps.workspaceId,
      entry: { id: post.id, slug: post.slug, title: post.title, status: post.status, canonicalUrl: postPublicPath({ slug: post.slug }) },
    }, { cursor: deps.commentsCursor, scripts: ({ scripts }) => deps.declaredScripts?.push(...scripts) }),
    theme,
    route: "post",
    siteTitle,
    timeZone: await resolveSiteTimeZoneForRender(deps),
    posts,
    post,
    widgets,
    pageHtmlEmbeds,
    mediaTransformVersions,
    mediaAssetMetadata,
    assignedTerms,
    extraHead,
    siteAssistantEnabled,
  });
}

/**
 * `GET /:slug`'s `PostNotFoundError` handling — always fully handles the response (a redirect, a
 * themed 404, or the bare fallback 404), never falls through. Split out of the route's own catch
 * block so that block's `err instanceof PostNotFoundError` discriminant is the only branch left
 * inline at the call site.
 *
 * It can still reject (a default-policy `post_content` handler that throws, a themed-404 render
 * fault): call it inside a `try`, or through {@link handlePostNotFoundInSlugCatch} where there is
 * none.
 */
export async function handlePostNotFoundOnSlugRoute(
  req: Request,
  res: Response,
  deps: RouteDeps,
  theme: DiscoveredTheme | null,
  staticMenus: StaticMenuMap | undefined
): Promise<void> {
  if (await tryRedirectPhase({ phase: "post_content", path: redirectLookupPath({ req }), workspaceId: deps.workspaceId, res })) return;

  // A static theme that ships its own pages/404.html gets a themed not-found page instead of
  // the bare fallback below — E4 (D2, 2026-09-23) runs it through the SAME
  // `finishStaticTierDocument` pipeline every other static-tier surface uses, so a widget or
  // collection marker on the 404 page (or a partial it references) resolves too, not only its menu
  // markers (the one thing the old direct `renderStaticPage` call already substituted).
  if (theme && theme.manifest.tier === "static" && theme.pages["404"] !== undefined) {
    const staticHtml = await finishStaticTierDocument(deps, {
      theme,
      pageId: "404",
      html: theme.pages["404"],
      currentPath: req.path,
      staticMenus,
    });
    if (staticHtml) {
      void captureVisitorEvent({ deps, request: req, name: "site_not_found", properties: { routeTemplate: "/:slug" } });
      res.status(404).type("html").send(staticHtml);
      return;
    }
  }

  void captureVisitorEvent({ deps, request: req, name: "site_not_found", properties: { routeTemplate: "/:slug" } });
  res.status(404).type("html").send("<h1>404 — page not found</h1><p><a href='/'>Home</a></p>");
}

/**
 * {@link handlePostNotFoundOnSlugRoute} for `GET /:slug`'s own catch block — the one call site with
 * no enclosing `catch`. Express 4 ignores the promise an async handler returns, so a rejection there
 * (a default-policy `post_content` handler that throws, or a themed-404 render fault) used to leave
 * the request with no response at all and surface only as a process-wide unhandled rejection
 * (t91 F4.3-A). Answers it exactly as the route's catch answers every other fault.
 *
 * @param input.slug the slug `resolveRequestedSlug` already validated — used only in the fault line.
 * @complexity O(1) beyond {@link handlePostNotFoundOnSlugRoute}.
 */
async function handlePostNotFoundInSlugCatch(input: {
  req: Request;
  res: Response;
  deps: RouteDeps;
  theme: DiscoveredTheme | null;
  staticMenus: StaticMenuMap | undefined;
  slug: string;
}): Promise<void> {
  const { req, res, deps, theme, staticMenus, slug } = input;
  try {
    await handlePostNotFoundOnSlugRoute(req, res, deps, theme, staticMenus);
  } catch (err) {
    reportSiteRenderFault({ detail: `GET /:slug failed (slug=${slug})`, err });
    res.status(500).type("html").send("<h1>Site error</h1>");
  }
}

/**
 * Content-owned homepage (SPEC-0XX) — looks up the published row currently claiming the reserved
 * `"/"` slug (`post.ts`'s `ROOT_SLUG`), the mechanism that lets `GET /` render a real, authored Page
 * instead of always falling back to the active theme's own `index.html`. Only a `kind: "page"` row
 * can ever be saved at this slug (`resolveExplicitSlug`/`validateUpdatePostInput`'s kind gate, both
 * `post.ts`), so no `kind` check is needed here — whatever this finds is one by construction.
 *
 * Mirrors {@link resolveMarketingPageOrOverride}'s own "look up by slug, swallow `PostNotFoundError`
 * locally" shape immediately above — "no page claims `/`" is the overwhelmingly common case and must
 * not reach the route's outer catch.
 *
 * A row the current visitor's member access denies is treated identically to "no page claims `/`"
 * (returns `undefined`), matching `/:slug`'s own "gated == not-found" contract
 * ({@link decidePostMemberAccess}'s call site in `registerSiteRoutes` below): the homepage falls back
 * to the themed default rather than confirming a gated page's existence to an unauthorized visitor.
 *
 * @complexity O(1) plus the one `findBySlug` lookup's own cost.
 */
async function resolveHomePageContent({ deps, memberAccessResolver, memberContext }: { deps: RouteDeps; memberAccessResolver: MemberAccessResolver; memberContext: MemberContext }, _optional = {}): Promise<PostRecord | undefined> {
  const found = await getPublishedPostBySlug({
    deps: { repo: deps.postRepo },
    input: { workspaceId: deps.workspaceId, slug: ROOT_SLUG },
  }).catch((err) => {
    if (err instanceof PostNotFoundError) return null;
    throw err;
  });
  if (!found) return undefined;
  return decidePostMemberAccess({ resolver: memberAccessResolver, post: found.post, context: memberContext }).allowed ? found.post : undefined;
}

/** `GET /`'s whole response (redirects, content-owned home page, the static theme's `index.html`,
 *  or the theme's home route). Errors propagate to the route's catch. */
async function serveHomePage({ req, res, deps }: { req: Request; res: Response; deps: SiteRequestDeps }): Promise<void> {
  if (await tryRedirectPhase({ phase: "pre_content", path: redirectLookupPath({ req }), workspaceId: deps.workspaceId, res })) return;

  const memberAccessResolver = createMemberAccessResolver({ deps });
  const [{ posts }, activeThemeId, siteAssistantEnabled, memberContext] = await Promise.all([
    listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
    resolveRenderThemeId(res, deps),
    // ADR-054 — the visitor-chat master switch. `render.ts` never reads settings itself; every
    // route that calls `renderSite` resolves this the same way, through the shared
    // `resolveSiteAssistantWidgetForRequest` (see `pages.ts`'s other handler and
    // `products.ts`'s two handlers), which also carves out static exports (see that
    // function's own doc).
    resolveSiteAssistantWidgetForRequest({ request: req, deps }),
    resolveMemberContextForRequest({ req, deps, resolver: memberAccessResolver }),
  ]);

  // ADR-030 §4 — the home listing is gated too, not just each post's own page. See
  // `filterVisiblePosts`'s own doc for why filtering only `/:slug` would be protection that
  // looks real and isn't.
  // Newest display date first, the order every post listing uses (it was insertion order).
  const visiblePosts = filterVisiblePosts({ resolver: memberAccessResolver, posts, context: memberContext }).sort(comparePostsByDisplayDate);

  const resolved = resolveActiveTheme({ deps, activeThemeId });
  if (resolved === null) {
    sendNoThemesInstalled(res);
    return;
  }
  // `NO_THEME_ID` -> `null`, which every render helper below reads as "render unstyled". The
  // guard above must stay `=== null`, not `!theme`: `null` means nothing is INSTALLED (a broken
  // site, hence the 500), while the sentinel means the operator turned styling off on purpose
  // and is owed a real page. Collapsing the two would send state 3 into the 500.
  const theme = resolved === NO_THEME_ID ? null : resolved;

  // Content-owned homepage (SPEC-0XX) — a Page claiming "/" wins over the theme's own
  // index.html; renders through the SAME template-resolution path GET /:slug already uses for
  // a Page below. Falls through to exactly the pre-existing code that follows, byte-identical,
  // when no page claims it (or the current visitor's member access denies the one that does) —
  // see `resolveHomePageContent`'s own doc.
  const homePage = await resolveHomePageContent({ deps, memberAccessResolver, memberContext });
  if (homePage) {
    await serveContentHomePage({ req, res, deps, theme, homePage, visiblePosts, siteAssistantEnabled, access: { resolver: memberAccessResolver, context: memberContext } });
    return;
  }

  const siteTitle = await resolveSiteTitleForRender(deps);
  const [widgets, mediaTransformVersions, extraHead, staticMenus] = await Promise.all([
    resolveWidgetsForRender({ deps, theme }),
    resolveMediaTransformVersionsForRender(deps),
    buildExtraHead({ deps, route: "home", siteTitle, post: undefined }),
    resolveStaticMenusForRender({ deps, theme, currentPath: "/" }),
  ]);

  // E4 (D2, 2026-09-23) — a static theme's own `index.html` goes through the SAME
  // `finishStaticTierDocument` pipeline every other static-tier surface uses (E3), instead of
  // `renderSite`'s `renderStaticTierHomePage`, which only ever substituted `menu`/`partial`
  // markers via `renderStaticPage` directly and never ran `resolveHtmlPageEmbeds` or
  // `resolvePostPreviewsForRender` at all — a widget, post-previews, or collection marker
  // authored straight into `index.html` (or a partial it references) silently never resolved.
  // `renderStaticTierHomePage` stays in place for its one other caller
  // (`middleware/theme-page-preview.ts`'s admin preview route, which never reaches this handler).
  if (isStaticThemeWithIndex(theme)) {
    await serveStaticThemeIndex({ req, res, deps, theme, staticMenus, extraHead, siteAssistantEnabled, access: { resolver: memberAccessResolver, context: memberContext } });
    return;
  }

  const html = await renderSite({
    renderAssets: deps.documentAssets,
    theme,
    route: "home",
    siteTitle,
    timeZone: await resolveSiteTimeZoneForRender(deps),
    posts: visiblePosts,
    listing: { pagePath: "/", after: deps.listingBatch?.key === 1 ? deps.listingBatch.after : 0 },
    widgets,
    mediaTransformVersions,
    // Featured image (2026-10-05): resolves only the listed posts' featured ids for post cards.
    mediaAssetMetadata: await resolveMediaAssetMetadataForRender({ deps, post: undefined }, { listed: visiblePosts }),
    extraHead,
    siteAssistantEnabled,
    staticMenus,
  });
  // Post/Redirect/Get result for a form widget on the home page (2026-08-31 fix, generalized
  // the same day) — `forms-submit.ts` redirects back here with `?form=...&form_status=...` after
  // a JS-disabled submission; a request with none of those params is the ordinary case and this
  // is a no-op. Also reads (and clears) the validation flash cookie, if any, and decides this
  // response's `Cache-Control` — including the member-session arm, which matters here because
  // `visiblePosts` above made this body cookie-dependent. See `resolvePerVisitorResponse`'s doc.
  await sendPublicPage({ req, res, deps, html, perVisitor: resolvePerVisitorResponse(req, res) });
}

/** `GET /` when a Page claims `/`: the template branch when eligible, else the generic post page. */
async function serveContentHomePage({ req, res, deps, theme, homePage, visiblePosts, siteAssistantEnabled, access }: {
  req: Request; res: Response; deps: SiteRequestDeps; theme: DiscoveredTheme | null; homePage: PostRecord;
  visiblePosts: PostRecord[]; siteAssistantEnabled: SiteChatSelection; access: PostPreviewsAccess;
}): Promise<void> {
  const staticMenus = await resolveStaticMenusForRender({ deps, theme, currentPath: "/" });
  const templateHtml = await renderTemplateBranchIfEligible({ deps, theme, post: homePage, staticMenus, siteAssistantEnabled }, { postPreviewsAccess: access });
  const html = templateHtml ?? (await renderGenericPostPage({ deps, theme, post: homePage, posts: visiblePosts, siteAssistantEnabled }));
  await sendPublicPage({ req, res, deps, html, perVisitor: resolvePerVisitorResponse(req, res) });
}

/** `GET /:slug`'s catch: a see-more miss falls through to the 404, a missing post renders the
 *  themed 404, and anything else is a reported 500. */
async function handleSlugRouteError({ err, req, res, next, deps, theme, staticMenus, slug }: {
  err: unknown; req: Request; res: Response; next: NextFunction; deps: SiteRequestDeps;
  theme: DiscoveredTheme | null; staticMenus: StaticMenuMap | undefined; slug: string;
}): Promise<void> {
  if (err instanceof ListingBatchNotFoundError) return listingBatchNotFound({ req, res, next, workspaceId: deps.workspaceId });
  // A `PostNotFoundError` is ordinary control flow on this route (no post at this slug), not a
  // fault — reporting it would bury every real fault under one line per 404 a crawler produces.
  if (err instanceof PostNotFoundError) {
    await handlePostNotFoundInSlugCatch({ req, res, deps, theme, staticMenus, slug });
    return undefined;
  }
  reportSiteRenderFault({ detail: `GET /:slug failed (slug=${slug})`, err });
  res.status(500).type("html").send("<h1>Site error</h1>");
  return undefined;
}

/**
 * Serve a page that has no row of its own (core's member sign-in pages, `member-pages.ts`) through
 * the same path an html-format Page takes, so it wears the active theme's page template, header and
 * footer on every tier. `post` lives only in memory: on the template branch its body reaches the
 * content slot through `renderViaTemplate`'s pending-body override (keyed to its id, the one the
 * admin preview uses), so no repo lookup runs for it. Errors propagate to the caller.
 */
export async function serveVirtualPage({ req, res, deps, post }: {
  req: Request; res: Response; deps: RouteDeps; post: PostRecord;
}): Promise<void> {
  deps = withListingBatch(deps, req);
  const [activeThemeId, siteAssistantEnabled] = await Promise.all([
    resolveRenderThemeId(res, deps),
    resolveSiteAssistantWidgetForRequest({ request: req, deps }),
  ]);
  const resolved = resolveActiveTheme({ deps, activeThemeId });
  if (resolved === null) return sendNoThemesInstalled(res);
  const theme = resolved === NO_THEME_ID ? null : resolved;
  const branch = theme ? resolveTemplateBranchChoice({ theme, post }) : { kind: "ineligible" as const };
  const perVisitor = resolvePerVisitorResponse(req, res);
  const previewPost = branch.kind === "page-shell" ? { ...post, templateChoice: branch.templateChoice } : post;
  const html = theme && branch.kind !== "ineligible"
    ? await renderViaTemplate({ deps, theme, post: previewPost, staticMenus: await resolveStaticMenusForRender({ deps, theme, currentPath: req.path }) }, { pendingBodyJson: undefined, pendingBodyHtml: post.bodyHtml ?? "", extraHead: undefined, siteAssistantEnabled })
    : await renderGenericPostPage({ deps, theme, post, posts: [], siteAssistantEnabled });
  await sendPublicPage({ req, res, deps, html, perVisitor });
  return undefined;
}

/** `GET /`. */
const registerHomeRoute: RouteRegistrar = ({ app, deps: appDeps }, _options = {}) => {
  app.get("/", async (req, res, next) => {
    const deps = withListingBatch(appDeps, req);
    try {
      await serveHomePage({ req, res, deps });
    } catch (err) {
      if (err instanceof ListingBatchNotFoundError) return listingBatchNotFound({ req, res, next, workspaceId: deps.workspaceId });
      reportSiteRenderFault({ detail: "GET / failed", err });
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
    return undefined;
  });
};

/** Nested public paths: redirect rules, then the normal 404. */
const registerNestedPathRoute: RouteRegistrar = ({ app, deps: appDeps }, _options = {}) => {
  // Earlier content routes keep precedence, even over override rules. Restrict this fallback to
  // nested paths so single-segment slug eligibility stays unchanged; admin/API misses stay theirs.
  app.get(/^\/[^/]+\/.+/, async (req, res, next) => {
    if (checkSiteRelativeTarget({ raw: req.path }).kind !== "ok") return next();
    try {
      if (await tryRedirectPhase({ phase: "pre_content", path: req.path, workspaceId: appDeps.workspaceId, res })) return undefined;
      if (await tryRedirectPhase({ phase: "post_content", path: req.path, workspaceId: appDeps.workspaceId, res })) return undefined;
      next();
    } catch (err) {
      next(err);
    }
    return undefined;
  });
};

/** `GET /:slug`. */
const registerSlugRoute: RouteRegistrar = ({ app, deps: appDeps }, _options = {}) => {
  app.get("/:slug", asyncRoute({ handler: async (req, res, next) => {
    const deps = withListingBatch(appDeps, req);
    const slug = resolveRequestedSlug(req, next);
    if (slug === undefined) return;

    let theme: DiscoveredTheme | null = null;
    let staticMenus: StaticMenuMap | undefined;
    try {
      if (await tryRedirectPhase({ phase: "pre_content", path: redirectLookupPath({ req }), workspaceId: deps.workspaceId, res })) return;

      const memberAccessResolver = createMemberAccessResolver({ deps });
      const [activeThemeId, { posts }, siteAssistantEnabled, memberContext] = await Promise.all([
        resolveRenderThemeId(res, deps),
        listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
        resolveSiteAssistantWidgetForRequest({ request: req, deps }),
        resolveMemberContextForRequest({ req, deps, resolver: memberAccessResolver }),
      ]);

      // Same ADR-030 §4 listing filter the `GET /` handler applies — this list feeds the generic
      // post page's "more dispatches"/related regions, which print titles and links exactly like
      // the home grid does.
      const visiblePosts = filterVisiblePosts({ resolver: memberAccessResolver, posts, context: memberContext });

      const resolved = resolveActiveTheme({ deps, activeThemeId });
      if (resolved === null) {
        sendNoThemesInstalled(res);
        return;
      }
      // Same `=== null` vs. sentinel split as the `GET /` handler above — see its comment.
      theme = resolved === NO_THEME_ID ? null : resolved;

      // Resolved once per request (not just for the marketing-page branch below) — the requested
      // path is the correct `currentPath` for `isCurrent` regardless of whether this request ends up
      // rendering a marketing page, a post-template page, or the themed 404 below; all three share
      // this one resolve rather than re-querying the same two locations per branch.
      staticMenus = await resolveStaticMenusForRender({ deps, theme, currentPath: req.path });

      // Post/Redirect/Get result for a form widget on THIS route (2026-08-31 fix, generalized the
      // same day) — resolved once and applied uniformly across all three branches below, the same
      // "compute once, thread to every branch" shape `siteAssistantEnabled` already uses on this
      // handler (ADR-054). A request with none of the `form_*` params (the ordinary case) decodes to
      // `undefined`, and `injectFormSubmissionResultIntoHtml` is a no-op for that. Also reads (and
      // clears) the validation flash cookie, if any, and decides this response's `Cache-Control` —
      // including the member-session arm, which matters here because `visiblePosts` above made this
      // body cookie-dependent. See `resolvePerVisitorResponse`'s own doc.
      const perVisitor = resolvePerVisitorResponse(req, res);

      const marketingResolution = await resolveMarketingPageOrOverride({ deps, theme, slug, staticMenus, siteAssistantEnabled }, { postPreviewsAccess: {
        resolver: memberAccessResolver,
        context: memberContext,
      } });
      if (marketingResolution.kind === "responded") {
        await sendPublicPage({ req, res, deps, html: marketingResolution.html, perVisitor });
        return;
      }

      const post = await resolvePostAfterMarketingCheck({ deps, slug, marketingResolution });

      // ADR-030 §4 — the single-post gate. Kept as the whole `MemberAccessDecision`, not a boolean:
      // `decision.reason` (`sign_in_required` vs `upgrade_required`) and `decision.teaser` are the
      // named seam a future teaser / sign-in-prompt render reads, and collapsing them here would
      // force that follow-up to re-derive the decision a second time. Today every `!allowed` outcome
      // renders one thing — the SAME plain 404 a slug with no post at all gets, produced by the same
      // `handlePostNotFoundOnSlugRoute` rather than a second hand-rolled 404, so a gated post is
      // indistinguishable from a nonexistent one and the response leaks no existence signal.
      //
      // Placed BEFORE `renderTemplateBranchIfEligible` deliberately: that branch is a complete second
      // render path (`renderViaTemplate` -> `renderStaticPage`) that would otherwise serve the gated
      // body straight past a gate that only guarded the generic path below.
      const decision = decidePostMemberAccess({ resolver: memberAccessResolver, post, context: memberContext });
      if (!decision.allowed) {
        await handlePostNotFoundOnSlugRoute(req, res, deps, theme, staticMenus);
        return;
      }

      const templateHtml = await renderTemplateBranchIfEligible({ deps, theme, post, staticMenus, siteAssistantEnabled }, { postPreviewsAccess: {
        resolver: memberAccessResolver,
        context: memberContext,
      } });
      const html = templateHtml ?? (await renderGenericPostPage({ deps, theme, post, posts: visiblePosts, siteAssistantEnabled }));
      await sendPublicPage({ req, res, deps, html, perVisitor });
    } catch (err) {
      await handleSlugRouteError({ err, req, res, next, deps, theme, staticMenus, slug });
    }
  } }));
};

/**
 * Public site: server-rendered home and post pages through the active
 * declarative theme. Registered LAST — GET /:slug handles single-segment
 * pages; unmatched nested public paths consult redirects before the normal 404.
 */
export const registerSiteRoutes: RouteRegistrar = (required, _options = {}) => {
  // The order is the route table: the rewrites first, then `/`, nested paths, `/:slug`.
  registerListingRewrites(required, {});
  registerHomeRoute(required, {});
  registerNestedPathRoute(required, {});
  registerSlugRoute(required, {});
};

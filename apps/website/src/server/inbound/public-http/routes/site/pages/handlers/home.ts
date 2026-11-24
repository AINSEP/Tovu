import type { SiteChatSelection } from "../../../../http/site/site-chat-markup.js";
import type { Request, Response } from "express";
import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import { getPublishedPostBySlug, listPublishedPosts } from "#src/features/post/post-read";
import { PostNotFoundError, ROOT_SLUG } from "#src/features/post/post";
import { createMemberAccessResolver } from "@jini-ai/user-management/members/access-resolver";
import type { MemberContext } from "@jini-ai/user-management/members/types";
import type { MemberAccessResolver } from "@jini-ai/user-management/members/ports";
import { resolveRenderThemeId } from "../../../../middleware/render-theme-override.js";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { resolveActiveTheme } from "#src/features/theme/active-theme";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { comparePostsByDisplayDate } from "#src/contracts/core/scheduled-publish";
import { renderSite } from "../../../../http/site/render-site.js";
import type { RouteDeps, RouteRegistrar } from "#src/server/routes/types";
import type { SiteRequestDeps, PostPreviewsAccess } from "../render-context/deps.js";
import { resolveSiteTitleForRender, resolveSiteTimeZoneForRender } from "../render-context/site-title.js";
import { ListingBatchNotFoundError } from "@jini-ai/cms/listing/request-state";
import { redirectLookupPath } from "../request-policy.js";
import { withListingBatch } from "../listing/listing-batch.js";
import { resolveMemberContextForRequest, decidePostMemberAccess, filterVisiblePosts } from "../render-context/member-access.js";
import { resolveSiteAssistantWidgetForRequest, resolveWidgetsForRender } from "../render-context/widgets.js";
import { resolveStaticMenusForRender } from "../render-context/static-menus.js";
import { resolveMediaTransformVersionsForRender, resolveMediaAssetMetadataForRender } from "../render-context/media-metadata.js";
import { tryRedirectPhase } from "../redirect-phase.js";
import { buildExtraHead } from "../extra-head.js";
import { resolvePerVisitorResponse, sendPublicPage } from "../response.js";
import { isStaticThemeWithIndex, serveStaticThemeIndex } from "../static-tier.js";
import { listingBatchNotFound } from "./listing.js";
import { renderTemplateBranchIfEligible, renderGenericPostPage } from "./post.js";
import { sendNoThemesInstalled, reportSiteRenderFault } from "./virtual-page.js";

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
  const required = { theme };
  if (isStaticThemeWithIndex(required)) {
    await serveStaticThemeIndex({ req, res, deps, theme: required.theme, staticMenus, extraHead, siteAssistantEnabled, access: { resolver: memberAccessResolver, context: memberContext } });
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
  await sendPublicPage({ req, res, deps, html, perVisitor: resolvePerVisitorResponse({ req, res }) });
}

/** `GET /` when a Page claims `/`: the template branch when eligible, else the generic post page. */
async function serveContentHomePage({ req, res, deps, theme, homePage, visiblePosts, siteAssistantEnabled, access }: {
  req: Request; res: Response; deps: SiteRequestDeps; theme: DiscoveredTheme | null; homePage: PostRecord;
  visiblePosts: PostRecord[]; siteAssistantEnabled: SiteChatSelection; access: PostPreviewsAccess;
}): Promise<void> {
  const staticMenus = await resolveStaticMenusForRender({ deps, theme, currentPath: "/" });
  const templateHtml = await renderTemplateBranchIfEligible({ deps, theme, post: homePage, staticMenus, siteAssistantEnabled }, { postPreviewsAccess: access });
  const html = templateHtml ?? (await renderGenericPostPage({ deps, theme, post: homePage, posts: visiblePosts, siteAssistantEnabled }));
  await sendPublicPage({ req, res, deps, html, perVisitor: resolvePerVisitorResponse({ req, res }) });
}

/** `GET /`. */
export const registerHomeRoute: RouteRegistrar = ({ app, deps: appDeps }, _options = {}) => {
  app.get("/", async (req, res, next) => {
    const deps = withListingBatch({ deps: appDeps, req });
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

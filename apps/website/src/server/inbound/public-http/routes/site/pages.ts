
import { listPublishedPosts } from "#src/features/post/post";
import { createMemberAccessResolver } from "#src/features/members/access-resolver";
import { resolveActiveThemeId } from "#src/features/presentation/active-theme-id";
import { resolveRenderThemeId } from "../../middleware/render-theme-override.js";
import { NO_THEME_ID, resolveActiveTheme } from "#src/features/theme/active-theme";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { checkSiteRelativeTarget } from "#src/platform/routing/index";
import type { RouteRegistrar } from "#src/server/routes/types";
import { asyncRoute } from "../../../shared/async-route.js";
import { resolveRequestedSlug, redirectLookupPath } from "./pages/request-policy.js";
import { withListingBatch } from "./pages/listing/listing-batch.js";
import { resolveMemberContextForRequest, decidePostMemberAccess, filterVisiblePosts } from "./pages/render-context/member-access.js";
import { resolveSiteAssistantWidgetForRequest } from "./pages/render-context/widgets.js";
import { resolveStaticMenusForRender, type StaticMenuMap } from "./pages/render-context/static-menus.js";
import { tryRedirectPhase } from "./pages/redirect-phase.js";
import { resolvePerVisitorResponse, sendPublicPage } from "./pages/response.js";
import { registerListingRewrites } from "./pages/handlers/listing.js";
import { resolveMarketingPageOrOverride, resolvePostAfterMarketingCheck } from "./pages/handlers/marketing.js";
import { renderTemplateBranchIfEligible, renderGenericPostPage } from "./pages/handlers/post.js";
import { sendNoThemesInstalled } from "./pages/handlers/virtual-page.js";
import { handlePostNotFoundOnSlugRoute, handleSlugRouteError } from "./pages/handlers/post-not-found.js";
import { registerHomeRoute } from "./pages/handlers/home.js";

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

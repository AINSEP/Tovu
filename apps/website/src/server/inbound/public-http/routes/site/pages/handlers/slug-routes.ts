import { serveNestedPage, serveSlugPage } from "@jini-ai/cms/public-http/routes/site/pages/handlers/slug-routes";
import { listPublishedPosts } from "@jini-ai/cms/posts/post-read";
import { createMemberAccessResolver } from "@jini-ai/user-management/members/access-resolver";
import { resolveRenderThemeId } from "@jini-ai/cms/public-http/middleware/render-theme-override";
import { resolveActiveThemeId } from "@jini-ai/cms/presentation/site/active-theme-id";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { resolveActiveTheme } from "#src/features/theme/active-theme";
import { runPostContentPhase, runPreContentPhase } from "#src/platform/routing/index";
import type { RouteRegistrar } from "#src/server/routes/types";
import { asyncRoute } from "../../../../../../../platform/express/async-route.js";
import { resolveRequestedSlug, redirectLookupPath } from "../request-policy.js";
import { withListingBatch } from "../listing/listing-batch.js";
import { resolveMemberContextForRequest, decidePostMemberAccess, filterVisiblePosts } from "../render-context/member-access.js";
import { resolveSiteAssistantWidgetForRequest } from "../render-context/widgets.js";
import { resolveStaticMenusForRender } from "../render-context/static-menus.js";
import { tryRedirectPhase } from "@jini-ai/cms/public-http/routes/site/pages/redirect-phase";
import { resolvePerVisitorResponse, sendPublicPage } from "../response.js";
import { resolveMarketingPageOrOverride, resolvePostAfterMarketingCheck } from "./marketing.js";
import { renderTemplateBranchIfEligible, renderGenericPostPage } from "./post.js";
import { sendNoThemesInstalled } from "./virtual-page.js";
import { handlePostNotFoundOnSlugRoute, handleSlugRouteError } from "@jini-ai/cms/public-http/routes/site/pages/handlers/post-not-found";
import { captureVisitorEvent } from "@jini-ai/analytics/site/visitor-analytics";
import { finishStaticTierDocument } from "../static-tier.js";
import { listingBatchNotFound } from "./listing.js";
import { reportSiteRenderFault } from "./virtual-page.js";

/** Nested public paths: redirect rules, then the normal 404. */
// Earlier content routes keep precedence, even over override rules. Restrict this fallback to
// nested paths so single-segment slug eligibility stays unchanged; admin/API misses stay theirs.
export const registerNestedPathRoute: RouteRegistrar = ({ app, deps: appDeps }, _options = {}) =>
  void app.get(/^\/[^/]+\/.+/, (req, res, next) => serveNestedPage({ path: req.path, next,
    tryRedirectPhase: ({ phase, path }) => tryRedirectPhase({ phase, path, workspaceId: appDeps.workspaceId, res, routing: { runPreContentPhase, runPostContentPhase } }),
  }));

/** `GET /:slug`. */
export const registerSlugRoute: RouteRegistrar = ({ app, deps: appDeps }, _options = {}) =>
  void app.get("/:slug", asyncRoute({ handler: (req, res, next) => ((deps) => serveSlugPage({
    withListingBatch: () => undefined, resolveRequestedSlug: () => resolveRequestedSlug({ req, next }),
    preRedirect: () => tryRedirectPhase({ phase: "pre_content", path: redirectLookupPath({ req }), workspaceId: deps.workspaceId, res, routing: { runPreContentPhase, runPostContentPhase } }),
    context: {
      createMemberAccessResolver: () => createMemberAccessResolver({ deps }),
      resolveRenderThemeId: () => resolveRenderThemeId({ response: res, resolveStoredThemeId: () => resolveActiveThemeId(deps) }),
      listPublishedPosts: () => listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
      resolveSiteAssistantWidgetForRequest: () => resolveSiteAssistantWidgetForRequest({ request: req, deps }),
      resolveMemberContextForRequest: ({ resolver }) => resolveMemberContextForRequest({ req, deps, resolver }), filterVisiblePosts,
    },
    noThemeId: NO_THEME_ID, resolveActiveTheme: ({ activeThemeId }) => resolveActiveTheme({ deps, activeThemeId }), sendNoThemesInstalled: () => sendNoThemesInstalled(res), get currentPath() { return req.path; },
    resolveStaticMenusForRender: required => resolveStaticMenusForRender({ deps, ...required }), resolvePerVisitorResponse: () => resolvePerVisitorResponse({ req, res }),
    resolveMarketingPageOrOverride: (required, optional) => resolveMarketingPageOrOverride({ deps, ...required }, optional),
    resolvePostAfterMarketingCheck: required => resolvePostAfterMarketingCheck({ deps, ...required }), decidePostMemberAccess,
    handlePostNotFoundOnSlugRoute: ({ theme, staticMenus }) => handlePostNotFoundOnSlugRoute({
      redirect: () => tryRedirectPhase({ phase: "post_content", path: redirectLookupPath({ req }), workspaceId: deps.workspaceId, res, routing: { runPreContentPhase, runPostContentPhase } }),
      theme, currentPath: req.path, staticMenus, finishStaticTierDocument: input => finishStaticTierDocument({ deps, input }, {}),
      recordNotFound: () => void captureVisitorEvent({ deps, request: req, name: "site_not_found", properties: { routeTemplate: "/:slug" } }),
      fallbackHtml: "<h1>404 — page not found</h1><p><a href='/'>Home</a></p>", send: reply => void res.status(reply.status).type("html").send(reply.html),
    }),
    renderTemplateBranchIfEligible: (required, optional) => renderTemplateBranchIfEligible({ deps, ...required }, optional),
    renderGenericPostPage: required => renderGenericPostPage({ deps, ...required }), sendPublicPage: required => sendPublicPage({ req, res, deps, ...required }),
    handleSlugRouteError: ({ err, theme, staticMenus, slug }) => handleSlugRouteError({
      err, listing: () => listingBatchNotFound({ req, res, next, workspaceId: deps.workspaceId }),
      missing: () => handlePostNotFoundOnSlugRoute({
        redirect: () => tryRedirectPhase({ phase: "post_content", path: redirectLookupPath({ req }), workspaceId: deps.workspaceId, res, routing: { runPreContentPhase, runPostContentPhase } }),
        theme, currentPath: req.path, staticMenus, finishStaticTierDocument: input => finishStaticTierDocument({ deps, input }, {}),
        recordNotFound: () => void captureVisitorEvent({ deps, request: req, name: "site_not_found", properties: { routeTemplate: "/:slug" } }),
        fallbackHtml: "<h1>404 — page not found</h1><p><a href='/'>Home</a></p>", send: reply => void res.status(reply.status).type("html").send(reply.html),
      }),
      report: err => reportSiteRenderFault({ detail: `GET /:slug failed (slug=${slug})`, err }), sendFault: () => void res.status(500).type("html").send("<h1>Site error</h1>"),
    }),
  }))(withListingBatch({ deps: appDeps, req })) }));

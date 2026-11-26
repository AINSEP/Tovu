import { ROOT_SLUG } from "@jini-ai/cms/posts/post";
import { getPublishedPostBySlug, listPublishedPosts } from "@jini-ai/cms/posts/post-read";
import { createMemberAccessResolver } from "@jini-ai/user-management/members/access-resolver";
import { resolveRenderThemeId } from "@jini-ai/cms/public-http/middleware/render-theme-override";
import { resolveActiveThemeId } from "@jini-ai/cms/presentation/site/active-theme-id";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { resolveActiveTheme } from "#src/features/theme/active-theme";
import { renderSite } from "../../../../http/site/render-site.js";
import type { RouteRegistrar } from "#src/server/routes/types";
import { resolveSiteTitleForRender, resolveSiteTimeZoneForRender } from "../render-context/site-title.js";
import { redirectLookupPath } from "../request-policy.js";
import { withListingBatch } from "../listing/listing-batch.js";
import { resolveMemberContextForRequest, decidePostMemberAccess, filterVisiblePosts } from "../render-context/member-access.js";
import { resolveSiteAssistantWidgetForRequest, resolveWidgetsForRender } from "../render-context/widgets.js";
import { resolveStaticMenusForRender } from "../render-context/static-menus.js";
import { resolveMediaTransformVersionsForRender, resolveMediaAssetMetadataForRender } from "../render-context/media-metadata.js";
import { tryRedirectPhase } from "@jini-ai/cms/public-http/routes/site/pages/redirect-phase";
import { runPostContentPhase, runPreContentPhase } from "#src/platform/routing/index";
import { buildExtraHead } from "../extra-head.js";
import { resolvePerVisitorResponse, sendPublicPage } from "../response.js";
import { serveStaticThemeIndex } from "../static-tier.js";
import { serveHomePage } from "@jini-ai/cms/public-http/routes/site/pages/handlers/home";
import { listingBatchNotFound } from "./listing.js";
import { renderTemplateBranchIfEligible, renderGenericPostPage } from "./post.js";
import { sendNoThemesInstalled, reportSiteRenderFault } from "./virtual-page.js";

/** `GET /`. */
export const registerHomeRoute: RouteRegistrar = ({ app, deps: appDeps }, _options = {}) =>
  void app.get("/", (req, res, next) => ((deps) => serveHomePage({
    preRedirect: () => tryRedirectPhase({ phase: "pre_content", path: redirectLookupPath({ req }), workspaceId: deps.workspaceId, res, routing: { runPreContentPhase, runPostContentPhase } }), rootPath: "/",
    context: {
      createMemberAccessResolver: () => createMemberAccessResolver({ deps }),
      listPublishedPosts: () => listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
      resolveRenderThemeId: () => resolveRenderThemeId({ response: res, resolveStoredThemeId: () => resolveActiveThemeId(deps) }),
      resolveSiteAssistantWidgetForRequest: () => resolveSiteAssistantWidgetForRequest({ request: req, deps }),
      resolveMemberContextForRequest: ({ resolver }) => resolveMemberContextForRequest({ req, deps, resolver }), filterVisiblePosts,
    },
    noThemeId: NO_THEME_ID, resolveActiveTheme: ({ activeThemeId }) => resolveActiveTheme({ deps, activeThemeId }), sendNoThemesInstalled: () => sendNoThemesInstalled(res),
    readHomePage: () => getPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug: ROOT_SLUG } }), decidePostMemberAccess,
    resolveStaticMenusForRender: required => resolveStaticMenusForRender({ deps, ...required }),
    renderTemplateBranchIfEligible: (required, optional) => renderTemplateBranchIfEligible({ deps, ...required }, optional),
    renderGenericPostPage: required => renderGenericPostPage({ deps, ...required }),
    title: () => resolveSiteTitleForRender(deps), widgets: required => resolveWidgetsForRender({ deps, ...required }),
    mediaTransformVersions: () => resolveMediaTransformVersionsForRender(deps), extraHead: required => buildExtraHead({ deps, ...required }),
    staticIndex: required => serveStaticThemeIndex({ req, res, deps, ...required }), timeZone: () => resolveSiteTimeZoneForRender(deps),
    mediaAssetMetadata: (required, optional) => resolveMediaAssetMetadataForRender({ deps, ...required }, optional),
    listingAfter: () => deps.listingBatch?.key === 1 ? deps.listingBatch.after : 0,
    renderSite: required => renderSite({ renderAssets: deps.documentAssets, ...required }),
    perVisitor: () => resolvePerVisitorResponse({ req, res }), send: required => sendPublicPage({ req, res, deps, ...required }),
    listingFailure: () => listingBatchNotFound({ req, res, next, workspaceId: deps.workspaceId }),
    reportFault: err => reportSiteRenderFault({ detail: "GET / failed", err }), sendFault: () => void res.status(500).type("html").send("<h1>Site error</h1>"),
  }))(withListingBatch({ deps: appDeps, req })));

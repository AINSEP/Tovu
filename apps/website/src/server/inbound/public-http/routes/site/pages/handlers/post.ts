import { renderTemplateBranchIfEligible as renderTemplateBranch, renderBarePostPage, renderGenericPostPage as renderGenericPage } from "@jini-ai/cms/public-http/routes/site/pages/handlers/post";
import { renderCommentsMarkers } from "@jini-ai/cms/comments/site/public-markers";
import type { SiteChatSelection } from "../../../../http/site/site-chat-markup.js";
import type { PublicPostRecord as PostRecord } from "@jini-ai/cms/posts/post";
import type { MemberContext } from "@jini-ai/user-management/members/types";
import type { MemberAccessResolver } from "@jini-ai/user-management/members/ports";
// Keep request rendering separate from theme installation, imports, and agent tools.
import { resolveTemplateBranchChoice, isBarePageChoice } from "#src/features/theme/static-template-choice";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { postPublicPath } from "#src/platform/routing/index";
import { renderSite } from "../../../../http/site/render-site.js";
import { renderBareEntryDocument } from "../../../../http/site/bare-page.js";
import type { RouteDeps } from "#src/server/routes/types";
import { resolveAssignedTermsForRender } from "@jini-ai/cms/public-http/routes/site/pages/render-context/taxonomy";
import { resolveSiteTitleForRender, resolveSiteTimeZoneForRender } from "../render-context/site-title.js";
import { resolveWidgetsForRender, resolveHtmlEmbedsForRender } from "../render-context/widgets.js";
import type { StaticMenuMap } from "../render-context/static-menus.js";
import { resolveMediaTransformVersionsForRender, resolveMediaAssetMetadataForRender } from "../render-context/media-metadata.js";
import { buildExtraHead } from "../extra-head.js";
import { renderViaTemplate } from "../template-render.js";

async function renderBarePage(deps: RouteDeps, post: PostRecord): Promise<string> {
  return renderBarePostPage({ deps: {
    resolveSiteTitleForRender: () => resolveSiteTitleForRender(deps),
    resolveWidgetsForRender: ({ theme }, optional) => resolveWidgetsForRender({ deps, theme }, optional),
    resolveHtmlEmbedsForRender: ({ post }) => resolveHtmlEmbedsForRender({ deps, post }),
    resolveMediaTransformVersionsForRender: () => resolveMediaTransformVersionsForRender(deps),
    resolveMediaAssetMetadataForRender: ({ post }) => resolveMediaAssetMetadataForRender({ deps, post }),
    buildExtraHead: (required) => buildExtraHead({ deps, ...required }),
    get documentAssets() { return deps.documentAssets; },
    renderBareEntryDocument,
  }, post });
}

export async function renderTemplateBranchIfEligible({ deps, theme, post, staticMenus, siteAssistantEnabled }: { deps: RouteDeps; /* `null` when the operator turned the theme off — see the early return at the top of the body. */ theme: DiscoveredTheme | null; post: PostRecord; staticMenus: StaticMenuMap | undefined; siteAssistantEnabled: SiteChatSelection }, { postPreviewsAccess }: { /* Post-previews marker (2026-09-03) — threaded straight through to `renderViaTemplate`'s own identically-shaped parameter; see that function's doc for the full rationale. */ postPreviewsAccess?: { resolver: MemberAccessResolver; context: MemberContext } } = {}): Promise<string | undefined> {
  return renderTemplateBranch({ post, theme, isBarePageChoice,
    renderBarePostPage: ({ post }) => renderBarePage(deps, post),
    resolveTemplateBranchChoice: ({ post }) => resolveTemplateBranchChoice({ theme: theme!, post }),
    buildExtraHead: async ({ post }) => buildExtraHead({ deps, route: "post", siteTitle: await resolveSiteTitleForRender(deps), post }),
    renderViaTemplate: ({ post }, optional) => renderViaTemplate({ deps, theme: theme!, post, staticMenus }, { ...optional, siteAssistantEnabled, postPreviewsAccess }),
  });
}

export async function renderGenericPostPage({ deps, theme, post, posts, siteAssistantEnabled }: { deps: RouteDeps; /* `null` when the operator turned the theme off — `renderSite` renders the page unstyled. */ theme: DiscoveredTheme | null; post: PostRecord; posts: PostRecord[]; siteAssistantEnabled: SiteChatSelection }, _optional = {}): Promise<string> {
  return renderGenericPage({ deps: {
    resolveSiteTitleForRender: () => resolveSiteTitleForRender(deps),
    resolveWidgetsForRender: ({ post }) => resolveWidgetsForRender({ deps, theme }, { post }),
    resolveHtmlEmbedsForRender: ({ post }) => resolveHtmlEmbedsForRender({ deps, post }),
    resolveMediaTransformVersionsForRender: () => resolveMediaTransformVersionsForRender(deps),
    resolveMediaAssetMetadataForRender: ({ post }, optional) => resolveMediaAssetMetadataForRender({ deps, post }, optional),
    buildExtraHead: (required) => buildExtraHead({ deps, ...required }),
    resolveAssignedTermsForRender: ({ post }) => resolveAssignedTermsForRender({ deps, post }),
    resolveSiteTimeZoneForRender: () => resolveSiteTimeZoneForRender(deps),
    get documentAssets() { return deps.documentAssets; },
    renderCommentsMarkers: ({ html }) => renderCommentsMarkers({ html, providers: deps.commentsProviders, siteId: deps.workspaceId,
      entry: { id: post.id, slug: post.slug, title: post.title, status: post.status, canonicalUrl: postPublicPath({ slug: post.slug }) },
    }, { cursor: deps.commentsCursor, scripts: ({ scripts }) => deps.declaredScripts?.push(...scripts) }),
    renderSite: (required) => renderSite({ ...required, theme }),
  }, post, posts, siteAssistantEnabled });
}

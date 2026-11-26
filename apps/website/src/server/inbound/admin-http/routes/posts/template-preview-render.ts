import { createMemberAccessResolver } from "@jini-ai/user-management/members/access-resolver";
import { createPostPreviewRenderer, type PostPreviewRenderInput, type PostPreviewRenderResult } from "@jini-ai/cms/admin-http/routes/posts/template-preview-render";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import type { MemberAccessResolver } from "@jini-ai/user-management/members/ports";

import { getPresentationSettings } from "#src/features/presentation/index";
import { postPublicPath } from "#src/platform/routing/index";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { isBarePageChoice, resolveTemplateBranchChoice } from "#src/features/theme/index";
import { resolveActiveTheme } from "#src/features/theme/active-theme";
import { renderViaTemplate } from "#src/server/inbound/public-http/routes/site/pages/template-render";
import { resolveMediaAssetMetadataForRender, resolveMediaTransformVersionsForRender } from "#src/server/inbound/public-http/routes/site/pages/render-context/media-metadata";
import { resolveStaticMenusForRender } from "#src/server/inbound/public-http/routes/site/pages/render-context/static-menus";
import { resolveHtmlEmbedsForRender, resolveWidgetsForRender } from "#src/server/inbound/public-http/routes/site/pages/render-context/widgets";
import { renderBareEntryDocument } from "../../../public-http/http/site/bare-page.js";
import { resolveSiteTitle } from "@jini-ai/cms/settings/site/site-title";
import { siteTitleHostBindings } from "#src/features/settings/site-title-legacy";

import type { ContentRouteDeps } from "#src/server/runtime/composition/modules/content";

export async function renderPostPreview({ deps, input }: { deps: ContentRouteDeps; input: PostPreviewRenderInput }, _optional = {}): Promise<PostPreviewRenderResult> {
  return createPostPreviewRenderer({
    getPresentationSettings: () => getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
    isBarePageChoice,
    resolveSiteTitle: () => resolveSiteTitle({
      settingsRepo: deps.settingsRepo,
      preservationStore: deps.siteTitlePreservationStore,
      workspaceRepo: deps.workspaceRepo,
      siteDisplayName: deps.siteDisplayName,
      ...siteTitleHostBindings,
    }, { workspaceId: deps.workspaceId }),
    resolveWidgetsForRender: (required, optional) => resolveWidgetsForRender({ deps, ...required }, optional),
    resolveHtmlEmbedsForRender: required => resolveHtmlEmbedsForRender({ deps, ...required }),
    resolveMediaTransformVersionsForRender: () => resolveMediaTransformVersionsForRender(deps),
    resolveMediaAssetMetadataForRender: required => resolveMediaAssetMetadataForRender({ deps, ...required }),
    renderBareEntryDocument,
    resolveActiveTheme: ({ activeThemeId }) => resolveActiveTheme({ deps, activeThemeId }),
    NO_THEME_ID,
    resolveTemplateBranchChoice: ({ theme, post }) => resolveTemplateBranchChoice({ theme: theme as DiscoveredTheme, post }),
    resolveStaticMenusForRender: ({ theme, currentPath }) => resolveStaticMenusForRender({ deps, theme: theme as DiscoveredTheme, currentPath }),
    postPublicPath,
    createMemberAccessResolver: () => createMemberAccessResolver({ deps }),
    renderViaTemplate: ({ theme, post, staticMenus }, optional) => renderViaTemplate({ deps, theme: theme as DiscoveredTheme, post, staticMenus }, { ...optional, postPreviewsAccess: { resolver: optional.postPreviewsAccess.resolver as MemberAccessResolver, context: optional.postPreviewsAccess.context } }),
    copy: {
      missingTheme: "no themes installed",
      themeOff: "this site has no active theme, so there is no template to preview — activate a theme to use the template picker",
    },
  })({ input });
}

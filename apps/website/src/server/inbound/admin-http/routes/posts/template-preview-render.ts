import { createMemberAccessResolver } from "@jini-ai/user-management/members/access-resolver";
import { renderPostPreview as renderPreview, type PostPreviewRenderInput, type PostPreviewRenderResult } from "@jini-ai/cms/admin-http/routes/posts/template-preview-render";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import type { MemberAccessResolver } from "@jini-ai/user-management/members/ports";

import { type PublicPostRecord as PostRecord } from "@jini-ai/cms/posts/post";
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

/**
 * Bare-page preview (owner ruling 2026-09-23, S5) — mirrors `pages.ts`'s own `renderBarePage`, but
 * built from `ContentRouteDeps`-compatible (Pick-typed) exports only, since this route's `deps` is
 * narrower than the full `RouteDeps` those two functions require. Inline `widgetEmbed` nodes resolve
 * through `resolveWidgetsForRender({ deps, theme: null }, { post })`, the same `theme: null` call the live bare
 * render makes: a doc-format Page can be bare too (the `templateChoice` query/API, not only the Pages
 * picker), and skipping it previewed every inline widget as the placeholder. Skips the SEO
 * `extraHead` fold (`buildExtraHead` is private to `pages.ts` and needs `originRegistry`, not in
 * `ContentRouteDeps`) — a disclosed, low-stakes trim: this is a never-indexed admin iframe, not the
 * public site S4 already covers.
 */
async function renderBarePreview(deps: ContentRouteDeps, post: PostRecord): Promise<string> {
  const [siteTitle, widgets, pageHtmlEmbeds, mediaTransformVersions, mediaAssetMetadata] = await Promise.all([
    resolveSiteTitle(
      {
        settingsRepo: deps.settingsRepo,
        preservationStore: deps.siteTitlePreservationStore,
        workspaceRepo: deps.workspaceRepo,
        siteDisplayName: deps.siteDisplayName,
        ...siteTitleHostBindings,
      },
      { workspaceId: deps.workspaceId }
    ),
    resolveWidgetsForRender({ deps, theme: null }, { post }),
    resolveHtmlEmbedsForRender({ deps, post }),
    resolveMediaTransformVersionsForRender(deps),
    resolveMediaAssetMetadataForRender({ deps, post }),
  ]);
  return renderBareEntryDocument({
    post,
    siteTitle,
    pageHtmlEmbeds,
    widgetInlineResolved: widgets.inlineResolved,
    mediaTransformVersions,
    mediaAssetMetadata,
  });
}

export async function renderPostPreview({ deps, input }: { deps: ContentRouteDeps; input: PostPreviewRenderInput }, _optional = {}): Promise<PostPreviewRenderResult> {
  return renderPreview({ deps: {
    getPresentationSettings: () => getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
    isBarePageChoice,
    renderBarePreview: ({ post }) => renderBarePreview(deps, post),
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
  }, input });
}

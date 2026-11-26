import type { SiteChatSelection } from "../../../http/site/site-chat-markup.js";
import { buildWidgetHostPorts, READ_ONLY_WIDGET_POST_WRITES } from "#src/features/widgets/deps";
import type { Request, Response } from "express";
import type { PublicPostRecord as PostRecord } from "@jini-ai/cms/posts/post";
import { createPublicPostReader } from "@jini-ai/cms/posts/post-read";
import type { MemberContext } from "@jini-ai/user-management/members/types";
import type { MemberAccessResolver } from "@jini-ai/user-management/members/ports";
// Keep request rendering separate from theme installation, imports, and agent tools.
import { renderStaticPage } from "#src/features/theme/static-render";
import { type StaticFeaturedImage } from "#src/features/theme/index";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { expandPartials } from "@jini-ai/cms/widgets/markers";
import { DEFAULT_THEME_SLOTS } from "@jini-ai/cms/themes/theme-slots";
import { markersOfType, COLLECTION_MARKER_TYPE } from "@jini-ai/cms/widgets/markers";
import { collectionMarkerKey, splitCollectionMarkerInner, renderEntryList, listingBatchPath, listingKeyOfAttributes, readListingBatch, renderListingMore } from "@jini-ai/cms/listing";
import { parseCollectionListConfig, humanizeFieldName, entryPublicHref } from "@jini-ai/cms/entries/site/public-list";
import { formatDateLabel, resolveSiteTimeZoneSafely } from "@jini-ai/cms/widgets/date-label";
import { resolveHtmlPageEmbeds } from "@jini-ai/cms/widgets/html";
import { renderHtmlPageBody } from "../../../http/site/render/page-body.js";
import { injectSiteAssistantIntoStaticPage } from "../../../http/site/render/site-assistant-mount.js";
import type { TemplateRenderDeps, SiteRequestDeps, PostPreviewsAccess } from "./render-context/deps.js";
import { resolveSiteTitleForRender, htmlEmbedHostDeps } from "./render-context/site-title.js";
import { resolveStaticMenusForRender, type StaticMenuMap } from "./render-context/static-menus.js";
import { resolvePostPreviewsForRender } from "./render-context/post-previews.js";
import { resolveCollectionListsForRender, type CollectionListsCollaborators } from "@jini-ai/cms/public-http/routes/site/pages/render-context/collection-lists";
import { warnCollectionLists } from "#src/server/runtime/composition/collection-list-warnings";
import { ENTRY_LIST_ATTRIBUTE } from "#src/features/theme/entry-list-markup";
import { resolvePerVisitorResponse, sendPublicPage } from "./response.js";
import { finishStaticTierDocument as finishStaticDocument, serveStaticThemeIndex as serveIndex, staticThemeScripts } from "@jini-ai/cms/public-http/routes/site/pages/static-tier";

/** The CMS domain functions collection-marker resolution is injected with, bound once from their public subpaths. */
const COLLECTION_LIST_COLLABORATORS: CollectionListsCollaborators = {
  listing: { collectionMarkerKey, splitCollectionMarkerInner, renderEntryList, listingBatchPath, listingKeyOfAttributes, readListingBatch, renderListingMore },
  markers: { markersOfType, COLLECTION_MARKER_TYPE },
  entries: { parseCollectionListConfig, humanizeFieldName, entryPublicHref },
  dates: { formatDateLabel, resolveSiteTimeZoneSafely },
};

export const finishStaticTierDocument = (
  { deps, input: { theme, pageId, html, currentPath, staticMenus, postPreviewsAccess, featuredImage, postAuthor } }: { deps: TemplateRenderDeps; input: StaticTierDocumentInput },
  _optional: Record<string, never> = {}
): Promise<string> => finishStaticDocument({ deps: {
    DEFAULT_THEME_SLOTS,
    expandPartials: ({ defaultSlots, html }) => expandPartials({ defaultSlots, html, theme }),
    resolveHtmlPageEmbeds: ({ html }) => resolveHtmlPageEmbeds({
      deps: { host: buildWidgetHostPorts({ postRepo: deps.postRepo, postWrites: READ_ONLY_WIDGET_POST_WRITES }, {}),
        entryRepo: deps.entryRepo,
        postRepo: createPublicPostReader({ repo: deps.postRepo }),
        mediaRepo: deps.mediaRepo,
        transformRepo: deps.transformDefinitionRepo,
        mediaContentTypeStore: deps.mediaContentTypeStore,
        taxonomyRepo: deps.taxonomyRepo,
        termRepo: deps.termRepo,
        ...htmlEmbedHostDeps(deps),
      },
      input: { workspaceId: deps.workspaceId, html },
    }),
    renderHtmlPageBody,
    resolveStaticMenusForRender: ({ currentPath }, optional) => resolveStaticMenusForRender({ deps, theme, currentPath }, optional),
    resolvePostPreviewsForRender: ({ pageHtml, pagePath, postPreviewsAccess }) => resolvePostPreviewsForRender({ deps, memberAccessResolver: postPreviewsAccess.resolver, memberContext: postPreviewsAccess.context, pageHtml, pagePath }),
    resolveCollectionListsForRender: ({ html, pagePath }) => resolveCollectionListsForRender({ deps: { ...deps, entryListAttribute: ENTRY_LIST_ATTRIBUTE, collaborators: COLLECTION_LIST_COLLABORATORS, warn: warnCollectionLists }, html, pagePath }),
    renderStaticPage: (required) => renderStaticPage({ theme, ...required }),
    staticThemeScripts: () => staticThemeScripts({ theme }),
    get documentAssets() { return deps.documentAssets; },
  }, input: { pageId, html, currentPath, staticMenus, postPreviewsAccess, featuredImage, postAuthor } });

/** What {@link finishStaticTierDocument} finishes: one static-tier page of `theme`, and who is asking. */
interface StaticTierDocumentInput {
  readonly theme: DiscoveredTheme;
  readonly pageId: string;
  readonly html: string;
  readonly currentPath: string;
  readonly staticMenus: StaticMenuMap | undefined;
  readonly postPreviewsAccess?: { resolver: MemberAccessResolver; context: MemberContext };
  /** The rendered post's featured image for a `{"type":"featured-image"}` marker (2026-10-05);
   *  omitted on every surface that is not a post, which removes the marker. */
  readonly featuredImage?: StaticFeaturedImage | null;
  readonly postAuthor?: Pick<PostRecord, "id" | "slug" | "author" | "showAuthor">;
}

/** `GET /` through a static theme's own `index.html` (see the E4 note at the call site). */
export const serveStaticThemeIndex = ({ req, res, deps, theme, staticMenus, extraHead, siteAssistantEnabled, access }: {
  req: Request; res: Response; deps: SiteRequestDeps; theme: DiscoveredTheme & { pages: { index: string } };
  staticMenus: StaticMenuMap; extraHead: string; siteAssistantEnabled: SiteChatSelection; access: PostPreviewsAccess;
}): Promise<void> => serveIndex({
  theme, staticMenus, extraHead, siteAssistantEnabled, access, pageId: "index", currentPath: "/",
  title: () => resolveSiteTitleForRender(deps, { preserveAuthoredFallback: true }),
  finish: (required, optional) => finishStaticTierDocument({ deps, ...required }, optional),
  chat: injectSiteAssistantIntoStaticPage,
  perVisitor: () => resolvePerVisitorResponse({ req, res }), send: required => sendPublicPage({ req, res, deps, ...required }),
});

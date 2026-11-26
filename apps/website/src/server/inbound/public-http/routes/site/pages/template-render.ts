import { renderCommentsMarkers } from "@jini-ai/cms/comments/site/public-markers";
import type { SiteChatSelection } from "../../../http/site/site-chat-markup.js";
import { buildWidgetHostPorts, READ_ONLY_WIDGET_POST_WRITES } from "#src/features/widgets/deps";
import type { JsonObject } from "@jini-ai/core/primitives";
import type { PublicPostRecord as PostRecord } from "@jini-ai/cms/posts/post";
import { createPublicPostReader } from "@jini-ai/cms/posts/post-read";
import type { MemberContext } from "@jini-ai/user-management/members/types";
import type { MemberAccessResolver } from "@jini-ai/user-management/members/ports";
// Keep request rendering separate from theme installation, imports, and agent tools.
import { renderStaticPage } from "#src/features/theme/static-render";
import { injectCurrentEntityContentId, injectPageTitle } from "#src/features/theme/static-render-content";
import { resolveTemplate } from "#src/features/theme/static-template-resolution";
import { tokenStylesheetSentinel } from "#src/features/theme/static-asset-contract";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { expandPartials } from "@jini-ai/cms/widgets/markers";
import { DEFAULT_THEME_SLOTS } from "@jini-ai/cms/themes/theme-slots";
import { resolveHtmlPageEmbeds } from "@jini-ai/cms/widgets/html";
import { postPublicPath } from "#src/platform/routing/index";
import { renderAssignedTermsBlock } from "@jini-ai/cms/public-http/http/site/render/post-body";
import { renderHtmlPageBody } from "../../../http/site/render/page-body.js";
import { injectExtraHeadIntoStaticPage } from "@jini-ai/cms/presentation/html";
import { injectSiteAssistantIntoStaticPage } from "../../../http/site/render/site-assistant-mount.js";
import type { TemplateRenderDeps, PostPreviewsAccess } from "./render-context/deps.js";
import { resolveAssignedTermsForRender, placeAfterCurrentContent } from "@jini-ai/cms/public-http/routes/site/pages/render-context/taxonomy";
import { htmlEmbedHostDeps } from "./render-context/site-title.js";
import { MAX_CONTENT_EMBED_FETCHES, resolveHtmlFormatContentMarkers } from "@jini-ai/cms/widgets/content-markers";
import { contentMarkerPorts } from "./render-context/content-marker-ports.js";
import type { StaticMenuMap } from "./render-context/static-menus.js";
import { resolveFeaturedImageForRender } from "./render-context/media-metadata.js";
import { finishStaticTierDocument, staticThemeScripts } from "./static-tier.js";
import { renderTemplateDocument } from "@jini-ai/cms/public-http/routes/site/pages/template-render";

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
function buildMissingTemplateHtml({ apiVersion }: { apiVersion: 2 | undefined }, _optional = {}): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>Template not configured</title>",
    tokenStylesheetSentinel({}, { apiVersion }),
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

export async function renderViaTemplate({ deps, theme, post, staticMenus }: { deps: TemplateRenderDeps; theme: DiscoveredTheme; post: PostRecord; staticMenus: StaticMenuMap | undefined }, { pendingBodyJson, pendingBodyHtml, extraHead, siteAssistantEnabled = false, postPreviewsAccess }: { pendingBodyJson?: JsonObject; pendingBodyHtml?: string; extraHead?: string; siteAssistantEnabled?: SiteChatSelection; /* Post-previews marker (2026-09-03) — the member-access resolver/context for THIS request, ALREADY built by the caller (`registerSiteRoutes` reuses the same instances it built for the home/related-posts listing gate; the admin preview supplies anonymous visitor access). A direct caller that omits it leaves any `{"type":"post-previews"}` marker's authored fallback untouched, byte-identical to before this marker existed, rather than querying with no way to gate the result correctly. Preview used to omit it too, which hid real lists and their See more button. */ postPreviewsAccess?: { resolver: MemberAccessResolver; context: MemberContext } } = {}): Promise<string> {
  return renderTemplateDocument({ deps: {
    resolveTemplate: ({ templateChoice }) => resolveTemplate({ theme, templateChoice }),
    /**
     * The operator-facing "template not configured" page for a diagnostic template resolution, with the
     * theme's document assets folded into its head.
     */
    // `renderStaticPage`'s `| null` return (static-render.ts) is exactly its own `source ===
    // undefined` case, where `source = htmlOverride ?? theme.pages[pageId]` — reachable only when
    // BOTH are undefined. `htmlOverride` here is `buildMissingTemplateHtml(...)`'s return value,
    // typed `string` (never `undefined`), so `source` can never be undefined at this call site and
    // `renderStaticPage` can never return `null` here. The `?? ""` below is accordingly unreachable
    // dead code by construction, not merely untested — proper fix is narrowing `renderStaticPage`'s
    // own return type via an overload keyed on a required `htmlOverride`, which lives outside this
    // file (static-render.ts) and is out of this pass's scope.
    renderMissingTemplatePage: async ({ staticMenus }) => injectExtraHeadIntoStaticPage({ html: renderStaticPage({
      theme,
      pageId: "template-missing",
      htmlOverride: buildMissingTemplateHtml({ apiVersion: theme.manifest.apiVersion }),
      menus: staticMenus,
    }) ?? "", extraHead: (await deps.documentAssets?.({ scripts: staticThemeScripts({ theme }), static: true }))?.head }),
    expandPartials: ({ html }) => expandPartials({ defaultSlots: DEFAULT_THEME_SLOTS, html, theme }),
    injectPageTitle,
    injectCurrentEntityContentId,
    renderAssignedTermsBlock: async ({ post }) => renderAssignedTermsBlock({ terms: await resolveAssignedTermsForRender({ deps, post }) }),
    placeAfterCurrentContent,
    resolveHtmlFormatContentMarkers: ({ html }, optional) => resolveHtmlFormatContentMarkers({ ports: contentMarkerPorts({ deps }), html, depth: 0, budget: { remaining: MAX_CONTENT_EMBED_FETCHES } }, optional),
    resolveHtmlPageEmbeds: ({ html, pendingContentOverride }) => resolveHtmlPageEmbeds({
      deps: { host: buildWidgetHostPorts({ postRepo: deps.postRepo, postWrites: READ_ONLY_WIDGET_POST_WRITES }, {}),
        entryRepo: deps.entryRepo,
        postRepo: createPublicPostReader({ repo: deps.postRepo }),
        mediaRepo: deps.mediaRepo,
        transformRepo: deps.transformDefinitionRepo,
        mediaContentTypeStore: deps.mediaContentTypeStore,
        taxonomyRepo: deps.taxonomyRepo,
        termRepo: deps.termRepo,
        ...htmlEmbedHostDeps(deps),
        ...pendingContentOverride(),
      },
      input: { workspaceId: deps.workspaceId, html },
    }),
    renderHtmlPageBody,
    finishStaticTierDocument: ({ input }, optional) => finishStaticTierDocument({ deps, input: { ...input, theme, postPreviewsAccess: input.postPreviewsAccess as PostPreviewsAccess | undefined } }, optional),
    postPublicPath,
    resolveFeaturedImageForRender: ({ post }) => resolveFeaturedImageForRender({ deps, post }),
    injectSiteAssistantIntoStaticPage,
    renderCommentsMarkers: ({ html, entry }) => renderCommentsMarkers({ html,
      providers: deps.commentsProviders, siteId: deps.workspaceId,
      entry: entry(),
    }, { cursor: deps.commentsCursor }),
  }, post, staticMenus }, { pendingBodyJson, pendingBodyHtml, extraHead, siteAssistantEnabled, postPreviewsAccess });
}

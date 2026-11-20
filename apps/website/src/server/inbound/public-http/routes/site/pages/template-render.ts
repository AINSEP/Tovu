import { renderCommentsMarkers } from "#src/features/comments/public-markers";
import type { SiteChatSelection } from "../../../http/site/site-chat-markup.js";
import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import type { JsonObject } from "@jini-ai/core/primitives";
import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import { createPublicPostReader } from "#src/features/post/post-read";
import type { MemberContext, MemberAccessResolver } from "#src/features/members/index";
// Keep request rendering separate from theme installation, imports, and agent tools.
import { renderStaticPage } from "#src/features/theme/static-render";
import { injectCurrentEntityContentId, injectPageTitle } from "#src/features/theme/static-render-content";
import { resolveTemplate } from "#src/features/theme/static-template-resolution";
import { tokenStylesheetSentinel } from "#src/features/theme/static-asset-contract";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { expandPartials } from "@jini-ai/cms/widgets/markers";
import { DEFAULT_THEME_SLOTS } from "../../../../../../contracts/core/theme-slots.js";
import { resolveHtmlPageEmbeds } from "@jini-ai/cms/widgets/html";
import { postPublicPath } from "#src/platform/routing/index";
import { renderAssignedTermsBlock } from "../../../http/site/render/post-body.js";
import { renderHtmlPageBody } from "../../../http/site/render/page-body.js";
import { injectExtraHeadIntoStaticPage, injectSiteAssistantIntoStaticPage } from "../../../http/site/render/static-page-injection.js";
import type { TemplateRenderDeps } from "./render-context/deps.js";
import { resolveAssignedTermsForRender, placeAfterCurrentContent } from "./render-context/taxonomy.js";
import { htmlEmbedHostDeps } from "./render-context/site-title.js";
import { MAX_CONTENT_EMBED_FETCHES, resolveHtmlFormatContentMarkers } from "./render-context/content-markers.js";
import type { StaticMenuMap } from "./render-context/static-menus.js";
import { resolveFeaturedImageForRender } from "./render-context/media-metadata.js";
import { finishStaticTierDocument, staticThemeScripts } from "./static-tier.js";

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

/**
 * Template-picker feature (2026-08-10, unified 2026-08-11) — renders `post` (a Post OR a Page, either
 * `"doc"`- or `"html"`-format) through its chosen static-theme template (`theme.json`'s `templates`
 * array), or the explicit diagnostic page above when unresolvable. Only called when the active theme
 * is `static` tier AND declares a non-empty `templates` array AND `isEligibleForTemplateBranch` (`features/theme/static-render.ts`)
 * returned `true` for this row (checked by the caller) — a theme that doesn't declare `templates`
 * simply doesn't support the feature yet, which is a theme-capability gap, not a per-row
 * misconfiguration, so those themes fall through to the pre-existing generic rendering unchanged.
 *
 * Replaces the separate `renderPostViaTemplate`/`renderPageViaTemplate` — collapsible now that both
 * resolve against the SAME `templates` array and the SAME `"content"` marker, and both need the exact
 * same sequence: resolve which template, fill in the current entity's id, resolve any nested
 * `"html"`-format content, then resolve everything else. Which template (or the diagnostic page) a
 * row resolves to is decided by the pure {@link resolveTemplate} — including the `templateChoice`
 * tri-state, whose `null` vs `""` distinction that function's own doc explains in full. This function
 * owns only the embed-resolution I/O that follows.
 *
 * `injectPageTitle` now runs for BOTH kinds (previously Page-only): a template carrying the
 * `{{title}}` placeholder (`pages-default.html`, `page-shell.html` before the 2026-09-03
 * posts-* / pages-* rename) gets the row's real title regardless of whether a Post or a Page rendered
 * through it; a template with no such placeholder (`posts-default.html`, formerly `blog-post.html`, a
 * disclosed, unchanged limitation — see that function's own doc) is simply unaffected, the same
 * no-op-when-absent contract it already had.
 *
 * Exported (2026-08-11 template-preview fix) for `apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts`, the
 * admin-only "preview this row through a PENDING, not-yet-saved template choice" endpoint —
 * `resolveTemplate` reads `post.templateChoice` alone, so that caller passes a shallow clone of the
 * real record with only `templateChoice` overridden, never persisting the override. Reusing this
 * function directly (rather than a second implementation) is the same "one render pipeline, zero
 * drift" reasoning the file header above gives for the live-site iframe branch in both editors.
 *
 * `pendingBodyJson` (2026-08-12, same fix's `bodyJson` half) — an optional, explicitly-passed
 * override for `post`'s OWN body, threaded into `resolveHtmlPageEmbeds` as a
 * {@link ResolveHtmlPageEmbedsDeps.pendingContentOverride} keyed to `post.id`. Without this, the
 * current entity's own `{"type":"content"}` slot (`injectCurrentEntityContentId`, immediately below)
 * re-fetches `post.id` from `postRepo` regardless of what `post.bodyJson` the caller passed in here —
 * `post`'s OTHER fields (title via `injectPageTitle` two lines below, `templateChoice` via
 * `resolveTemplate` above) already flow through because this function reads them directly, but the
 * BODY only ever reaches the page through that separate marker-resolution round trip. `undefined`
 * (every pre-existing call site) is byte-identical to before this parameter existed — see the
 * override field's own doc for why this is scoped to one id and never ambient state.
 *
 * `pendingBodyHtml` (2026-09-09, `bodyHtml` half of the same pending-body fix) — the equivalent
 * override for an `"html"`-format `post` (a Page written through the Pages admin editor, `bodyHtml`
 * not `bodyJson`). `pendingBodyJson`/`pendingContentOverride` cannot cover this case: an `"html"`-
 * format entity's own `{"type":"content"}` slot is resolved by {@link resolveHtmlFormatContentMarkers}
 * below, which runs strictly BEFORE `resolveHtmlPageEmbeds` and splices raw HTML directly rather than
 * through the `"post-content"` IR component `pendingContentOverride` feeds. So this is threaded into
 * THAT function's own `pendingHtmlOverride` parameter instead, keyed to `post.id` the same way — see
 * that function's own doc for the full reasoning, including why it can never leak past that one id.
 * `undefined` (every pre-existing call site) is byte-identical to before this parameter existed.
 *
 * `extraHead` (2026-08-19, SPEC-008 T045 gap fix part 3) — this function's own `renderStaticPage`
 * call bypasses `renderSite`/`pageShell` exactly like the marketing-page branch and static-tier home
 * do, so it had the identical SEO-fold drop; spliced in via
 * {@link injectExtraHeadIntoStaticPage} on the resolved-template return only. Deliberately NOT
 * applied to the `"diagnostic"` ("template not configured") return above: that page is an
 * operator-facing error state, not real indexable content — carrying the real entry's canonical/OG
 * tags on it would tell a crawler the broken diagnostic page IS the entry, worse than the drop this
 * fixes. Same reasoning `registerSiteRoutes`'s themed-404 branch is left out for (see that call
 * site's own comment). Optional and omitted by both existing callers that don't render the live
 * public page (`apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts`'s pending-preview endpoint), matching every
 * other optional parameter's "omit = unchanged prior behavior" contract in this file.
 *
 * `siteAssistantEnabled` (ADR-054 gap fix) — this function's own `renderStaticPage` call has the
 * identical `pageShell`-bypassing shape the visitor-chat widget missed the same way `extraHead` did;
 * spliced in via {@link injectSiteAssistantIntoStaticPage} on the resolved-template return only, same
 * "not the diagnostic branch" scoping `extraHead` already follows immediately above. Defaults to
 * `false` so both existing callers (the admin preview endpoint, which must never show the public
 * widget in a preview iframe, and the two direct tests) keep their prior behavior unchanged.
 */
export async function renderViaTemplate({ deps, theme, post, staticMenus }: { deps: TemplateRenderDeps; theme: DiscoveredTheme; post: PostRecord; staticMenus: StaticMenuMap | undefined }, { pendingBodyJson, pendingBodyHtml, extraHead, siteAssistantEnabled = false, postPreviewsAccess }: { pendingBodyJson?: JsonObject; pendingBodyHtml?: string; extraHead?: string; siteAssistantEnabled?: SiteChatSelection; /* Post-previews marker (2026-09-03) — the member-access resolver/context for THIS request, ALREADY built by the caller (`registerSiteRoutes` reuses the same instances it built for the home/related-posts listing gate; the admin preview supplies anonymous visitor access). A direct caller that omits it leaves any `{"type":"post-previews"}` marker's authored fallback untouched, byte-identical to before this marker existed, rather than querying with no way to gate the result correctly. Preview used to omit it too, which hid real lists and their See more button. */ postPreviewsAccess?: { resolver: MemberAccessResolver; context: MemberContext } } = {}): Promise<string> {
  const resolution = resolveTemplate({ theme, templateChoice: post.templateChoice });
  if (resolution.kind === "diagnostic") {
    return renderMissingTemplatePage({ deps, theme, staticMenus });
  }
  const { pageId, html: rawTemplate } = resolution;

  // Expand before content resolution so a partial's own byline suppresses the core header too.
  const withTitle = injectPageTitle({ html: expandPartials({ defaultSlots: DEFAULT_THEME_SLOTS, html: rawTemplate, theme: theme }), title: post.title });
  const withCurrentId = injectCurrentEntityContentId({ html: withTitle, entityId: post.id });
  // Taxonomy render-surface gap fix (2026-09-02): assigned terms are metadata ABOUT the entry, not
  // part of its authored body, so they go in the conventional "filed under" position: right after
  // the entry's own content element, inside the template's `<article>`. Placed BEFORE the content
  // resolves, while the marker can still be found. They used to be appended to the fully resolved
  // template, which put them after `</html>`, under the footer (owner report, plannie, 2026-10-11).
  const withTerms = placeAfterCurrentContent({
    html: withCurrentId,
    post,
    block: renderAssignedTermsBlock(await resolveAssignedTermsForRender({ deps, post })),
  });
  const withNestedContent = await resolveHtmlFormatContentMarkers({ deps, html: withTerms, depth: 0, budget: { remaining: MAX_CONTENT_EMBED_FETCHES } }, { pendingHtmlOverride: pendingBodyHtml !== undefined ? { id: post.id, slug: post.slug, bodyHtml: pendingBodyHtml } : undefined });
  const resolved = await resolveHtmlPageEmbeds({
    deps: { host: buildWidgetHostPorts({ postRepo: deps.postRepo }, {}),
      entryRepo: deps.entryRepo,
      postRepo: createPublicPostReader({ repo: deps.postRepo }),
      mediaRepo: deps.mediaRepo,
      transformRepo: deps.transformDefinitionRepo,
      mediaContentTypeStore: deps.mediaContentTypeStore,
      taxonomyRepo: deps.taxonomyRepo,
      termRepo: deps.termRepo,
      ...htmlEmbedHostDeps(deps),
      ...(pendingBodyJson !== undefined
        ? { pendingContentOverride: { id: post.id, title: post.title, slug: post.slug, updatedAt: post.updatedAt, publishAt: post.publishAt ?? null, bodyJson: pendingBodyJson } }
        : {}),
    },
    input: { workspaceId: deps.workspaceId, html: withNestedContent },
  });
  const bodyWithTerms = renderHtmlPageBody({ html: withNestedContent, resolved }, { postAuthor: post, postPresentation: post });
  // D2's single static-tier pipeline (E3, 2026-09-23) — `finishStaticTierDocument` runs the SAME
  // expand-partials / resolve-embeds / resolve-post-previews / render sequence every other
  // static-tier surface now runs. Called on `bodyWithTerms`, not the raw, unassembled template: the
  // body stage above already ran, so widget/media/post/content markers are already consumed (this
  // second pass is a no-op for them) and it now ALSO picks up any marker that came from a partial
  // (invisible before `expandPartials` ran) or was authored directly in `post`'s own `body_html`
  // (the fixed live bug — `post-previews`/`menu` used to be scanned off `rawTemplate` alone, which
  // could never see either).
  const rendered = await finishStaticTierDocument({ deps, input: {
    theme,
    pageId,
    html: bodyWithTerms,
    currentPath: postPublicPath({ slug: post.slug }),
    staticMenus,
    postPreviewsAccess,
    // Featured image (2026-10-05): the static tier's counterpart of the templated tiers'
    // `post.featuredImage` — resolved through the SAME metadata/transform lookups and the SAME
    // `featuredImageView`, so both tiers show the identical URL and alt. Before this, the static
    // path never looked the featured asset up at all and it only ever reached `og:image`.
    featuredImage: await resolveFeaturedImageForRender({ deps, post: pendingBodyJson !== undefined ? { ...post, bodyJson: pendingBodyJson } : post }),
    postAuthor: post,
  } }, {});
  return renderCommentsMarkers({ html: injectSiteAssistantIntoStaticPage({ html: injectExtraHeadIntoStaticPage({ html: rendered, extraHead }), enabled: siteAssistantEnabled }),
    providers: deps.commentsProviders, siteId: deps.workspaceId,
    entry: { id: post.id, slug: post.slug, title: post.title, status: post.status, canonicalUrl: postPublicPath({ slug: post.slug }) },
  }, { cursor: deps.commentsCursor });
}

/**
 * The operator-facing "template not configured" page for a diagnostic template resolution, with the
 * theme's document assets folded into its head.
 */
async function renderMissingTemplatePage({ deps, theme, staticMenus }: { deps: TemplateRenderDeps; theme: DiscoveredTheme; staticMenus: StaticMenuMap | undefined }, _optional = {}): Promise<string> {
  // `renderStaticPage`'s `| null` return (static-render.ts) is exactly its own `source ===
  // undefined` case, where `source = htmlOverride ?? theme.pages[pageId]` — reachable only when
  // BOTH are undefined. `htmlOverride` here is `buildMissingTemplateHtml(...)`'s return value,
  // typed `string` (never `undefined`), so `source` can never be undefined at this call site and
  // `renderStaticPage` can never return `null` here. The `?? ""` below is accordingly unreachable
  // dead code by construction, not merely untested — proper fix is narrowing `renderStaticPage`'s
  // own return type via an overload keyed on a required `htmlOverride`, which lives outside this
  // file (static-render.ts) and is out of this pass's scope.
  return injectExtraHeadIntoStaticPage({ html: renderStaticPage({
      theme,
      pageId: "template-missing",
      htmlOverride: buildMissingTemplateHtml({ apiVersion: theme.manifest.apiVersion }),
      menus: staticMenus,
    }) ?? "", extraHead: (await deps.documentAssets?.({ scripts: staticThemeScripts({ theme }), static: true }))?.head });
}

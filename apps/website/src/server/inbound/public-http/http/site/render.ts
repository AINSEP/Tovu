import type { DocumentAssets } from '@jini-ai/cms/presentation';
import type { DeclaredScript } from '@jini-ai/cookie-consent';
import { renderScriptAssets } from '@jini-ai/cookie-consent/render';
import { formatMoney } from "@jini-ai/commerce/money";
import type { SiteProduct, SiteRenderContext, MediaAssetRenderMeta } from "./render-context.js";
import type { PluginExportRender } from "@jini-ai/cms/widgets/html";
import { renderMediaRawHtml } from "#src/features/widgets/media-html";
import { randomUUID } from "node:crypto";
import { type SiteChatSelection } from "./site-chat-markup.js";
import type { JsonObject, JsonValue } from "@jini-ai/core/primitives";
import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import type { DiscoveredTheme, StaticMenuItem, TemplateNode } from "#src/features/theme/index";
import { resolveTemplateId, resolveLiquidTemplateId, resolveHandlebarsTemplateId } from "#src/features/theme/render-contract";
import { renderStaticPage, renderCoverImageTag } from "#src/features/theme/static-render";
import { projectPostBody, resolveCoverImage } from "#src/features/post/rendering";
import type { ResolveHtmlPageEmbedsResult } from "@jini-ai/cms/widgets/html";
import type { ResolvePageWidgetsResult } from "@jini-ai/cms/widgets";
import { isPageEmbedType } from "@jini-ai/cms/widgets/page-embed-types";
import { renderHtmlTaxonomy } from "#src/features/taxonomy/render-entry";
import type { AssignedTermView } from "#src/features/taxonomy/contracts";
import type { WidgetRenderIR } from "@jini-ai/cms/widgets";
import { formatDateLabel, formatIsoDate } from "@jini-ai/cms/widgets/date-label";
import { substituteHtmlEmbeds, type EmbedOccurrence, type PageHtmlEmbedRef } from "@jini-ai/cms/widgets/html/html-embeds";
import { renderGallery, type GalleryImageRenderer } from "@jini-ai/cms/widgets/html/gallery-render";
import type { MarkerAttribute } from "@jini-ai/cms/widgets/markers";
import { LISTING_BATCH_DEFAULT, listingBatchPath, renderListingMore, wrapListingItems } from "@jini-ai/cms/listing";
import { mediaPublicPath, mediaUrlKey } from "#src/features/media/public-path";
import {
  decodeFormSubmissionResultFromQuery,
  encodeFormSubmissionResultQuery,
  clearFormSubmissionResultQueryParams,
  injectFormSubmissionResultIntoHtml,
  decodeFormFlashCookieValue,
  encodeFormFlashCookieValue,
  mergeFormFlashIntoResult,
  FORM_FLASH_COOKIE_NAME,
  type FormSubmissionRedirectResult,
  type FormFlashPayload,
} from "./form-render.js";
import { escapeHtml } from "#src/platform/html/escape";
import { postAuthorForDisplay } from "#src/contracts/core/post-author";
import { postAuthorForContentHeader } from "#src/features/theme/static-render";
import { postDisplayDateIso } from "#src/contracts/core/scheduled-publish";
import { NO_MARKER_ATTRIBUTES } from "./render/doc/html-attributes.js";
import { renderImageTag, renderVideoTag } from "./render/doc/media-tags.js";
import { injectExtraHeadIntoStaticPage, injectSiteAssistantIntoStaticPage } from "./render/static-page-injection.js";
import { pageShell } from "./render/document-shell.js";
import { isObject, str } from "./render/value-readers.js";
import { styleForAlign } from "./render/doc/text-layout.js";
import { renderWidgetPlaceholder } from "./render/widgets/placeholder.js";
import { renderWidgetSocialLinks, renderWidgetEntrySummary, renderWidgetRecentEntries } from "./render/widgets/social-entries.js";
import { renderWidgetMenu } from "./render/widgets/menu.js";
import { renderWidgetContactForm } from "./render/contact-form-widget.js";
import { mediaPlaceholder } from "./render/media-placeholder.js";
import { hero, announcement, ctaBand, section, featureGrid } from "./render/components/marketing.js";
import { siteHeader, siteFooter, siteNav, siteFooterRich } from "./render/components/layout.js";
import { plausibleMediaRefId } from "./render/doc/media-ref.js";
import type { DocRenderOptions, WidgetDocRendering } from "./render/doc/doc-render-contract.js";
import { renderDocNodeWith, renderNodes, EMPTY_INLINE_RESOLVED, EMPTY_MEDIA_TRANSFORM_VERSIONS, EMPTY_MEDIA_ASSET_METADATA } from "./render/doc/doc-nodes.js";
import { swapManagedDocNodes } from "./render/doc/managed-markers.js";

export type { SiteProduct, SiteRenderContext, MediaAssetRenderMeta } from "./render-context.js";

/**
 * Re-exported so every existing importer of this file (`render.test.ts`, `routes/site/pages.ts`,
 * `routes/site/forms-submit.ts`) keeps working unchanged after the 2026-08-31 "generalize the form
 * pattern" split moved their actual implementations into `form-render.js`. `render.ts` stays the one
 * public-HTTP-rendering façade; `form-render.ts` is the (framework-agnostic) module that owns the
 * form-specific pieces of it.
 */
export {
  decodeFormSubmissionResultFromQuery,
  encodeFormSubmissionResultQuery,
  clearFormSubmissionResultQueryParams,
  injectFormSubmissionResultIntoHtml,
  decodeFormFlashCookieValue,
  encodeFormFlashCookieValue,
  mergeFormFlashIntoResult,
  FORM_FLASH_COOKIE_NAME,
  type FormSubmissionRedirectResult,
  type FormFlashPayload,
};

/** `YYYY-MM-DD` — the calendar day of `iso` in the site's `timeZone` (UTC when absent), so a post
 *  published at 11pm in Los Angeles is not shown as the next day. Bug D follow-up. */
function shortDate({ iso, timeZone }: { iso: string; timeZone: string | undefined }, _optional = {}): string {
  return formatIsoDate({ iso }, timeZone === undefined ? {} : { timeZone });
}

/** No-terms default for every `renderSite`/`renderPostBody` caller that doesn't pass one — same
 * "optional, defaults to empty, degrades to no block" convention as {@link EMPTY_MEDIA_ASSET_METADATA}
 * immediately above. */
const EMPTY_ASSIGNED_TERMS: readonly AssignedTermView[] = [];

/**
 * Renders a TipTap/ProseMirror-style doc node to HTML — {@link renderDocNodeWith} (see its doc for
 * the options) with the widget renderer bound. This is the one place the doc renderer and the
 * widget renderer meet: a `widgetEmbed` node renders through {@link renderWidgetIr}, and the
 * `post-content` widget renders its body through this function.
 */
export function renderDocNode({ node }: { node: JsonValue }, options: DocRenderOptions = {}): string {
  return renderDocNodeWith({ node, renderWidget: renderWidgetIr }, options);
}

/**
 * A stored doc body as HTML a Page can keep. Uses the public renderer so text keeps its exact markup,
 * while widgets and managed media stay live embeds: resolving them here would freeze today's output
 * into the page, or a placeholder where no render context exists. The random token cannot collide
 * with the owner's text. A media node's transform has no marker form, so it takes the default image.
 * @complexity O(n) in doc nodes plus one pass over the rendered HTML.
 */
export function renderDocBodyAsPageHtml({ bodyJson }: { bodyJson: unknown }, _optional = {}): string {
  const token = `DOCMARKER${randomUUID().replace(/-/g, "")}N`;
  const markers: string[] = [];
  const html = renderDocNode({ node: swapManagedDocNodes({ node: bodyJson as JsonValue, token, markers, depth: 0 }) });
  return html.replace(new RegExp(`${token}(\\d+)X`, "g"), (_match, index: string) => markers[Number(index)] ?? "");
}

// ---------------------------------------------------------------------------
// Core component registry (v1) — the safe building blocks a theme references.
// A theme can arrange these by id; it cannot define new ones. This table has no schema,
// capability tier, or isolation boundary (each `Component` runs synchronously, in-render, with
// no timeout), so it stays closed to plugins. A future plugin-contributed component goes through
// the widget-type registry instead (`WidgetTypeKey`/`CORE_RESOLVERS`, `Jini/packages/cms/src/widgets/registry.ts`),
// which already has schema validation, tier gating, and a try/catch+timeout isolation boundary —
// see the Widget IR rendering block below for that seam's own dispatch (ADR-047; ratified by
// `ADS-memory/reports/architecture/2026-08-20-component-catalog-split-proposal.md`).
// ---------------------------------------------------------------------------

type Component = (ctx: SiteRenderContext, props: JsonObject) => string;

function entryList(ctx: SiteRenderContext, props: JsonObject): string {
  const layout = typeof props.layout === "string" ? props.layout : "index";
  // Home pages its already-visible posts as see-more listing 1; numbering continues from `after`.
  const after = ctx.listing?.after ?? 0;
  const shown = ctx.listing === undefined ? ctx.posts : ctx.posts.slice(after, after + LISTING_BATCH_DEFAULT);
  const items = shown
    .map((post, i) => {
      const folio = String(after + i + 1).padStart(2, "0");
      const cover = featuredImageView(ctx, post);
      const image = cover ? renderCoverImageTag({ image: cover }, { loading: "lazy" }) : "";
      return `<li class="entry"><a class="entry-link" href="/${escapeHtml({ text: post.slug })}">${image}<span class="entry-index">№ ${folio}</span><h2 class="entry-title">${escapeHtml({ text: post.title })}</h2><p class="entry-meta">${escapeHtml({ text: shortDate({ iso: postDisplayDateIso(post), timeZone: ctx.timeZone }) })}</p></a></li>`;
    })
    .join("");
  const body = items || `<li class="entry entry--empty"><p>No published posts yet.</p></li>`;
  if (ctx.listing === undefined || items === "") {
    return `<section class="entry-list entry-list--${escapeHtml({ text: layout })}"><div class="wrap"><ol class="entries">${body}</ol></div></section>`;
  }
  const next = after + shown.length;
  const more = next < ctx.posts.length ? renderListingMore({ key: 1, href: listingBatchPath({ pagePath: ctx.listing.pagePath, key: 1, after: next }) }) : "";
  return `<section class="entry-list entry-list--${escapeHtml({ text: layout })}"><div class="wrap"><ol class="entries" data-jini-listing="1">${wrapListingItems({ key: 1, items })}</ol>${more}</div></section>`;
}

/**
 * Products-route counterpart to `entryList` above, used by `fallbackBody()` for any theme with no
 * dedicated `products` template (declarative tier's own `resolveTemplateId`, or a static/templated
 * theme that never declared one). Mirrors `entryList`'s markup shape (`entry`/`entry-title`/
 * `entry-meta` classes, same empty-state convention) rather than inventing a second vocabulary, so
 * a theme author styling one gets the other for free.
 *
 * 2026-08-12 fix: before this, `fallbackBody()` routed the `"products"` route through `entryList`
 * itself, which reads only `ctx.posts` — so a theme with no `products` template (the seeded default
 * `"basic"` among them) rendered an empty post list for `/products` regardless of how many real
 * products the caller passed in. See this file's test suite for the regression this closes.
 *
 * @complexity Time: O(p) in `ctx.products.length`. Space: O(p) for the joined markup.
 */
function productEntryList(ctx: SiteRenderContext): string {
  const items = ctx.products
    .map((product, i) => {
      const folio = String(i + 1).padStart(2, "0");
      const price = escapeHtml({ text: formatProductMoney({ amount: product.price, currency: product.currency }) });
      // `|| product.id`: defensive, not the normal path — every real `SiteProduct` source
      // (`storefront.ts`'s `toSiteProduct`, `Jini packages/commerce/src/store/store-plugin.ts`'s `listProducts`) always sets a real
      // `slug`. Falls back rather than crashing `escapeHtml` on a caller/test double built against
      // an older, slug-less `SiteProduct` shape.
      return `<li class="entry"><a class="entry-link" href="/products/${escapeHtml({ text: product.slug || product.id })}"><span class="entry-index">№ ${folio}</span><h2 class="entry-title">${escapeHtml({ text: product.title })}</h2><p class="entry-meta">${price}</p></a></li>`;
    })
    .join("");
  const body = items || `<li class="entry entry--empty"><p>No products available yet.</p></li>`;
  return `<section class="entry-list entry-list--products"><div class="wrap"><ol class="entries">${body}</ol></div></section>`;
}

/**
 * Product-detail-route counterpart to `entryContent` above, same "no dedicated template" fallback
 * use and same 2026-08-12 fix reasoning as `productEntryList` — `entryContent` reads only
 * `ctx.post`, so it rendered an empty `<article>` for the `"product"` route no matter what
 * `ctx.product` held.
 *
 * @complexity O(1).
 */
function productEntryContent(ctx: SiteRenderContext): string {
  if (!ctx.product) return "";
  const price = escapeHtml({ text: formatProductMoney({ amount: ctx.product.price, currency: ctx.product.currency }) });
  return `<div class="wrap"><a class="back" href="/products">← ${escapeHtml({ text: ctx.siteTitle })}</a><article class="entry"><h1 class="entry-title">${escapeHtml({ text: ctx.product.title })}</h1><p class="entry-meta">${price}</p></article></div>`;
}

/** REQ-28-shaped default for an embed reference this render never resolved (never attempted, beyond
 * `MAX_HTML_EMBEDS_PER_PAGE`, or a genuine resolution failure) — see `html-embeds.ts`'s
 * `substituteHtmlEmbeds` doc for why no caller needs to distinguish those cases. */
const HTML_EMBED_PLACEHOLDER_IR: WidgetRenderIR = { componentId: "widget-placeholder", props: {} };

/**
 * Substitutes every embed marker THIS STAGE OWNS in an `"html"`-format Page's `bodyHtml` with its
 * resolved markup (SPEC-047 Slice 2, generalized 2026-08-07). Pure — `resolved` is the already-
 * batch-loaded, type-then-id-keyed result of `resolver-service.ts`'s `resolveHtmlPageEmbeds`,
 * computed by the caller (a route handler) ahead of `renderSite`, the same "resolved data in, HTML
 * out" discipline this file's own header states for every other widget-shaped render path here.
 *
 * Within an owned type, `resolved` being `undefined` (no pre-existing caller of `renderSite` passes
 * `pageHtmlEmbeds`), that type having no entry in `resolved`, or a ref having neither a usable `id`
 * NOR `slug` (missing or invalid keys) all degrade identically: widgets contribute nothing; other
 * owned types use the public-safe REQ-28 marker —
 * this function never distinguishes "unresolved" from "unresolvable" from "never attempted", never a
 * crash and never literal, unresolved marker markup reaching a visitor.
 *
 * **Lookup key, 2026-08-31:** `ref.id ?? ref.slug` — `resolveHtmlPageEmbeds`'s per-type resolvers key
 * their returned map by whichever of the two the AUTHORED marker actually carried (never by an id a
 * slug resolved to internally, which this function has no way to know), so the lookup here must use
 * the same key. `ref.id` still wins when both are present, since a slug-only ref never reaches this
 * fallback in the first place ({@link PageHtmlEmbedRef}'s own doc). A type whose resolver never
 * consults `slug` (every type but `widget` today) simply never populates a slug-keyed entry, so this
 * widened lookup is a no-op for them — `undefined ?? null` still misses, same placeholder as before.
 *
 * A marker of an UNOWNED type is a different case and gets the opposite treatment: untouched. Since
 * the 2026-08-10 marker unification every consumer shares one permissive parser, so this stage now
 * sees a theme's `partial` and `menu` markers, which `static-render.ts` resolves AFTER this runs
 * (`pages.ts`'s `renderViaTemplate` calls this, then `renderStaticPage`). Treating those as
 * unknown-and-therefore-placeholder replaced the nav, the docs sidebar menu, and the footer of every
 * post rendered through a theme template with an empty widget placeholder — a page that still looked
 * plausible, which is what made it worth encoding the rule rather than remembering it. See
 * `isPageEmbedType`'s own doc for why ownership is asked of the resolver registry and not inferred
 * from whether resolution produced anything.
 *
 * `options.postAuthor` is supplied by static post routes. Only that entity's content header gets
 * its byline, selected through the theme's author injector; an authored marker/token elsewhere
 * suppresses the automatic credit. The third options object preserves the existing two-argument API.
 *
 * @complexity O(n) time/output space over `html`'s length (author scan plus substitution); O(1) additional work per marker (an
 * ownership check plus two map lookups plus `renderWidgetIr`'s own O(1) dispatch).
 * @overallScore 100
 *
 * Exported for `pages.ts`'s post-template render path (post-template-picker feature, 2026-08-10) —
 * a chosen `blog-post.html` template's `{"type":"post"}` slot substitutes through this exact same
 * function, not a second implementation; the only difference from an `"html"`-format Page is WHERE
 * the html/resolved pair comes from (a theme's `pages/*.html` plus a real-id substitution, not
 * `post.bodyHtml`).
 */
export function renderHtmlPageBody(
  { html, resolved }: { html: string; resolved: ResolveHtmlPageEmbedsResult | undefined }, options: { postAuthor?: Pick<PostRecord, "id" | "slug" | "author" | "showAuthor">; postPresentation?: PostRecord } = {},
): string {
  const postAuthor = options.postAuthor;
  const byline = postAuthor ? postAuthorForContentHeader({ html, post: postAuthor }) : "";
  return substituteHtmlEmbeds({ html: html, resolve: (ref, occurrence) =>
    resolvePageBodyEmbed({ ref, occurrence, resolved, byline }, options) });
}

type PageBodyRenderOptions = Parameters<typeof renderHtmlPageBody>[1];

/** {@link renderHtmlPageBody}'s per-marker resolution (see that function's doc for the full
 *  contract): `undefined` leaves the marker as authored, `""` drops it, anything else replaces it.
 *  @complexity O(1) per marker plus {@link renderWidgetIr}'s own work. */
function resolvePageBodyEmbed(
  { ref, occurrence, resolved, byline }: {
    ref: PageHtmlEmbedRef;
    occurrence: EmbedOccurrence;
    resolved: ResolveHtmlPageEmbedsResult | undefined;
    byline: string;
  },
  { postAuthor, postPresentation }: NonNullable<PageBodyRenderOptions> = {},
): string | PluginExportRender | undefined {
  if (!isPageEmbedType({ type: ref.type })) return undefined;
  // D4 guard (2026-09-23): a "content"/"post" marker naming neither an id nor a slug has no
  // current entity to resolve against at all — e.g. the static theme's own `index.html`, whose
  // `{"type":"content","header":false}` marker names no id because D2's `finishStaticTierDocument`
  // runs this stage over assembled HTML, not a per-entity render. Leave it exactly as authored
  // (return `undefined`, `substituteMarkers`' own "leave as written" contract) instead of
  // degrading to the REQ-28 placeholder, which is the right answer only when an id/slug WAS
  // named but failed to resolve.
  if (isPostEntityRef(ref) && ref.id === null && ref.slug === null) return undefined;
  const resolvedIr = lookupPageEmbedIr({ ref, resolved });
  if (ref.type === "plugin") return pluginExportRender({ ir: resolvedIr });
  // Deleted/missing widget ids must not leave raw markers or placeholder markup on the public site.
  if (ref.type === "widget" && resolvedIr === undefined) return "";
  const formIr = withHtmlFormMode(resolvedIr ?? HTML_EMBED_PLACEHOLDER_IR, ref);
  const authorIr = withCurrentPostByline(formIr, { ref, postAuthor, byline });
  const presented = withPresentedPostBody(authorIr, { ref, post: postPresentation });
  return renderWidgetIr(withOccurrenceMediaAttributes({ ir: withOccurrenceHeader(presented, ref), ref, occurrence }));
}

/** Keep canonical stamps with validated plugin HTML; missing IR retains the authored fallback. */
function pluginExportRender({ ir }: { ir: WidgetRenderIR | undefined }, _options = {}): PluginExportRender | undefined {
  return ir?.componentId === "plugin-export" ? ir.props as unknown as PluginExportRender : undefined;
}

/** A `"content"` or `"post"` marker — the two types that name a post entity. */
function isPostEntityRef(ref: PageHtmlEmbedRef): boolean {
  return ref.type === "content" || ref.type === "post";
}

/** Whether `ref` names `entity`: by id when the marker carries one, by slug otherwise. */
function refNamesEntity(ref: PageHtmlEmbedRef, entity: { id: string; slug: string }): boolean {
  return ref.id !== null ? ref.id === entity.id : ref.slug === entity.slug;
}

/** The resolved IR for `ref`, keyed the way the resolvers key it: placement key, then id, then slug
 *  (see {@link renderHtmlPageBody}'s "Lookup key" note). */
function lookupPageEmbedIr({ ref, resolved }: { ref: PageHtmlEmbedRef; resolved: ResolveHtmlPageEmbedsResult | undefined }, _optional = {}): WidgetRenderIR | undefined {
  const lookupKey = ref.placementKey ?? ref.id ?? ref.slug;
  return lookupKey !== null ? resolved?.get(ref.type)?.get(lookupKey) : undefined;
}

/** A contact form embedded with `"mode":"html"` renders as an HTML-mode form; anything else is
 *  returned unchanged. */
function withHtmlFormMode(ir: WidgetRenderIR, ref: PageHtmlEmbedRef): WidgetRenderIR {
  return ir.componentId === "contact-form" && ref.mode === "html"
    ? { ...ir, props: { ...ir.props, mode: "html" } } : ir;
}

/** Puts `byline` on the post-content header of the CURRENT post's `"content"` marker only. */
function withCurrentPostByline(
  ir: WidgetRenderIR,
  { ref, postAuthor, byline }: { ref: PageHtmlEmbedRef; postAuthor: NonNullable<PageBodyRenderOptions>["postAuthor"]; byline: string },
): WidgetRenderIR {
  // Attach only to the current entity, never to another post explicitly embedded in its template.
  if (ref.type !== "content" || ir.componentId !== "post-content" || !postAuthor || !refNamesEntity(ref, postAuthor)) return ir;
  return { ...ir, props: { ...ir.props, postAuthorByline: byline } };
}

/** Projects the presented post's body (cover-image handling) into a `"content"`/`"post"` marker that
 *  names that same post; every other marker is returned unchanged. @complexity O(body size). */
function withPresentedPostBody(ir: WidgetRenderIR, { ref, post }: { ref: PageHtmlEmbedRef; post: PostRecord | undefined }): WidgetRenderIR {
  if (!post || !isPostEntityRef(ref) || ir.componentId !== "post-content" || !refNamesEntity(ref, post)) return ir;
  const metadata = readMediaAssetMetadata({ value: ir.props.mediaAssetMetadata });
  return { ...ir, props: { ...ir.props, bodyJson: projectPostBody({ post: { ...post, bodyJson: ir.props.bodyJson } }, {
    mediaLookup: ({ ref: mediaRef }) => metadata.get(mediaRef) ?? null,
    hasPublicTransform: readMediaTransformVersions({ value: ir.props.mediaTransformVersions }).has("public"),
  }) as JsonValue } };
}

/**
 * Carries one `"media"` marker occurrence's forwarded attributes (T4's {@link EmbedOccurrence}, D2/D3
 * of the 2026-09-16 embed-attributes plan) onto the `"media-image"` IR `renderWidgetMediaImage` reads
 * — the render-side half of "attributes on the marker element reach the rendered output." Scoped to
 * `ref.type === "media"` producing a `"media-image"` IR: every other type's `occurrence` is the shared
 * `DEFAULT_OCCURRENCE` (`html-embeds.ts`), so this is a no-op for them, and a `"media"` ref that missed
 * resolution carries the `"widget-placeholder"` IR instead, which this also leaves untouched (nothing
 * to attach attributes to).
 *
 * Returns a NEW IR object rather than mutating `ir.props` in place — the SAME `WidgetRenderIR` for one
 * asset id can be read for MULTIPLE marker occurrences on one page (`resolved`'s map is keyed by
 * asset id, not by occurrence), so mutating the shared object would let one occurrence's attributes
 * leak onto another's — the identical race {@link withOccurrenceHeader}'s own doc describes for
 * `"content"` markers' `header` option, fixed here the same way, one call earlier in the pipeline.
 *
 * `markerAttributes`/`controls` are plain-object/primitive `JsonValue`s, not the live
 * {@link MarkerAttribute} objects, because `WidgetRenderIR.props` is a `JsonObject` — normalized back
 * out by {@link normalizeMediaDimensions} on the read side.
 *
 * @complexity O(k) in the occurrence's own attribute count (one array copy).
 */
function withOccurrenceMediaAttributes({ ir, ref, occurrence }: { ir: WidgetRenderIR; ref: PageHtmlEmbedRef; occurrence: EmbedOccurrence }, _optional = {}): WidgetRenderIR {
  if (ref.type !== "media" || ir.componentId !== "media-image") return ir;
  return {
    ...ir,
    props: {
      ...ir.props,
      markerAttributes: occurrence.elementAttributes.map((attr) => ({ name: attr.name, value: attr.value })),
      controls: occurrence.controls,
    },
  };
}

/**
 * Bug fix (2026-09-05, adversarial verification of an externally-reported, never-run finding): a
 * `"content"` marker's `header` option is authored PER OCCURRENCE (`html-embeds.ts`'s own doc on
 * {@link PageHtmlEmbedRef.header}), but `resolver-service.ts`'s `resolveContentTypeEmbeds` stores
 * only ONE `"post-content"` IR per `ref.id` in a `Map` — when the SAME id is embedded twice on one
 * page with different `header` values, both `Map.set` calls race (`Promise.all`) and whichever ref
 * wins decides `props.header` for BOTH occurrences at substitution time, silently dropping the
 * loser's own opt-in/opt-out.
 *
 * Fixed here rather than in `resolver-service.ts` because substitution time is the one place that
 * genuinely knows which specific marker occurrence is being rendered: `substituteHtmlEmbeds` already
 * rebuilds a full, correct, per-occurrence {@link PageHtmlEmbedRef} (header included) for every
 * marker via its own `toEmbedRef`, so `ref.header` here is always right for THIS occurrence — this
 * override simply stops discarding it in favor of the resolve-time Map's collapsed, racy value.
 * Scoped to `ref.type === "content"` producing a `"post-content"` IR — `PageHtmlEmbedRef.header`'s
 * own doc is explicit that `header` is "Not read by widget/media/the legacy post type", and this fix
 * must not widen that contract: the legacy `"post"` type's `"post-content"` IR keeps always showing
 * the header exactly as before, even if a `"post"` marker happens to carry a `header` key.
 */
function withOccurrenceHeader(ir: WidgetRenderIR, ref: PageHtmlEmbedRef): WidgetRenderIR {
  if (ref.type !== "content" || ir.componentId !== "post-content") return ir;
  return { ...ir, props: { ...ir.props, header: ref.header } };
}

/**
 * Renders {@link SiteRenderContext.assignedTerms} as a labelled, PLAIN-TEXT block — never a link.
 * There is still no term-archive route anywhere in this codebase: `urlFor`/`isActive` resolve every
 * `termRef` route target to `null` (`@jini-ai/cms/routing`'s own `TermRefTarget` doc — "NOT
 * resolvable today"), so linking a term here would only ever produce a 404. Terms are grouped by
 * their owning taxonomy's name (e.g. "Category: QA"), preserving the order the caller returned them
 * in (assignment order) rather than sorting alphabetically, so an author who assigned "Tag" before
 * "Category" sees Tag first.
 *
 * Returns `""` for no assigned terms — the overwhelmingly common case while this feature is new — so
 * every page/post with nothing assigned renders byte-identical to before this existed. Shared by
 * every render surface that produces a post/page body: `renderViaTemplate`'s own static-tier splice
 * (`routes/site/pages.ts`) and {@link renderPostBody} (the declarative/templated/handlebars tiers,
 * plus the tierless fallback body) both call this same function rather than keeping separate copies.
 *
 * @complexity O(n) in the number of assigned terms (typically single digits).
 */
export function renderAssignedTermsBlock(terms: readonly AssignedTermView[]): string {
  if (terms.length === 0) return "";
  const groups = new Map<string, string[]>();
  for (const term of terms) {
    const bucket = groups.get(term.taxonomyName);
    if (bucket) bucket.push(term.termName);
    else groups.set(term.taxonomyName, [term.termName]);
  }
  const groupsHtml = Array.from(groups.entries())
    .map(([taxonomyName, termNames]) => {
      const items = termNames.map((name) => `<span class="entry-terms__term">${escapeHtml({ text: name })}</span>`).join(", ");
      return `<span class="entry-terms__group"><span class="entry-terms__taxonomy">${escapeHtml({ text: taxonomyName })}:</span> ${items}</span>`;
    })
    .join(" ");
  return `<div class="entry-terms">${groupsHtml}</div>`;
}

/**
 * Renders `ctx.post`'s body to HTML, branching on `bodyFormat` (SPEC-047 Slice 1). A `"doc"` post
 * walks its TipTap `bodyJson` exactly as before; an `"html"` Page's `bodyHtml` is bespoke,
 * pre-authored markup — there is no tree to walk, so its `data-embed-type`
 * placeholders are substituted by {@link renderHtmlPageBody} (Slice 2) and the result emitted as-is.
 *
 * `body_html` is never HTML-escaped here: SPEC-047/ADR-056's own disclosure (`update-html.ts`'s file
 * header) is that a Page's stored markup carries the same trust level the theme layer already has —
 * escaping it would not make this safer, it would just break the feature (the whole point of an
 * "html" Page is that its body IS HTML, not text describing HTML).
 *
 * Taxonomy render-surface gap fix (2026-09-03) — `ctx.assignedTerms` is appended AFTER the resolved
 * body, not spliced into it: assigned terms are metadata ABOUT the entry, not part of its authored
 * body, the same "filed under" footer position `renderViaTemplate` (`routes/site/pages.ts`) already
 * uses for the static tier. This is the ONE place the declarative, templated (Liquid), and handlebars
 * tiers each read the rendered post body from (`buildTemplateRenderData`'s `post.content`, the
 * declarative `"content"` slot, and the tierless `entryContent` fallback all call this function), so
 * fixing it here closes the gap for all three at once rather than three separate splice points.
 *
 * @complexity O(1) for a `"doc"` post (delegates to `renderDocNode`'s own O(n)); O(n) over
 * `bodyHtml`'s length for an `"html"` Page (delegates to `renderHtmlPageBody`'s own single
 * substitution pass — this function never re-scans). Plus {@link renderAssignedTermsBlock}'s own
 * O(n) over the (typically single-digit) assigned-terms count.
 * @overallScore 100
 */
function renderPostBody(required: { ctx: SiteRenderContext; post: PostRecord }, _optional: Record<string, never> = {}): string {
  // `post` is passed already narrowed (L082b): all three callers (`entryContent`, the `content`
  // slot, `buildTemplateRenderData`) check `ctx.post` first, so the old in-here `!post` guard
  // could never fire.
  const { ctx, post } = required;
  // An "html" body renders unmodified: only `pages.edit_html` holders (theme-source trust) write it,
  // and its own inline scripts are the page (`admin-http/routes/pages/update-html.ts`, Authorization).
  // `sanitizePageHtml` is for less-trusted Raw HTML widget content; on page bodies it stripped
  // tovu.dev's carousel scripts and icons (owner report, 2026-10-12).
  const body =
    post.bodyFormat === "html"
      ? renderHtmlPageBody({ html: post.bodyHtml ?? "", resolved: ctx.pageHtmlEmbeds })
      : renderDocNode({ node: projectPostBody({ post }, { mediaLookup: ({ ref }) => ctx.mediaAssetMetadata.get(ref) ?? null,
          hasPublicTransform: ctx.mediaTransformVersions.has("public") }) as JsonValue }, { inlineResolved: ctx.widgetInlineResolved, mediaTransformVersions: ctx.mediaTransformVersions, mediaAssetMetadata: ctx.mediaAssetMetadata });
  return body + renderAssignedTermsBlock(ctx.assignedTerms);
}

function entryContent(ctx: SiteRenderContext): string {
  if (!ctx.post) return "";
  const author = postAuthorForDisplay({ post: ctx.post });
  // The byline is the date line's next item, a `span` inside `.entry-meta` (2026-10-11): as its own
  // `<p>` after that line it took the theme's body-text size instead of the date's small muted type.
  // `.entry-meta` is a plain text line (no flex gap), so the items need a written separator.
  const date = shortDate({ iso: postDisplayDateIso(ctx.post), timeZone: ctx.timeZone });
  const bylineSeparator = date ? " · " : "";
  const byline = author ? `${bylineSeparator}<span class="post-author">By ${escapeHtml({ text: author })}</span>` : "";
  return `<div class="wrap"><a class="back" href="/">← ${escapeHtml({ text: ctx.siteTitle })}</a><article class="entry"><h1 class="entry-title">${escapeHtml({ text: ctx.post.title })}</h1><p class="entry-meta">${escapeHtml({ text: date })}${byline}</p><div class="prose">${renderPostBody({ ctx, post: ctx.post })}</div></article></div>`;
}

/** Exported for `liquid-worker.ts`: the `render_block` Liquid tag (registered on the isolated worker's own engine) resolves against this same registry, so a Liquid theme and a declarative theme render identical output for the same component id. */
export const COMPONENTS: Record<string, Component> = {
  "tovu/site-header": siteHeader,
  "tovu/entry-list": entryList,
  "tovu/entry-content": entryContent,
  "tovu/site-footer": siteFooter,
  "tovu/hero": hero,
  "tovu/section": section,
  "tovu/feature-grid": featureGrid,
  "tovu/media-placeholder": (_ctx, props) => mediaPlaceholder(props),
  "tovu/announcement": announcement,
  "tovu/nav": siteNav,
  "tovu/cta": ctaBand,
  "tovu/footer": siteFooterRich,
};

/**
 * Renders a resolved `data-embed-type="media"` Page embed (SPEC-047, generalized 2026-08-07;
 * video/embed capability added 2026-08-24) — `resolver-service.ts`'s `resolveMediaTypeEmbeds`
 * already did the I/O (asset lookup, content-type lookup, and — for a non-video asset — transform
 * version lookup) and only ever puts a `"media-image"` IR into its result map once every value
 * below is a validated primitive, so this function's own `isPlausibleMediaRefId`/`typeof` checks
 * are defense-in-depth (mirrors Jini form renderer's re-check-even-though-upstream-
 * validated precedent), not the primary guard. A malformed `props` shape — which should never
 * happen from this codebase's own resolver, only from some future/foreign IR producer — degrades to
 * the ordinary widget placeholder rather than emitting a malformed or unsafe `<img>`/`<video>` tag.
 *
 * Dispatches on `props.contentType` (present only for a video asset — see `resolveMediaTypeEmbeds`'s
 * own doc for why an image asset's IR never carries it) to `renderVideoTag` instead of
 * `renderImageTag`; `transformName`/`version` are irrelevant to a video tag and simply aren't read
 * on that branch. `props.width`/`height`/`cssClass` come through as `JsonValue` (a
 * `WidgetRenderIR.props` is `JsonObject`, so `null` and `number` both need explicit narrowing) —
 * normalized to each render function's `number | null` / `string | null` contract before
 * delegating, same "own it once, reuse everywhere" split `renderImageTag`'s own doc describes.
 */
/** Shape-narrows `renderWidgetMediaImage`'s optional sizing/class props from raw `JsonValue` to each
 *  render function's own `number | null` / `string | null` contract — pulled out so this one
 *  three-field narrowing step stops being three of `renderWidgetMediaImage`'s own branches (complexity-
 *  debt sweep, 2026-09-03; that function was at cyclomatic 11 against this repo's 9 ceiling). No
 *  behavior change: same "wrong-typed value degrades to null, never a lie" rule as before. */
/** Narrows `props.markerAttributes` (the plain-object array {@link withOccurrenceMediaAttributes}
 *  wrote) back to {@link MarkerAttribute}[] — a malformed entry (wrong-typed `name`, a `value` that
 *  is neither `string` nor `null`) is dropped rather than trusted, the same "wrong-typed value
 *  degrades to null/empty, never a lie" rule {@link normalizeMediaDimensions} already applies to
 *  every other field here; this codebase's own IR is the only producer, so this should never actually
 *  reject anything, but a malformed/foreign IR must still degrade safely rather than throw.
 *  @complexity O(n) in the array's length. */
function normalizeMarkerAttributesProp({ value }: { value: JsonValue | undefined }, _optional = {}): readonly MarkerAttribute[] {
  if (!Array.isArray(value)) return NO_MARKER_ATTRIBUTES;
  const attrs: MarkerAttribute[] = [];
  for (const entry of value) {
    if (!isObject(entry) || typeof entry.name !== "string") continue;
    if (typeof entry.value === "string" || entry.value === null) attrs.push({ name: entry.name, value: entry.value });
  }
  return attrs;
}

function normalizeMediaDimensions(props: JsonObject): {
  width: number | null;
  height: number | null;
  cssClass: string | null;
  htmlAttributes: string | null;
  markerAttributes: readonly MarkerAttribute[];
  controls: boolean;
} {
  return {
    width: typeof props.width === "number" ? props.width : null,
    height: typeof props.height === "number" ? props.height : null,
    cssClass: typeof props.cssClass === "string" ? props.cssClass : null,
    htmlAttributes: typeof props.htmlAttributes === "string" ? props.htmlAttributes : null,
    markerAttributes: normalizeMarkerAttributesProp({ value: props.markerAttributes }),
    // `EmbedOccurrence.controls`'s own default (`html-embeds.ts`) is `true`; the ONLY way this ends up
    // `false` is `withOccurrenceMediaAttributes` writing the literal JSON boolean `false` here.
    controls: props.controls !== false,
  };
}

function renderWidgetMediaImage(props: JsonObject): string {
  const assetId = plausibleMediaRefId({ value: props.assetId });
  if (!assetId) {
    return renderWidgetPlaceholder();
  }
  const { width, height, cssClass, htmlAttributes, markerAttributes, controls } = normalizeMediaDimensions(props);
  const alt = str({ value: props.alt });
  // Readable-slugs S3: `resolver-service.ts`'s `resolveOneMediaEmbed` (both its video and image IR
  // branches) stashes the resolved record's `slug` onto the IR alongside `assetId` — same
  // `mediaUrlKey` fallback-to-id rule every other emitter here uses.
  const urlKey = mediaUrlKey({ id: assetId, slug: typeof props.slug === "string" ? props.slug : null });
  const sha256 = typeof props.sha256 === "string" ? props.sha256 : undefined;

  if (typeof props.contentType === "string" && props.contentType.startsWith("audio/")) {
    return renderVideoTag({ kind: "audio", contentType: props.contentType, sha256, urlKey, alt, width: null, height: null, cssClass, htmlAttributes, markerAttributes, controls });
  }
  if (typeof props.contentType === "string" && props.contentType.startsWith("video/")) {
    return renderVideoTag({ contentType: props.contentType, sha256, urlKey, alt, width, height, cssClass, htmlAttributes, markerAttributes, controls });
  }

  const transformName = plausibleMediaRefId({ value: props.transformName });
  const version = props.version;
  if (!transformName || typeof version !== "number") {
    return renderWidgetPlaceholder();
  }
  return renderImageTag({ urlKey, sha256, transformName, version, alt, width, height, cssClass, htmlAttributes, markerAttributes, responsive: props.galleryResponsive === true });
}

/** Gallery image adapter: managed media uses the canonical renderer; URL images retain the
 * document image renderer's scheme, credential and private-admin-route guards. No I/O.
 */
function renderGalleryImage({ image, media, docRendering }: Parameters<GalleryImageRenderer>[0] & { docRendering: WidgetDocRendering }, _optional = {}): string {
  const slug = (image as typeof image & { slug?: string }).slug;
  // URL image: no managed reference. `parseGalleryConfig` (Jini `markers/gallery.ts`) accepts a
  // legacy image only with exactly one of `mediaId`/`src`, and media-mode items are slug-only, so an
  // image reaching here with neither `slug` nor `mediaId` always carries its `src` (L082b: the old
  // `src ?? ""` fallback could not run).
  if (slug === undefined && image.mediaId === undefined && image.src !== undefined) {
    return docRendering.renderDocNode({ node: { type: "image", attrs: { src: image.src, alt: image.alt } } });
  }
  // No `!media` guard here: `renderGallery`'s `renderFigure` (Jini `gallery-render.ts`), this
  // adapter's only caller, already returns `""` for a managed image without a media record before
  // calling it. Even if that ever changed, `media` undefined spreads to no `assetId`, which
  // `renderWidgetMediaImage` already renders as the same widget placeholder.
  return renderWidgetMediaImage({ ...media, alt: image.alt, galleryResponsive: true });
}

/** Gallery compatibility and generic media share one renderer. HTML uses the page-body policy. */
function renderMediaWidget({ ir, docRendering }: { ir: WidgetRenderIR; docRendering: WidgetDocRendering }, _optional: Record<string, never> = {}): string {
  const renderImage: GalleryImageRenderer = ({ image, media }) => renderGalleryImage({ image, media, docRendering });
  const renderOptions = {
    config: ir.props.config, media: ir.props.media, renderImage,
    renderRawHtml: ({ html, media }: { html: string; media: Record<string, JsonObject> }) => renderMediaRawHtml({
      html, media, renderMedia: ({ props }) => renderWidgetMediaImage(props),
    }),
  };
  return renderGallery(renderOptions);
}

/**
 * Renders a resolved `data-embed-type="post"` embed (post-template-picker feature, 2026-08-10) —
 * `resolver-service.ts`'s `resolvePostTypeEmbeds` returns the post's RAW data (title/bodyJson/
 * updatedAt), not rendered HTML, because that resolver lives in `widgets/` and must not depend on
 * this file (see that resolver's own doc). This is the one place that gap closes: `renderDocNode` is
 * already in scope here, so the actual TipTap-to-HTML render happens at this dispatch step, the same
 * "resolve raw, render here" split `renderWidgetMediaImage` uses for media embeds just above.
 *
 * Renders the body with the empty inline-widget/media-transform/media-asset defaults (this file's
 * own `EMPTY_*` constants) — a `widgetEmbed` or ref-image node nested inside a template-embedded
 * post's own body degrades to its normal unresolved-reference placeholder rather than resolving
 * recursively. Disclosed scope limit, not an oversight: no other embed resolver in this codebase
 * resolves nested references either (see `resolveMediaTypeEmbeds`'s own disclosed mime-type gap).
 */
/**
 * Reads `bodyJson`'s leading `title` node (post-title-in-document feature, 2026-08-11 — see the
 * `"title"` case in {@link renderDocNode} for the rest of this feature's server-side half) — present
 * on any post/page saved after the admin editor started synthesizing one (`withTitleNode`, `apps/
 * admin/src/features/posts/rules.ts`), absent on every row saved before that.
 *
 * Returns the node's own inline content, rendered through the SAME `renderNodes` every other doc node
 * uses (marks/escaping included, not a second implementation), plus its `textAlign` attr — or `null`
 * when `bodyJson` doesn't start with a `title` node, which is {@link renderWidgetPostContent}'s
 * back-compat signal to fall back to `props.title` exactly as it did before this feature existed.
 *
 * @complexity O(t) in the title node's own inline content length — no recursion beyond it, and no
 * work at all over the rest of `bodyJson`.
 */
function extractTitleNode(
  { bodyJson, renderNodes }: { bodyJson: JsonValue; renderNodes: WidgetDocRendering["renderNodes"] }, _optional = {}
): { html: string; align: string | null } | null {
  if (!isObject(bodyJson)) return null;
  const content = Array.isArray(bodyJson.content) ? bodyJson.content : undefined;
  const first = content?.[0];
  if (!isObject(first) || first.type !== "title") return null;
  const align = isObject(first.attrs) && typeof first.attrs.textAlign === "string" ? first.attrs.textAlign : null;
  const innerContent = Array.isArray(first.content) ? first.content : undefined;
  return {
    // `0`: this is its own independent render entry point (the title node's inline content, read
    // directly off `bodyJson` rather than reached via `renderDocNode`'s own recursive walk), same as
    // every other top-level caller relying on `renderDocNode`'s own `depth = 0` default.
    html: renderNodes({ nodes: innerContent, inlineResolved: EMPTY_INLINE_RESOLVED, mediaTransformVersions: EMPTY_MEDIA_TRANSFORM_VERSIONS, mediaAssetMetadata: EMPTY_MEDIA_ASSET_METADATA, depth: 0 }),
    align,
  };
}

/**
 * Reconstructs the `mediaTransformVersions` map `renderDocNode`'s `image` case needs, from the
 * plain-JSON form `resolver-service.ts` stashes into `WidgetRenderIR.props` (`widgets/` must not
 * import this file — see that module's own layering note — so it can't build a real `Map` and hand
 * it across the boundary; a `Record<string, number>` is the JSON-safe equivalent). Same
 * defaults-to-empty, never-throws shape every other optional map on this render path already
 * follows: a malformed or absent value degrades to {@link EMPTY_MEDIA_TRANSFORM_VERSIONS}, which
 * `renderDocNode`'s `image` case already treats as "nothing resolvable, placeholder".
 */
function readMediaTransformVersions({ value }: { value: JsonValue | undefined }, _optional = {}): ReadonlyMap<string, number> {
  if (!isObject(value)) return EMPTY_MEDIA_TRANSFORM_VERSIONS;
  const entries = Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number");
  return new Map(entries);
}

/** One raw per-asset JSON value -> {@link MediaAssetRenderMeta}, or `null` when `raw` isn't even an
 *  object — pulled out of {@link readMediaAssetMetadata}'s old for-loop body so the three field-level
 *  ternaries are counted once, at nesting depth 0, instead of once each inside the loop's own nesting.
 *  Same "malformed entry skipped, missing field degrades to `null`" contract as before. */
function parseMediaAssetMeta(raw: JsonValue): MediaAssetRenderMeta | null {
  if (!isObject(raw)) return null;
  return {
    width: typeof raw.width === "number" ? raw.width : null,
    height: typeof raw.height === "number" ? raw.height : null,
    cssClass: typeof raw.cssClass === "string" ? raw.cssClass : null,
    htmlAttributes: typeof raw.htmlAttributes === "string" ? raw.htmlAttributes : null,
    // Reconstructed from `raw` (2026-09-11) the same way as every other field above — this file's
    // own `resolver-service.ts` (`resolvePostContentMediaContext`) now stashes a real sniffed type
    // into this JSON shape too, closing the gap `MediaAssetRenderMeta.contentType`'s own doc used to
    // disclose. A missing/non-string value (an older-shaped payload, or a genuinely unsniffed asset)
    // degrades to `null`, same "not set" convention every other field here already follows.
    contentType: typeof raw.contentType === "string" ? raw.contentType : null,
    // Readable-slugs S3: same reconstruction, same "missing/wrong-typed degrades to null" rule.
    slug: typeof raw.slug === "string" ? raw.slug : null,
    sha256: typeof raw.sha256 === "string" ? raw.sha256 : undefined,
  };
}

/** Same reconstruction as {@link readMediaTransformVersions}, for `mediaAssetMetadata` — see that
 *  function's own doc for why this crosses the `widgets/`-to-`render.ts` boundary as plain JSON
 *  rather than a real `Map`. A malformed per-asset entry (not an object) is skipped, not thrown;
 *  missing `width`/`height`/`cssClass`/`htmlAttributes` fields degrade to `null` ("not set"), matching
 *  {@link MediaAssetRenderMeta}'s own "`null` means not set, not zero" contract. */
function readMediaAssetMetadata({ value }: { value: JsonValue | undefined }, _optional = {}): ReadonlyMap<string, MediaAssetRenderMeta> {
  if (!isObject(value)) return EMPTY_MEDIA_ASSET_METADATA;
  const entries: [string, MediaAssetRenderMeta][] = [];
  for (const [assetId, raw] of Object.entries(value)) {
    const meta = parseMediaAssetMeta(raw);
    if (meta) entries.push([assetId, meta]);
  }
  return new Map(entries);
}

/** Rebuilds the `placementId -> WidgetRenderIR` map `renderDocNode`'s `widgetEmbed` case needs from
 *  the plain JSON `resolver-service.ts`'s `resolvePostContentWidgetContext` stashes into
 *  `props.inlineWidgets` (2026-09-22 — before it, every inline widget in a template-rendered post was
 *  the placeholder). A malformed entry is skipped, so its node degrades to the placeholder. */
function readInlineWidgets({ value }: { value: JsonValue | undefined }, _optional = {}): ReadonlyMap<string, WidgetRenderIR> {
  if (!isObject(value)) return EMPTY_INLINE_RESOLVED;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, JsonObject] => isObject(entry[1]) && typeof entry[1].componentId === "string" && isObject(entry[1].props)
  );
  return new Map(entries.map(([id, ir]) => [id, ir as unknown as WidgetRenderIR]));
}

/**
 * Owner-reported bug (2026-08-12): a ref-based image dropped into a post's body rendered as a
 * labelled placeholder box showing the filename — everywhere this function's output reaches (the
 * editor's own "Preview" tab, which renders through `apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts` ->
 * `renderViaTemplate` -> this same "post-content" IR, AND the published public page) — even though
 * the asset, its `"public"` transform registration, and the `/m/` rendition route were all
 * confirmed live and working. Root cause: this function called `renderDocNode(bodyJson)` with only
 * ONE argument, so `mediaTransformVersions`/`mediaAssetMetadata` silently defaulted to EMPTY MAPS
 * (`renderDocNode`'s own optional-params default) — every ref-based image's `mediaTransformVersions
 * .get(transformName)` was unconditionally `undefined`, so the `image` case ALWAYS took its
 * degrade-to-placeholder branch, regardless of whether the referenced asset/transform actually
 * existed. This is the ONE call site `renderWidgetIr`'s `"post-content"` case reaches
 * (`resolveHtmlPageEmbeds` never calls `renderDocNode` directly — see this file's header on why
 * `widgets/` can't import this module), so nothing here was ever going to resolve a real image
 * without this fix, for ANY post, on ANY render path that goes through a static-theme template
 * (which is unconditionally true for every `kind: "post"` row on a theme that declares templates —
 * `isEligibleForTemplateBranch`'s own doc).
 *
 * Fix: `resolver-service.ts`'s three `"post-content"` IR builders (`resolvePostTypeEmbeds`,
 * `resolveContentTypeEmbeds`'s two branches) now resolve the SAME `mediaTransformVersions`/
 * `mediaAssetMetadata` data `routes/site/pages.ts`'s generic (non-template) render path already
 * resolves for `renderSite` — reusing the identical `getLatestTransformDefinition`/
 * `mediaRepo.findById` primitives `resolveMediaTypeEmbeds` (the sibling `"media"` embed resolver)
 * already calls — and stash it into `props` as plain JSON (`readMediaTransformVersions`/
 * `readMediaAssetMetadata` above reconstruct the `Map`s this function needs from that JSON).
 */
/**
 * The `.post-detail-header` block (`<h1>` + optional date and author byline), or `""` when the caller opted
 * out via `header: false` (2026-09-04 — a "content" marker's own `header:false`, threaded here from
 * `resolver-service.ts`'s `resolveContentTypeEmbeds`). Split out of {@link renderWidgetPostContent}
 * so the opt-out's own branch lives at nesting depth 0 in a small function, rather than stacking a
 * third ternary into a function that already carries two (the title-node back-compat fork, the
 * date-label presence check) — see this repo's complexity ceiling.
 *
 * The byline sits inside the date's `.post-meta` line, as its next item (2026-10-10). After it, as
 * a sibling, it took the theme's body-text size and font under a small monospace date on every theme
 * without its own byline rules; inside, it inherits whatever the theme gives that line (themes lay
 * `.post-meta` out as a row of meta items: `display: flex; gap`).
 *
 * @complexity O(1) — string concatenation only, no loop or recursion.
 */
function renderPostDetailHeader(
  required: { showHeader: boolean; titleHtml: string; dateLabel: string; dateIso: string; bylineHtml: string },
  _optional: Record<string, never> = {},
): string {
  const { showHeader, titleHtml, dateLabel, dateIso, bylineHtml } = required;
  if (!showHeader) return "";
  const time = dateLabel ? `<time datetime="${escapeHtml({ text: dateIso })}">${escapeHtml({ text: dateLabel })}</time>` : "";
  // `bylineHtml` is required (L082b): its one caller always passes `str(props.postAuthorByline)`,
  // which is `""` when there is no byline, so the former optional's `?? ""` default never ran.
  const byline = bylineHtml.replace("<span", time ? '<span data-post-author-separator=""' : "<span");
  const meta = time + byline;
  return `<div class="post-detail-header">` + titleHtml + (meta ? `<div class="post-meta">${meta}</div>` : "") + `</div>`;
}

function renderWidgetPostContent({ props, docRendering }: { props: JsonObject; docRendering: WidgetDocRendering }, _optional = {}): string {
  const { title, bodyJson } = props;
  if (typeof title !== "string" || bodyJson === undefined) return renderWidgetPlaceholder();
  // `header` (2026-09-04): `false` only when a "content" marker explicitly opted out
  // (`resolver-service.ts`'s `resolveContentTypeEmbeds` threads `ref.header` through unchanged) —
  // absent, `true`, or any other value keeps emitting the header, matching the field's own
  // default-true contract on `PageHtmlEmbedRef.header` so every pre-existing template (no `header`
  // key at all) renders byte-identical to before this field existed.
  const showHeader = props.header !== false;
  // The go-live time when the post has one (`postDisplayDateIso`, owner decision 2026-10-05) — a
  // scheduled post's Preview shows the day it will go live, not the day it was last saved.
  const dateIso = postDisplayDateIso({
    publishAt: typeof props.publishAt === "string" ? props.publishAt : null,
    updatedAt: typeof props.updatedAt === "string" ? props.updatedAt : "",
  });
  // Bug D: the label is the calendar day in the site's zone (`props.timeZone`, set by the resolver
  // from `core.site.timezone`), not the server's UTC; `datetime` keeps the stored instant.
  const timeZone = typeof props.timeZone === "string" ? { timeZone: props.timeZone } : {};
  const dateLabel = dateIso ? formatDateLabel({ iso: dateIso }, timeZone) : "";
  // Back-compat fork (post-title-in-document feature, 2026-08-11): a migrated body's OWN title node
  // drives the `<h1>` (text AND alignment) so centering it in the editor actually centers it here;
  // a pre-migration body (no title node yet — every row saved before this feature landed) falls back
  // to the plain `props.title` string exactly as this rendered before the feature existed. Exactly
  // one `<h1>` either way — never two, never zero.
  const titleNode = extractTitleNode({ bodyJson: bodyJson as JsonValue, renderNodes: docRendering.renderNodes });
  const titleHtml =
    titleNode !== null ? `<h1${styleForAlign({ align: titleNode.align })}>${titleNode.html}</h1>` : `<h1>${escapeHtml({ text: title })}</h1>`;
  const mediaTransformVersions = readMediaTransformVersions({ value: props.mediaTransformVersions as JsonValue | undefined });
  const mediaAssetMetadata = readMediaAssetMetadata({ value: props.mediaAssetMetadata as JsonValue | undefined });
  const inlineWidgets = readInlineWidgets({ value: props.inlineWidgets as JsonValue | undefined });
  return (
    renderPostDetailHeader({ showHeader, titleHtml, dateLabel, dateIso, bylineHtml: str({ value: props.postAuthorByline }) }) +
    `<div class="post-detail-body">${docRendering.renderDocNode({ node: bodyJson }, { inlineResolved: inlineWidgets, mediaTransformVersions, mediaAssetMetadata })}</div>`
  );
}

/** The widget renderers' way back into the doc renderer ({@link WidgetDocRendering}), built once here
 *  from the real functions with the widget renderer bound — the same binding {@link renderDocNode}
 *  makes, so a title node or a legacy gallery image renders exactly as any other doc content. */
const WIDGET_DOC_RENDERING: WidgetDocRendering = {
  renderDocNode,
  renderNodes: (required) => renderNodes({ ...required, renderWidget: renderWidgetIr }),
};

/** One renderer per resolvable `componentId` — a lookup instead of a `switch` so the number of widget
 *  types stops being what drives {@link renderWidgetIr}'s own complexity (each `case` in a `switch`
 *  counts as a branch the same way each entry here does NOT, since the entries live in data, not
 *  control flow). `"widget-placeholder"` deliberately has no entry: it already gets the exact same
 *  {@link renderWidgetPlaceholder} output via the lookup's own miss path, same as any other
 *  unrecognized id. */
const WIDGET_IR_RENDERERS: Record<string, (required: { ir: WidgetRenderIR }, optional?: Record<string, never>) => string> = {
  text: ({ ir }) => `<div class="widget widget-text">${escapeHtml({ text: str({ value: ir.props.body }) }).replaceAll("\n", "<br/>")}</div>`,
  "social-links": ({ ir }) => renderWidgetSocialLinks(ir.props),
  "recent-entries": ({ ir }) => renderWidgetRecentEntries(ir),
  "entry-summary": ({ ir }) => renderWidgetEntrySummary(ir.props),
  menu: ({ ir }) => renderWidgetMenu(ir.props),
  "taxonomy-list": ({ ir }) => renderHtmlTaxonomy({
    id: str({ value: ir.props.id }), name: str({ value: ir.props.name }), hierarchical: ir.props.hierarchical === true,
    terms: (Array.isArray(ir.props.terms) ? ir.props.terms : []).filter(isObject).map((term) => ({
      id: str({ value: term.id }), name: str({ value: term.name }), parentId: typeof term.parentId === "string" ? term.parentId : null,
    })),
  }),
  "contact-form": ({ ir }) => renderWidgetContactForm(ir.props),
  "media-image": ({ ir }) => renderWidgetMediaImage(ir.props),
  "gallery": ({ ir }) => renderMediaWidget({ ir, docRendering: WIDGET_DOC_RENDERING }),
  "media": ({ ir }) => renderMediaWidget({ ir, docRendering: WIDGET_DOC_RENDERING }),
  "post-content": ({ ir }) => renderWidgetPostContent({ props: ir.props, docRendering: WIDGET_DOC_RENDERING }),
};

/**
 * Renders one resolved widget IR node to HTML. Never throws: an unrecognized `componentId` (a
 * resolver shape this renderer doesn't yet know, or the REQ-27 failure taxonomy reaching here some
 * other way) degrades to the same public-safe placeholder REQ-28 requires, not a crash or an
 * unescaped dump of unknown props.
 *
 * Exported for {@link renderHtmlPageBody} (SPEC-047 Slice 2) — an `"html"`-format Page's
 * `data-embed-type` targets resolve to the exact same `WidgetRenderIR` shape a
 * region or a TipTap `widgetEmbed` does, so they render through this same function rather than a
 * second implementation.
 */
export function renderWidgetIr(ir: WidgetRenderIR): string {
  const renderer = WIDGET_IR_RENDERERS[ir.componentId];
  return renderer ? renderer({ ir }) : renderWidgetPlaceholder();
}

/**
 * Renders a theme-declared region: the ordered, resolved widget list for `regionKey`, wrapped in
 * one semantic container. No layout/positioning opinion beyond that container (ADR-047 §4 "widgets
 * carry zero layout opinion" — that belongs to the region's placement context, i.e. the theme's own
 * CSS/template arrangement around this block). Renders nothing (not even the wrapper) when the
 * region has no resolved widgets — an empty/unbound region is not an error state (ADR-047 §7).
 */
/** Exported for `liquid-worker.ts`'s `render_block` tag, which resolves `region:` the same way it
 * resolves `component:` — over the same `COMPONENTS`-registry-adjacent seam, per ADR-047 §2a's "no
 * new Liquid capability required." */
export function renderWidgetRegion(
  required: { ctx: SiteRenderContext; regionKey: string },
  _optional: Record<string, never> = {}
): string {
  const { ctx, regionKey } = required;
  const items = ctx.widgetRegions[regionKey] ?? [];
  if (items.length === 0) return "";
  return `<div class="widget-region widget-region--${escapeHtml({ text: regionKey })}">${items.map((ir) => renderWidgetIr(ir)).join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Templated tier (LiquidJS) — ADR-020 Tier 2.
//
// A "templated" theme ships `.liquid` files instead of JSON block trees. Liquid
// gives authors loops / conditionals / filters that the fixed-component
// declarative tier can't express — while executing NO theme JavaScript.
//
// Two seams bridge Liquid back into the trusted core:
//   • {% render_block component: "tovu/site-header", tagline: "…" %} renders a
//     component from the SAME registry the declarative tier uses (COMPONENTS).
//   • {{ content | raw }} injects the server-rendered, pre-sanitized TipTap body.
//     Output autoescaping is ON (outputEscape: "escape"), so a bare
//     {{ post.title }} is escaped and only explicitly-`raw` values pass HTML.
//
// C6/ADR-020 §3 Tier-2 guardrails are implemented (LiquidJS pinned ≥10.26.0
// per package.json; render isolation + fs lockdown in `liquid-worker.ts`,
// spawned per render by `liquid-sandbox.ts`'s `renderLiquidInSandbox`; the
// tag/filter allowlist + lint-before-publish in
// `features/theme/liquid-allowlist.ts`, wired into `loadTheme()` and
// defensively re-checked in the worker). The Liquid engine construction and
// `render_block` tag registration now live in `liquid-worker.ts`, not here —
// this file only forwards to the sandbox.
// ---------------------------------------------------------------------------

/**
 * Key under which the live `SiteRenderContext` is handed to a template engine's `render_block`
 * seam. Never part of the data a template can name: the Liquid worker puts it in the render scope
 * (where the tag reads it back with `ctx.getSync`), the Handlebars worker puts it in a private `@`
 * data frame that its own allowlist refuses to let a template address.
 */
export const RENDER_CTX_KEY = "__siteCtx";

/** Currency formatting is shared with the catalog; old currency-less theme fixtures mean USD.
 * @complexity O(1), with no I/O. */
function formatProductMoney({ amount, currency }: { amount: number; currency?: string }): string {
  return formatMoney({ money: { minorUnits: amount, currency: (currency ?? "USD").toUpperCase() } });
}

/**
 * Shapes the plain, structured-cloneable data object a logic-tier template renders against.
 *
 * Exported and shared by BOTH engine workers (`liquid-worker.ts`, `handlebars-worker.ts`)
 * deliberately: the data contract a theme author writes against — `site`, `theme`, `route`,
 * `posts`, `post`, `products`, `product` — is a property of Tovu's render pipeline, not of
 * whichever template language is reading it. Keeping one builder is what makes "the same page,
 * authored in Liquid or in Handlebars, sees the same fields" a fact rather than a coincidence two
 * files have to be edited in lockstep to preserve.
 *
 * `post.content` is pre-rendered, pre-sanitized HTML (`renderDocNode` output) — the ONE value
 * either tier is permitted to emit unescaped (Liquid's `| raw`, Handlebars' `{{{post.content}}}`).
 *
 * @complexity O(p) in the post/product counts.
 * @overallScore 100/100
 */
export function buildTemplateRenderData(ctx: SiteRenderContext): Record<string, unknown> {
  return {
    site: { title: ctx.siteTitle },
    theme: { name: ctx.themeName },
    route: ctx.route,
    // `date` is the full ISO timestamp (Liquid themes format it with `| date: "%b %e, %Y"`);
    // `dateShort` is the same instant as a `YYYY-MM-DD` day in the site's zone (Bug D), added for the same reason
    // `priceFormatted` exists below — the Handlebars tier's allowlist carries no date filter or
    // helper (and deliberately exposes no way for a theme to register one), so any formatting a
    // theme cannot express must be precomputed server-side. Purely additive: every existing Liquid
    // theme's `{{ post.date | date: … }}` keeps reading the same unchanged `date` field.
    // `date` is the go-live time when the post has one (`postDisplayDateIso`, owner decision
    // 2026-10-05), else `updatedAt`.
    // `featuredImage` (2026-10-05) is `{ url, alt, width, height }` or `null` — a theme renders it
    // with `{% if post.featuredImage %}<img src="{{ post.featuredImage.url }}" …>{% endif %}`.
    posts: ctx.posts.map((p) => ({ title: p.title, slug: p.slug, date: postDisplayDateIso(p), dateShort: shortDate({ iso: postDisplayDateIso(p), timeZone: ctx.timeZone }), featuredImage: featuredImageView(ctx, p), author: postAuthorForDisplay({ post: p }), showAuthor: p.showAuthor ?? false })),
    post: ctx.post
      ? {
          title: ctx.post.title,
          slug: ctx.post.slug,
          date: postDisplayDateIso(ctx.post),
          dateShort: shortDate({ iso: postDisplayDateIso(ctx.post), timeZone: ctx.timeZone }),
          content: renderPostBody({ ctx, post: ctx.post }),
          featuredImage: featuredImageView(ctx, ctx.post),
          author: postAuthorForDisplay({ post: ctx.post }),
          showAuthor: ctx.post.showAuthor ?? false,
        }
      : null,
    // `price` stays in cents — themes format it themselves; `priceFormatted`/`compareAtPriceFormatted`
    // are precomputed here so a theme can just read one field.
    products: ctx.products.map(siteProductRenderShape),
    product: ctx.product ? siteProductRenderShape(ctx.product) : null,
  };
}

/**
 * Featured image (2026-10-05) as template data: the core "public" transform URL — the same `/m/`
 * URL a body image of the same asset gets — or `null` when the post has none, the asset did not
 * resolve (trashed, deleted, not in `mediaAssetMetadata`), or the transform is not registered yet.
 * An unset featured slot uses the shared first-body-image policy; body alt falls back to the title.
 * Exported for the static tier (`pages.ts`'s `resolveFeaturedImageForRender`), which feeds the
 * same view to a `{"type":"featured-image"}` marker so the two tiers cannot disagree.
 *
 * @complexity O(n) body traversal for an unset featured slot; O(1) for a featured image.
 */
/** `CORE_PUBLIC_TRANSFORM_NAME` (`features/media/bootstrap.ts`), restated rather than imported: that
 *  module pulls in the whole media feature barrel, which this I/O-free render module never needed. */
const FEATURED_IMAGE_TRANSFORM = "public";

export function featuredImageView(
  ctx: Pick<SiteRenderContext, "mediaAssetMetadata" | "mediaTransformVersions">,
  post: PostRecord
): { url: string; alt: string; width: number | null; height: number | null } | null {
  const cover = resolveCoverImage({ post }, { mediaLookup: ({ ref }) => ctx.mediaAssetMetadata.get(ref) ?? null });
  if (!cover?.mediaId) return null;
  const meta = ctx.mediaAssetMetadata.get(cover.mediaId);
  const version = ctx.mediaTransformVersions.get(FEATURED_IMAGE_TRANSFORM);
  if (!meta || version === undefined) return null;
  const urlKey = mediaUrlKey({ id: cover.mediaId, slug: meta.slug });
  return {
    url: mediaPublicPath({ key: urlKey, sha256: meta.sha256, variant: { kind: "transform", name: FEATURED_IMAGE_TRANSFORM, version, ext: "jpg" } }),
    alt: cover.alt,
    width: meta.width,
    height: meta.height,
  };
}

/** Shared `SiteProduct` -> template-facing shape, used for both the `products` list and the
 * single `product` (product-detail route) — one mapping, not two kept in agreement by hand. */
function siteProductRenderShape(p: SiteProduct): Record<string, unknown> {
  return {
    id: p.id,
    // The `/products/<slug>` link key (readable-slugs S7) — a templated theme builds its own href.
    slug: p.slug,
    title: p.title,
    price: p.price,
    ...(p.priceId === undefined ? {} : { priceId: p.priceId }),
    priceFormatted: formatProductMoney({ amount: p.price, currency: p.currency }),
    stock: p.stock,
    compareAtPriceFormatted: p.compareAtPrice === undefined ? undefined : formatProductMoney({ amount: p.compareAtPrice, currency: p.currency }),
    currency: p.currency,
    specs: p.specs,
  };
}

/**
 * Resolves one `render_block` invocation — the single seam both logic tiers share back into the
 * trusted core. `props.region` selects a theme-declared widget region; otherwise `props.component`
 * selects an entry in {@link COMPONENTS}. An unknown component id degrades to an HTML comment, never
 * a throw, so one bad reference cannot take the page down.
 *
 * Exported so the Liquid tag and the Handlebars helper are the same code rather than two
 * implementations that must be kept in agreement.
 *
 * @complexity O(1) beyond the resolved component's own rendering.
 * @overallScore 100/100
 */
export function renderBlockSeam(ctx: SiteRenderContext, props: JsonObject): string {
  if (typeof props.region === "string") {
    return renderWidgetRegion({ ctx, regionKey: props.region });
  }
  const id = typeof props.component === "string" ? props.component : "";
  const { component: _component, region: _region, ...rest } = props;
  const component = COMPONENTS[id];
  if (!component) return `<!-- unknown component: ${escapeHtml({ text: id })} -->`;
  return component(ctx, rest);
}

// ---------------------------------------------------------------------------
// Slots — raw context injection points a template can drop in directly.
// ---------------------------------------------------------------------------

function renderSlot({ name, ctx }: { name: string; ctx: SiteRenderContext }, _optional = {}): string {
  switch (name) {
    case "title":
      return `<h1 class="slot-title">${escapeHtml({ text: ctx.route === "post" && ctx.post ? ctx.post.title : ctx.siteTitle })}</h1>`;
    case "content":
      return ctx.post ? `<div class="prose">${renderPostBody({ ctx, post: ctx.post })}</div>` : "";
    case "entry-list":
      return entryList(ctx, {});
    default:
      return `<!-- unknown slot: ${escapeHtml({ text: name })} -->`;
  }
}

// ---------------------------------------------------------------------------
// Template block tree
// ---------------------------------------------------------------------------

function renderComponentBlock(node: JsonObject, ctx: SiteRenderContext): string {
  const id = typeof node.id === "string" ? node.id : "";
  const component = COMPONENTS[id];
  if (!component) return `<!-- unknown component: ${escapeHtml({ text: id })} -->`;
  return component(ctx, isObject(node.props) ? node.props : {});
}

function renderSlotBlock(node: JsonObject, ctx: SiteRenderContext): string {
  return renderSlot({ name: typeof node.name === "string" ? node.name : "", ctx });
}

/** SPEC-043/ADR-047 W-004: `{"type":"region","key":"footer"}` — a theme-authored reference to a
 *  theme-declared widget region (REQ-13/`ThemeManifest.regions`), resolved server-side ahead of the
 *  block walk (`resolvePageWidgets`, threaded in via `ctx.widgetRegions`). Dispatched by `node.type`
 *  through {@link BLOCK_TYPE_HANDLERS} rather than sequential `if`s, so a region node is never
 *  mistaken for unknown content-doc vocabulary (which would try to walk its `content`, not its
 *  `key`) — the two shapes never share a code path regardless of dispatch order. */
function renderRegionBlock(node: JsonObject, ctx: SiteRenderContext): string {
  return renderWidgetRegion({ ctx, regionKey: typeof node.key === "string" ? node.key : "" });
}

function renderDocTypeBlock(node: JsonObject, ctx: SiteRenderContext): string {
  return (Array.isArray(node.content) ? node.content : []).map((child) => renderBlock(child, ctx)).join("");
}

/** One handler per theme-authored block `type` — a lookup instead of a sequential `if`/`if`/`if`
 *  chain, so the number of block kinds stops being what drives {@link renderBlock}'s own complexity.
 *  A `type` with no entry here (including every plain content-doc vocabulary type, e.g. `paragraph`)
 *  falls through to `renderBlock`'s own default: this node tree is content-doc vocabulary, handled by
 *  {@link renderDocNode}. */
const BLOCK_TYPE_HANDLERS: Record<string, (node: JsonObject, ctx: SiteRenderContext) => string> = {
  component: renderComponentBlock,
  slot: renderSlotBlock,
  region: renderRegionBlock,
  doc: renderDocTypeBlock,
};

function renderBlock(node: TemplateNode, ctx: SiteRenderContext): string {
  if (!isObject(node)) return "";
  const handler = typeof node.type === "string" ? BLOCK_TYPE_HANDLERS[node.type] : undefined;
  if (handler) return handler(node, ctx);
  // Anything else is content-doc vocabulary.
  return renderDocNode({ node }, { inlineResolved: ctx.widgetInlineResolved, mediaTransformVersions: ctx.mediaTransformVersions, mediaAssetMetadata: ctx.mediaAssetMetadata });
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/** {@link renderSite}'s `required` parameter, named so the tier-render helpers below can each take
 *  just the slice of it they need rather than repeating this whole shape — split out purely for
 *  {@link renderSite}'s own complexity, no change to the accepted call shape (an inline object type
 *  and a structurally-identical named interface are the same type to every existing caller). */
export interface RenderSiteRequired {
  renderAssets?: (required: { scripts: readonly DeclaredScript[]; static?: true }) => Promise<DocumentAssets>;
  transformBody?: (required: { html: string }) => Promise<string>;
  scripts?: readonly DeclaredScript[];
  /**
   * The resolved active theme, or `null` when the operator has deliberately turned the theme off
   * (state 3 of the optional-theme feature). `null` is NOT "the theme is broken" — that case still
   * resolves to a substitute theme in `features/theme/active-theme.ts`. It means the operator is
   * handling styling themselves, so this render must produce a complete, unstyled, VALID document
   * rather than an error: see `__tests__/render-no-theme.test.ts` for the shape it must keep.
   */
  theme: DiscoveredTheme | null;
  route: "home" | "post" | "products" | "product";
  siteTitle: string;
  posts: PostRecord[];
  /** See {@link SiteRenderContext.listing}. */
  listing?: { pagePath: string; after: number };
  post?: PostRecord;
  /** Sample store-plugin products (products/product routes). Omitted entirely (every pre-existing
   * caller of `renderSite`) behaves as "no products" — not a breaking change, same convention as
   * `widgets` below. */
  products?: SiteProduct[];
  product?: SiteProduct;
  /**
   * SPEC-043/ADR-047 W-004 — pre-resolved widget data for this render (`resolvePageWidgets`'s own
   * output). `render.ts` stays a pure "resolved data -> HTML" renderer, matching how `posts`/`post`
   * are already pre-resolved by the caller (`routes/site/pages.ts`) rather than repo-fetched here —
   * `resolvePageWidgets` itself never throws (REQ-27), so the caller can always pass a real result.
   * Omitted entirely (every pre-existing caller/test of `renderSite`) behaves as "no regions
   * declared, no inline embeds resolved" — not a breaking change.
   */
  widgets?: ResolvePageWidgetsResult;
  /**
   * SPEC-047 Slice 2 — an `"html"`-format Page's pre-resolved `data-embed-type`
   * targets (`resolver-service.ts`'s `resolveHtmlPageEmbeds`), threaded straight into
   * `SiteRenderContext.pageHtmlEmbeds`. Omitted by every caller/test that never renders a Page with
   * embeds (including a `"doc"` post, which has no use for this at all) — see that field's own doc
   * for the safe-degrade behavior when it is missing.
   */
  pageHtmlEmbeds?: ResolveHtmlPageEmbedsResult;
  /**
   * ADR-027 §4 — the latest registered version of each transform NAME this render's image refs may
   * use, threaded straight into `SiteRenderContext.mediaTransformVersions` (see that field's own
   * doc). The caller (`routes/site/pages.ts`) resolves this from the SAME `transform_registry` the
   * public `/m/` route reads, so a version this render embeds is guaranteed servable. Omitted by
   * every caller/test that never renders a ref-based image node — degrades to an empty map, which
   * `renderDocNode`'s `image` case already treats as "not resolvable" (placeholder), not a crash.
   */
  mediaTransformVersions?: ReadonlyMap<string, number>;
  /**
   * Quick-and-dirty public-render sizing fix (owner-directed skip-the-ADR fix) — each resolved
   * image ref's width/height/CSS-class override, keyed by `assetId`, threaded straight into
   * `SiteRenderContext.mediaAssetMetadata` (see that field's own doc). The caller
   * (`routes/site/pages.ts`'s `resolveMediaAssetMetadataForRender`) resolves this from the same
   * `mediaRepo` the admin edit panel writes through. Omitted by every caller/test that never
   * renders an image ref — degrades to an empty map, which the `image` case already treats as "no
   * override" (omit the attribute), not a crash.
   */
  mediaAssetMetadata?: ReadonlyMap<string, MediaAssetRenderMeta>;
  /**
   * Taxonomy render-surface gap fix (2026-09-03) — `post`'s pre-resolved assigned category/tag terms
   * (`routes/site/pages.ts`'s `resolveAssignedTermsForRender`, over `deps.entryTermReadRepo`),
   * threaded straight into `SiteRenderContext.assignedTerms` (see that field's own doc). `render.ts`
   * stays I/O-free, same "route resolves, render renders" split every other pre-resolved field on
   * this required object already follows. Omitted by every caller/test that never renders a post
   * with assigned terms — degrades to an empty array, which {@link renderAssignedTermsBlock} already
   * treats as "nothing to render" (returns `""`), not a crash.
   */
  assignedTerms?: readonly AssignedTermView[];
  /** SPEC-008 T049 — pre-serialized `page.head` fold output, threaded through to `pageShell`. */
  extraHead?: string;
  /**
   * ADR-054 — whether to inject the public visitor-chat mount node + script (Task 2/3). Threaded
   * through unchanged to `pageShell`; see that parameter's own doc for why this defaults to `false`
   * rather than `true`. The caller (a route handler) resolves this from
   * `isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId })`
   * — `render.ts` stays a pure "resolved data -> HTML" renderer and never reads the settings ledger
   * itself, the same convention `widgets`/`posts`/`post` above already follow.
   */
  siteAssistantEnabled?: SiteChatSelection;
  /**
   * Menu-location wiring (2026-08-10) — the `header`/`footer` location menus pre-resolved by the
   * route layer (`pages.ts`'s `resolveStaticMenusForRender`, over `navigation`'s `resolveForLocation`
   * + `routing`'s `urlFor`), threaded straight into the static-tier home-route `renderStaticPage`
   * call below. `render.ts` stays I/O-free — same "route resolves, render renders" split every other
   * pre-resolved field on this required object already follows. Omitted (every non-static-tier
   * caller, and every existing test) behaves as "no menu bound to either location", i.e. each
   * static theme's own authored header/footer content renders unchanged — not a breaking change.
   */
  staticMenus?: { header?: readonly StaticMenuItem[]; footer?: readonly StaticMenuItem[] };
  /**
   * Explore's Preview tab (2026-08-12, `.liquid` template render) — when set, names the exact
   * `theme.liquidTemplates` key to render, bypassing {@link resolveLiquidTemplateId}'s own
   * route -> file preference order. That resolver exists to pick ONE file when several could satisfy
   * the same `route` (e.g. it always prefers `post` over `entry` when a theme ships both) — the wrong
   * question for Explore, which is asking "what does THIS specific file produce", not "what would the
   * live site pick for this route". Without this override, previewing `entry.liquid` in a theme that
   * also ships `post.liquid` would silently render the WRONG file with no indication to the operator.
   * Ignored for every non-`templated` tier (nothing to override) and every pre-existing caller (every
   * one of which leaves this `undefined`, so `resolveLiquidTemplateId` keeps deciding exactly as it
   * always has) — this is purely additive.
   */
  liquidTemplateIdOverride?: string;
  /** Bug D follow-up — the site's IANA zone, threaded straight into {@link SiteRenderContext.timeZone}
   *  (see that field's doc). Omitted renders UTC. */
  timeZone?: string;
}

/** {@link buildSiteRenderContext}'s widget fields: no regions and no inline widgets when the caller
 *  resolved none. Spread in place so `ctx`'s key order is unchanged. */
function siteWidgetContext(
  widgets: RenderSiteRequired["widgets"],
): Pick<SiteRenderContext, "widgetRegions" | "widgetInlineResolved"> {
  return {
    widgetRegions: widgets?.regions ?? {},
    widgetInlineResolved: widgets?.inlineResolved ?? EMPTY_INLINE_RESOLVED,
  };
}

/** {@link renderSite}'s own `ctx` construction, pulled out so the four `??`/`?.` defaulting
 *  expressions are counted once here instead of against the top-level dispatcher's budget. */
function buildSiteRenderContext(required: RenderSiteRequired): SiteRenderContext {
  return {
    siteTitle: required.siteTitle,
    route: required.route,
    posts: required.posts,
    ...(required.listing !== undefined ? { listing: required.listing } : {}),
    post: required.post,
    products: required.products ?? [],
    product: required.product,
    themeName: required.theme?.manifest.name ?? null,
    ...siteWidgetContext(required.widgets),
    mediaTransformVersions: required.mediaTransformVersions ?? EMPTY_MEDIA_TRANSFORM_VERSIONS,
    mediaAssetMetadata: required.mediaAssetMetadata ?? EMPTY_MEDIA_ASSET_METADATA,
    assignedTerms: required.assignedTerms ?? EMPTY_ASSIGNED_TERMS,
    pageHtmlEmbeds: required.pageHtmlEmbeds,
    ...(required.timeZone !== undefined ? { timeZone: required.timeZone } : {}),
  };
}

/**
 * A theme with no dedicated `products`/`product` template (declarative tier's own
 * `resolveTemplateId`, or a static/templated theme that never declared one — the seeded default
 * `"basic"` among them) still needs to render *something* instead of relying on a component that
 * doesn't exist (REQ-10 spirit: never a raw crash). `productEntryList`/`productEntryContent`
 * mirror `entryList`/`entryContent`'s own markup shape but read `ctx.products`/`ctx.product`
 * rather than `ctx.posts`/`ctx.post` — see those two functions' own doc for the 2026-08-12 bug
 * this replaced (both product routes used to silently fall through to the POST-shaped fallback,
 * which never reads product data at all).
 *
 * Pulled out of {@link renderSite} as a top-level function rather than a closure over `ctx`/`route`
 * (an inline closure would still be measured separately by this repo's complexity gate and so
 * wasn't the source of `renderSite`'s own violation, but keeping every extracted tier-body helper at
 * the same top-level shape — see {@link renderTemplatedTierBody} etc. — keeps this file's own
 * "extract to top-level functions, not closures" convention consistent). Deterministic and
 * side-effect-free, so calling it eagerly from each tier-render helper below (rather than only when
 * actually needed, the way the original closure was invoked lazily) produces identical output.
 */
function fallbackSiteBody(ctx: SiteRenderContext, route: SiteRenderContext["route"]): string {
  let main: string;
  switch (route) {
    case "post": main = entryContent(ctx); break;
    case "product": main = productEntryContent(ctx); break;
    case "products": main = productEntryList(ctx); break;
    default: main = entryList(ctx, {});
  }
  return `${siteHeader(ctx, {})}${main}${siteFooter(ctx)}`;
}

/**
 * Static tier: unlike every other tier, a static theme's page is already a complete
 * `<!doctype html>` document (tokens, nav, footer, scripts — all of it), not a body fragment
 * `pageShell()` still needs to wrap. Returns the full page directly, bypassing `pageShell`, when the
 * theme has one for this route; `undefined` for every other case (non-static tier, non-home route, or
 * a static theme with no `pages/index.html`), which is {@link renderSite}'s own signal to fall
 * through to the ordinary fallback-body/`pageShell` path below, same as any other unresolved route on
 * any other tier. `extraHead` still gets spliced in (SPEC-008 T045) via
 * {@link injectExtraHeadIntoStaticPage} — bypassing `pageShell` must not mean bypassing the SEO fold.
 * The ADR-054 visitor-chat widget gets the identical treatment via
 * {@link injectSiteAssistantIntoStaticPage} — bypassing `pageShell` must not mean bypassing that
 * either (this was a live bug: a static-tier home page never showed the widget even with
 * `site.assistant.public_enabled` on, since `pageShell`'s own injection never ran for this branch).
 */
async function renderStaticTierHomePage(
  { theme, route, staticMenus, extraHead, siteAssistantEnabled, renderAssets }: { theme: DiscoveredTheme; route: SiteRenderContext["route"]; staticMenus: RenderSiteRequired["staticMenus"]; extraHead: string | undefined; siteAssistantEnabled: SiteChatSelection; renderAssets: RenderSiteRequired['renderAssets'] }, _optional = {}
): Promise<string | undefined> {
  if (theme.manifest.tier !== "static" || route !== "home") return undefined;
  const staticHtml = renderStaticPage({ theme, pageId: "index", menus: staticMenus });
  if (!staticHtml) return undefined;
  const assets = await renderAssets?.({ scripts: [], static: true });
  return injectSiteAssistantIntoStaticPage({ html: injectExtraHeadIntoStaticPage({ html: staticHtml, extraHead: (extraHead ?? '') + (assets?.head ?? '') }), enabled: siteAssistantEnabled });
}

/** Templated (LiquidJS) tier body — resolves the route to a `.liquid` template, renders it inside its
 *  own `worker_threads` sandbox, and degrades to {@link fallbackSiteBody} on ANY failure: a syntax
 *  error, a disallowed tag/filter the worker's defensive re-lint caught, or a sandbox timeout/OOM.
 *  Never a 500 (SPEC-004 REQ-10 spirit). */
async function renderTemplatedTierBody(
  { theme, route, liquidTemplateIdOverride, ctx }: { theme: DiscoveredTheme; route: SiteRenderContext["route"]; liquidTemplateIdOverride: string | undefined; ctx: SiteRenderContext }, _optional = {}
): Promise<string> {
  const liquidId = liquidTemplateIdOverride ?? resolveLiquidTemplateId({ route, liquidTemplates: theme.liquidTemplates });
  const source = liquidId ? theme.liquidTemplates[liquidId] : undefined;
  try {
    // Workers use this module's block/data seams, never the parent-side worker launcher.
    const { renderLiquidInSandbox } = await import("./liquid-sandbox.js");
    return source
      ? await renderLiquidInSandbox({ source, ctx })
      : fallbackSiteBody(ctx, route);
  } catch (err) {
    return `<!-- theme render error: ${escapeHtml({ text: (err as Error).message })} -->${fallbackSiteBody(ctx, route)}`;
  }
}

/** Handlebars tier body — same contract as {@link renderTemplatedTierBody}, engine swapped: resolve
 *  the route to a `.hbs` template, render it inside its own `worker_threads` sandbox, and degrade to
 *  {@link fallbackSiteBody} on ANY failure. Never a 500. */
async function renderHandlebarsTierBody({ theme, route, ctx }: { theme: DiscoveredTheme; route: SiteRenderContext["route"]; ctx: SiteRenderContext }, _optional = {}): Promise<string> {
  const hbsId = resolveHandlebarsTemplateId({ route, handlebarsTemplates: theme.handlebarsTemplates });
  const source = hbsId ? theme.handlebarsTemplates[hbsId] : undefined;
  try {
    const { renderHandlebarsInSandbox } = await import("./handlebars-sandbox.js");
    return source ? await renderHandlebarsInSandbox({ source, ctx }) : fallbackSiteBody(ctx, route);
  } catch (err) {
    return `<!-- theme render error: ${escapeHtml({ text: (err as Error).message })} -->${fallbackSiteBody(ctx, route)}`;
  }
}

/** Declarative (JSON block-tree) tier body — the default tier, synchronous unlike its two siblings
 *  above since `renderBlock`'s own walk never crosses a `worker_threads` boundary. */
function renderDeclarativeTierBody({ theme, route, ctx }: { theme: DiscoveredTheme; route: SiteRenderContext["route"]; ctx: SiteRenderContext }, _optional = {}): string {
  const templateId = resolveTemplateId({ route, templates: theme.templates });
  const tree = templateId ? theme.templates[templateId] : undefined;
  return tree ? renderBlock(tree, ctx) : fallbackSiteBody(ctx, route);
}

/** The `<title>` `pageShell` renders — the viewed post's own title on the `post` route, the site
 *  title everywhere else (including a `post` route whose post somehow isn't set). */
function resolvePageTitle({ route, post, siteTitle }: { route: SiteRenderContext["route"]; post: PostRecord | undefined; siteTitle: string }, _optional = {}): string {
  return route === "post" && post ? `${post.title} — ${siteTitle}` : siteTitle;
}

/**
 * Render a page through a declarative theme. Resolves the route to a template
 * and walks its block tree. If the theme lacks the needed template, falls back
 * to a minimal built-in body so a partial theme never 500s (SPEC-004 REQ-10).
 *
 * `async` because the "templated" (LiquidJS) tier renders inside an isolated
 * `worker_threads` worker (ADR-020 §3 render isolation, C6) — the declarative
 * tier's own `renderBlock` walk stays fully synchronous, so most calls still
 * resolve on the same tick the returned promise is awaited.
 */
export async function renderSite(required: RenderSiteRequired): Promise<string> {
  const { theme, route } = required;
  const ctx = buildSiteRenderContext(required);

  // No theme: straight to the fallback body, which is exactly the path a theme missing this route's
  // template already takes — so this is not a new render path, it is an existing one reached one
  // step earlier. Every tier branch below would otherwise dereference `theme`.
  if (theme === null) {
    const title = resolvePageTitle({ route, post: required.post, siteTitle: required.siteTitle });
    const body = fallbackSiteBody(ctx, route);
    return finishManagedDocument({ required, title, body });
  }

  const staticHomePage = await renderStaticTierHomePage({ theme, route, staticMenus: required.staticMenus, extraHead: required.extraHead, siteAssistantEnabled: required.siteAssistantEnabled ?? false, renderAssets: required.renderAssets });
  if (staticHomePage !== undefined) return staticHomePage;

  let body: string;
  if (theme.manifest.tier === "templated") {
    body = await renderTemplatedTierBody({ theme, route, liquidTemplateIdOverride: required.liquidTemplateIdOverride, ctx });
  } else if (theme.manifest.tier === "handlebars") {
    body = await renderHandlebarsTierBody({ theme, route, ctx });
  } else {
    body = renderDeclarativeTierBody({ theme, route, ctx });
  }

  const title = resolvePageTitle({ route, post: required.post, siteTitle: required.siteTitle });
  return finishManagedDocument({ required, title, body });
}

/** Resolve body contributions before the document slots, so optional comment assets join declarations. */
async function finishManagedDocument({ required, title, body }: { required: RenderSiteRequired; title: string; body: string }): Promise<string> {
  const transformed = required.transformBody ? await required.transformBody({ html: body }) : body;
  const scripts = [...required.theme?.manifest.scripts ?? [], ...required.scripts ?? []];
  const documentAssets = required.renderAssets ? await required.renderAssets({ scripts }) : { head: renderScriptAssets({ scripts: scripts.filter(script => script.consent === undefined) }), body: '' };
  return pageShell({ title, theme: required.theme, body: transformed, extraHead: required.extraHead, siteAssistantEnabled: required.siteAssistantEnabled, documentAssets });
}


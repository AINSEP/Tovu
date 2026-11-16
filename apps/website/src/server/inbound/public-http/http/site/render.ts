import type { DocumentAssets } from '@jini-ai/cms/presentation';
import type { DeclaredScript } from '@jini-ai/cookie-consent';
import { renderScriptAssets } from '@jini-ai/cookie-consent/render';
import { formatMoney } from "@jini-ai/commerce/money";
import type { SiteProduct, SiteRenderContext, MediaAssetRenderMeta } from "./render-context.js";
import { type SiteChatSelection } from "./site-chat-markup.js";
import type { JsonObject, JsonValue } from "@jini-ai/core/primitives";
import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import type { DiscoveredTheme, StaticMenuItem, TemplateNode } from "#src/features/theme/index";
import { resolveTemplateId, resolveLiquidTemplateId, resolveHandlebarsTemplateId } from "#src/features/theme/render-contract";
import { renderStaticPage, renderCoverImageTag } from "#src/features/theme/static-render";
import { projectPostBody, resolveCoverImage } from "#src/features/post/rendering";
import type { ResolveHtmlPageEmbedsResult } from "@jini-ai/cms/widgets/html";
import type { ResolvePageWidgetsResult } from "@jini-ai/cms/widgets";
import type { AssignedTermView } from "#src/features/taxonomy/contracts";
import { formatIsoDate } from "@jini-ai/cms/widgets/date-label";
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
import { postDisplayDateIso } from "#src/contracts/core/scheduled-publish";
import { injectExtraHeadIntoStaticPage, injectSiteAssistantIntoStaticPage } from "./render/static-page-injection.js";
import { pageShell } from "./render/document-shell.js";
import { isObject } from "./render/value-readers.js";
import { mediaPlaceholder } from "./render/media-placeholder.js";
import { hero, announcement, ctaBand, section, featureGrid } from "./render/components/marketing.js";
import { siteHeader, siteFooter, siteNav, siteFooterRich } from "./render/components/layout.js";
import { EMPTY_INLINE_RESOLVED, EMPTY_MEDIA_TRANSFORM_VERSIONS, EMPTY_MEDIA_ASSET_METADATA } from "./render/doc/doc-nodes.js";
import { renderDocNode, renderWidgetRegion } from "./render/content-html.js";
import { renderHtmlPageBody } from "./render/page-body.js";

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


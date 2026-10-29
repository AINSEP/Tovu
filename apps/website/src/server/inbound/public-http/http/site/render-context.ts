import type { PublicPostRecord as PostRecord } from "#src/features/post/post";
import type { ResolveHtmlPageEmbedsResult } from "@jini-ai/cms/widgets/html";
import type { WidgetRenderIR } from "@jini-ai/cms/widgets";
import type { AssignedTermView } from "#src/features/taxonomy/repo.sqlite";

/**
 * A product line from the sample Tier-3 `store` plugin (`p_store__products`), shaped structurally
 * rather than imported from `features/plugins/store` — same decoupling convention `RouteDeps.store`
 * already uses, so the core render engine never depends on a specific plugin's module.
 */
export interface SiteProduct {
  id: string;
  /** Readable-slugs S7 (2026-09-23): the product's own unique slug — `productEntryList` below
   *  links by this, not `id`, and `routes/site/products.ts`'s product-detail route resolves either
   *  (id first, then slug), same fallback contract as posts/pages/menus. */
  slug: string;
  title: string;
  price: number; // cents
  /**
   * `undefined` for a product source with no inventory tracking (Commerce, as of 2026-08-12 —
   * `features/commerce/storefront.ts`'s own doc names this explicitly rather than fabricating a
   * count). The sample store plugin always sets a real, decremented number. `buildTemplateRenderData`
   * passes this through unchanged; a template that reads `product.stock` sees Liquid's ordinary
   * nil/falsy behavior for the untracked case, not a lie about availability.
   */
  stock?: number;
  /** Cents. `undefined` = not on sale — degrades to no strikethrough price shown, matching
   * `fashion-modern/templates/products.liquid`'s own documented fallback. */
  compareAtPrice?: number;
  /**
   * Lowercase ISO-4217 (e.g. `"usd"`) when known. `undefined` for a product source with no
   * currency concept (the sample store plugin). Safe to pass through as-is: `product.liquid`'s
   * currency badge and `products.liquid` both read it WITHOUT Liquid's `| raw` filter, so
   * `outputEscape: "escape"` (`liquid-worker.ts`) HTML-escapes it same as any other plain field.
   */
  currency?: string;
  /**
   * Display-only spec pairs (e.g. `{label: "Material", value: "Combed cotton"}`), in author-chosen
   * order. `undefined` = none set. Structurally mirrors `CommerceProductSpec`
   * (`features/commerce/types.ts`) WITHOUT importing it — same decoupling `storefront.ts`'s own
   * doc establishes for the whole `SiteProduct` shape. Safe to pass through unescaped-template-side
   * for the same reason as `currency` above (no `| raw` filter on either field in the template).
   *
   * Deliberately NOT joined by a `description` field here — see `features/commerce/storefront.ts`'s
   * file header for why: `product.liquid` reads `product.description` via `| raw` (unescaped,
   * trusting pre-sanitized HTML the same way `post.content` is), and no Commerce-sourced string
   * reaching this type today has ever been through a sanitizer. Adding the field to `SiteProduct`
   * would silently invite a future caller to wire it straight into that trust boundary.
   */
  specs?: { label: string; value: string }[];
}

/** Everything a template + its components need to render one page. */
export interface SiteRenderContext {
  siteTitle: string;
  route: "home" | "post" | "products" | "product";
  /** Published posts (home index; also the entry-list source). */
  posts: PostRecord[];
  /** Home only: the entry list shows `posts` 12 at a time from `after`, with a See more link. */
  listing?: { pagePath: string; after: number };
  /** The single post being viewed (post route). */
  post?: PostRecord;
  /** Products from the sample store plugin (products route). Empty when the store isn't wired
   * (memory mode) or the theme's route doesn't need them — never undefined, same "omitted ⇒ safe
   * default" convention as `widgetRegions` below. */
  products: SiteProduct[];
  /** The single product being viewed (product route). */
  product?: SiteProduct;
  /**
   * Active theme display name, for the footer badge. `null` when the operator has deliberately
   * turned the theme OFF (state 3 of the optional-theme feature) — distinct from a theme whose
   * name happens to be empty, and the signal {@link siteFooter}/{@link richSiteFooter} read to
   * suppress the badge entirely rather than emit `theme: ` with nothing after it.
   */
  themeName: string | null;
  /**
   * SPEC-043/ADR-047 W-004 — `resolvePageWidgets`'s per-region resolved widget IR, keyed by region
   * key. Empty object when the theme declares no regions or nothing resolved were passed in
   * (every render that doesn't opt into widgets, including every pre-existing test/caller of
   * `renderSite`, gets an empty object here — not a breaking change).
   */
  widgetRegions: Record<string, readonly WidgetRenderIR[]>;
  /** SPEC-043/ADR-047 REQ-21 — resolved inline `widgetEmbed` IR, keyed by `placementId`. */
  widgetInlineResolved: ReadonlyMap<string, WidgetRenderIR>;
  /**
   * ADR-027 §4 — the latest registered version of each transform NAME referenced by this render,
   * keyed by `transformName` (see {@link EMPTY_MEDIA_TRANSFORM_VERSIONS}'s doc for why this is
   * name-keyed rather than per-asset). Populated by the route caller from the same
   * `transform_registry` the public `/m/` route itself resolves against — `renderDocNode`'s `image`
   * case degrades to the placeholder for any name absent here, so an empty map (every pre-existing
   * caller/test of `renderSite`) is a non-breaking, fully backward-compatible default.
   */
  mediaTransformVersions: ReadonlyMap<string, number>;
  /**
   * SPEC-047 Slice 2 — an `"html"`-format Page's resolved `data-embed-type`
   * targets (`resolver-service.ts`'s `resolveHtmlPageEmbeds`), consumed by {@link renderPostBody}.
   * `undefined` for every render this feature doesn't touch (a `"doc"` post/home route, or any
   * pre-existing caller/test of `renderSite`) — `renderHtmlPageBody` treats that identically to "no
   * embeds resolved", degrading every placeholder to the REQ-28 marker rather than crashing.
   */
  pageHtmlEmbeds?: ResolveHtmlPageEmbedsResult;
  /**
   * Quick-and-dirty public-render sizing fix (owner-directed skip-the-ADR fix, 2026-08-05): each
   * resolved image ref's `MediaRecord.width`/`height`/`cssClass` override, keyed by `assetId` —
   * mirrors `mediaTransformVersions`'s own "small resolved lookup map, populated once per render by
   * the route caller" shape (see that field's doc), but keyed by ASSET id rather than transform
   * name since these are per-asset values, not per-transform-name ones. Populated by
   * `resolveMediaAssetMetadataForRender` (`routes/site/pages.ts`). An assetId absent from this map
   * (never uploaded, deleted, or simply a render/test that never threads this through) degrades to
   * "no override" — the `image` case omits `width`/`height`/`class` entirely rather than emitting a
   * malformed or zeroed attribute, same non-breaking-default convention every other resolved map on
   * this context follows.
   */
  mediaAssetMetadata: ReadonlyMap<string, MediaAssetRenderMeta>;
  /**
   * Taxonomy render-surface gap fix (2026-09-02, `renderViaTemplate`; extended here 2026-09-03 to
   * the declarative/templated/handlebars tiers) — `post`'s assigned category/tag terms
   * (`EntryTermReadPort.listForContent`'s own output), consumed by {@link renderPostBody}. Empty
   * (every pre-existing caller/test of `renderSite`, and any render whose `post` has nothing
   * assigned) renders byte-identical to before this field existed — see
   * {@link renderAssignedTermsBlock}'s own doc.
   */
  assignedTerms: readonly AssignedTermView[];
  /**
   * Bug D follow-up (2026-10-22) — the site's IANA zone (`core.site.timezone`, resolved by the route
   * caller). The calendar day `dateShort`/`.entry-meta` show and the zone Liquid's `| date:` filter
   * formats in. Absent (every caller/test that never threads it) renders UTC, the pre-fix behavior.
   */
  timeZone?: string;
}

/** One resolved asset's public-render sizing override — see `SiteRenderContext.mediaAssetMetadata`'s
 * own doc. `null` on any field means "not set", not "zero"/"empty string". */
export interface MediaAssetRenderMeta {
  sha256?: string;
  width: number | null;
  height: number | null;
  cssClass: string | null;
  /** Same "not set, not empty" contract as `cssClass` — see `MediaRecord.htmlAttributes`'s own doc
   *  (`@jini-ai/cms/media`) for the full identity/security model. */
  htmlAttributes: string | null;
  /**
   * The asset's sniffed content type (`image/png`, `video/mp4`, …), or `null` when not (yet) known
   * — added 2026-09-11 for the generic `media` doc node's dispatch ({@link renderDocMedia}'s own
   * doc). `MediaRecord` (`@jini-ai/cms/media`) has no such field of its own; this is populated from
   * the Tovu-owned `MediaContentTypeStorePort` side channel (`features/media/content-type-store.ts`
   * — see that port's own file header for why), keyed by the asset's blob sha256, the SAME source
   * `resolver-service.ts`'s `resolveOneMediaEmbed` already reads for the sibling widget-embed media
   * path. Populated by `resolveMediaAssetMetadataForRender` (`routes/site/pages.ts`) for the direct
   * render path this file's own `renderDocNode`/`renderSite` reach, AND (also 2026-09-11, closing
   * what was briefly a disclosed gap) by `resolver-service.ts`'s `resolvePostContentMediaContext` —
   * shared by both `"post-content"` IR builders, `resolvePostTypeEmbeds` and
   * `resolveContentTypeEmbeds` — reconstructed on this side by {@link parseMediaAssetMeta}. That
   * shared path is NOT limited to "a post rendered because a PAGE embeds it": `routes/site/pages.ts`'s
   * `renderViaTemplate` reaches it via `resolveContentTypeEmbeds`'s DB branch for a post rendered at
   * its OWN public URL through a static-tier theme template too (see
   * `resolve-html-page-embeds.integration.test.ts`'s own doc on this — "the exact path both the
   * admin template-preview route AND any live post rendered through a static-tier theme's own
   * template go through"). A missing entry (mediaContentTypeStore not supplied, or a sha256 never
   * sniffed) degrades to `null` here, read as "not video" the same way every other unresolved ref on
   * this render path degrades, never a crash or a wrong guess at the asset's kind. Every
   * PRE-EXISTING reader of `MediaAssetRenderMeta` ({@link tryRenderRefImage}/
   * {@link resolveMediaAssetOverrides}, the `image` node's own path) never reads this field, so
   * adding it changes nothing about how `image` nodes render.
   */
  contentType: string | null;
  /**
   * The asset's CURRENT slug, or `null` when it has none (never uploaded through a path that
   * derives one, or a genuinely legacy row) — readable-slugs plan S3 (2026-09-23). This is the one
   * field {@link renderImageTag}/{@link renderVideoTag} read to decide the `/m/...` URL's key
   * (`mediaUrlKey`, `features/media/public-path.ts`): a present, valid slug wins, otherwise the
   * asset's `id` is used, same fallback `mediaUrlKey` itself implements. Rename safety
   * (`media_slug_history`, S2a/S2b) is what makes emitting a slug here safe — a slug this render
   * captures can be renamed later without breaking the URL already baked into this HTML.
   */
  slug: string | null;
}

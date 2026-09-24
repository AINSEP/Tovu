import type { JsonObject, JsonValue } from "@jini-ai/cms/core";
import { MAX_SLUG_LENGTH, SLUG_FORMAT_PATTERN, type PostRecord } from "#src/features/post/index";
import type { DiscoveredTheme, StaticMenuItem, TemplateNode } from "#src/features/theme/index";
import {
  resolveTemplateId,
  resolveLiquidTemplateId,
  resolveHandlebarsTemplateId,
  renderStaticPage,
  renderEntryList,
  withEntryListStyleOnce,
  type EntryListItem,
  type EntryListFieldValue,
} from "#src/features/theme/index";
import { isPageEmbedType, type ResolveHtmlPageEmbedsResult, type ResolvePageWidgetsResult } from "#src/features/widgets/resolver-service";
import type { AssignedTermView } from "#src/features/taxonomy/repo.sqlite";
import type { WidgetRenderIR } from "#src/features/widgets/types";
import { substituteHtmlEmbeds, type EmbedOccurrence, type PageHtmlEmbedRef } from "#src/features/widgets/html-embeds";
import type { MarkerAttribute } from "#src/contracts/core/embeds/marker";
import { parseEmbedHtmlAttributes } from "#src/contracts/core/embeds/html-attributes";
import { ATTRIBUTE_NAME_PATTERN } from "#src/features/forms/forms";
import { mediaPublicPath, mediaUrlKey } from "#src/features/media/index";
import { renderHandlebarsInSandbox } from "./handlebars-sandbox.js";
import { renderLiquidInSandbox } from "./liquid-sandbox.js";
import { FORM_BASELINE_STYLE, FORM_CLASS, renderFormSuccessSlot, renderFormErrorSlot } from "./form-render.js";
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

/**
 * @file Template-tree renderer for the public site (SPEC-004 spike slice).
 *
 * Purpose:
 * Turns a discovered declarative theme + page context into HTML. Resolves the
 * route to a template id, walks the template's JSON block tree, and renders
 * three node kinds: content doc nodes (TipTap/ProseMirror vocab), `slot` nodes
 * (context-filled), and `component` nodes (resolved against a core component
 * registry). No theme code executes — the theme is data.
 *
 * How it relates to the project:
 * - Used by `server/routes/site/pages.ts`.
 * - Theme look switches with the presentation feature's `activeThemeId`; the
 *   route resolves that id to a `DiscoveredTheme` and passes it here.
 *
 * Spike scope (VibeCoder): the four v1 core components + three slots, no theme
 * settings, no per-block sanitization. The blessed React renderer (ADR-002) can
 * replace this implementation without touching themes.
 */

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
}

/** One resolved asset's public-render sizing override — see `SiteRenderContext.mediaAssetMetadata`'s
 * own doc. `null` on any field means "not set", not "zero"/"empty string". */
export interface MediaAssetRenderMeta {
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

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Exported for `liquid-worker.ts`, which runs in an isolated worker thread and needs the same escaping used everywhere else in this renderer.
 *
 * BUG FIX (2026-09-06, owner-approved): `'` was never escaped, the same omission `form-render.ts`'s
 * own (deliberately duplicated) copy carried. `&` stays first — it is the escape character for every
 * entity below it, so escaping anything else first would double-escape the `&` those replacements
 * introduce. `&#39;` (numeric) rather than `&apos;`, which HTML4/XHTML1 parsers don't recognize.
 * Every one of this file's own call sites interpolates into a double-quoted attribute or bare text
 * (verified 2026-09-06 — no `='...'` sink anywhere in this module), so the gap was defence-in-depth
 * here, not an exploitable attribute-injection vector on its own. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Content doc vocabulary (unchanged from the pre-theme renderer)
// ---------------------------------------------------------------------------

/**
 * Fixed placeholder origin {@link safeHref} resolves a claimed same-origin-relative href against.
 * This is a pure string function with no real request/origin available to it — any two-part fixed
 * origin works equally well as the resolution anchor, since only the RELATIONSHIP between the
 * resolved URL's origin and this one is ever inspected below, never the placeholder value itself.
 */
const SAFE_HREF_RESOLUTION_BASE = "http://tovu-safehref.invalid/";
const SAFE_HREF_RESOLUTION_ORIGIN = new URL(SAFE_HREF_RESOLUTION_BASE).origin;

/**
 * Sanitize a content `link` href (C7). Content is data, so an inline link is an
 * untrusted string: allow only in-page (`#…`), same-origin relative (`/…`),
 * `http(s)://`, and `mailto:` targets. Everything else — notably `javascript:`
 * and `data:` — collapses to `"#"` so a doc can never smuggle script into a page.
 *
 * A `#…` target can never carry a scheme/host of its own — the WHATWG URL parser always resolves a
 * fragment-only reference against the CURRENT page's own origin, no matter what precedes or follows
 * the `#` (probed directly against Node's real `URL`, same discipline {@link safeImageSrc}'s own
 * header states for itself) — so that branch needs no further check.
 *
 * The `/…` branch is NOT a plain prefix check (2026-08-20 fix — audit finding "safeHref accepts
 * protocol-relative URLs"). A value can start with a single leading `/` and still resolve OFF
 * origin once a real browser parses it: `"//evil.example"` (protocol-relative — a browser resolves
 * it against the CURRENT PAGE's own scheme, landing on an attacker host), `"/\evil.example"` (a
 * browser folds a backslash to a forward slash for `http(s)` during parsing — the exact fold
 * {@link safeImageSrc}'s own header documents for its admin-media-path check), and even a
 * TAB/NEWLINE/CR planted between the leading `/` and the rest of the string (the WHATWG URL parser
 * strips those three characters from ANYWHERE in the input before parsing, per spec — not just the
 * string's ends, which is all `.trim()` above ever covers — so `"/\t/evil.example"` reconstitutes
 * the same `"//evil.example"` shape a browser would see). Resolving the trimmed value against a
 * FIXED placeholder origin and comparing origins closes all of the above in one check, the same way
 * {@link safeImageSrc}'s own `new URL(src).pathname` check replaced a shape-by-shape regex — and
 * stays correct against whatever equivalent shape is discovered next, rather than needing a new
 * `startsWith` exception bolted on per attack form.
 *
 * **`features/theme/static-render.ts` carries a deliberate DUPLICATE of this exact function** (its
 * own menu-link `safeHref`, added 2026-09-03 alongside the identical fix for the static-tier menu
 * renderers) — not a shared import, because `features/theme` must not deep-import this
 * `server/inbound/` module (`check:boundaries`' no-deep-import rule). That copy takes `string`
 * instead of `JsonValue | undefined` (its own callers already narrow to a real string first) but is
 * otherwise byte-identical, including this `/…` branch's placeholder-origin resolution. If this
 * function's logic changes, that copy must change too — it does not update itself.
 */
function safeHref(value: JsonValue | undefined): string {
  if (typeof value !== "string") return "#";
  const href = value.trim();
  if (href.startsWith("#")) return href;
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href;
  if (href.startsWith("/")) {
    let resolved: URL;
    try {
      resolved = new URL(href, SAFE_HREF_RESOLUTION_BASE);
    } catch {
      return "#";
    }
    return resolved.origin === SAFE_HREF_RESOLUTION_ORIGIN ? href : "#";
  }
  return "#";
}

/**
 * {@link safeHref}'s image-shaped sibling — the allowlist an author-supplied `attrs.src` must pass
 * before it reaches public HTML. Returns `null` when the value is not safe to emit, and the caller
 * degrades to {@link mediaPlaceholder} exactly as it did when `src` was refused unconditionally.
 *
 * ## Why this exists rather than the old blanket refusal
 *
 * Until 2026-08-12 the `"image"` case never read `src` at all. That was safe but blunt: it silently
 * broke the toolbar's own "Img by URL" control, which produced content that could never render. The
 * owner's objection was the right one — *"why is that even bad to refuse an attribute source? If the
 * user is saying they want it, why bar it?"* — and `safeHref` two functions up already demonstrates
 * the correct answer for the identical problem class: validate the scheme, do not ban the feature.
 *
 * ## What is rejected, and why each one matters
 *
 * - **`data:` / `blob:` / `file:` / `javascript:` and every other scheme.** Only `http(s)` is
 *   allowed, by allowlist rather than denylist, so a scheme nobody thought of fails closed.
 * - **The authenticated admin media URL** (`/workspaces/{ws}/media/{id}/original`, `api.ts`'s
 *   `mediaOriginalUrl`). This is the non-obvious one and the reason the blanket refusal existed at
 *   all: the editor's own node view legitimately previews via that URL on an authenticated admin
 *   surface, so it can genuinely end up in `attrs.src`. Emitting it publicly gives every reader a
 *   broken image and discloses internal routing. A ref-based node is the supported way to publish
 *   managed media — that path is untouched above.
 * - **Root-relative and protocol-relative paths.** Unlike a link, a root-relative *image* is either
 *   a managed asset (which must go through the ref path so its transform version is resolved) or a
 *   mistake; `//host/x` additionally inherits the page scheme, which is not a decision an author
 *   should make implicitly here.
 *
 * Note there is deliberately no server-side fetch anywhere in this path: the emitted URL is loaded
 * by the READER's browser, so this introduces no SSRF surface. Ingesting the URL server-side to
 * mint a real ref would — and would also have to solve `src/platform/http`'s (ADR-038) UTF-8 text buffering,
 * which corrupts binary bytes. See `PostEditor.tsx`'s toolbar comment for that full trade-off.
 */

/**
 * TM-TOVU-2026-08-12-A round 2 (two auditors, chased empirically — see
 * `tiptap-render-contract.test.ts`'s image-security rows for the probe evidence this fix is
 * built from): the admin-media rejection above used to test the RAW string. `[^/]+` cannot span a
 * `/`, so an interposed dot-segment defeats it while a real browser resolves the segment away
 * before requesting — `.../media/id/./original` and `.../media/x/../id/original` BOTH evaded the
 * old regex and landed on the exact blocked admin route. Testing `new URL(src).pathname` instead
 * closes this: WHATWG's URL parser removes `.`/`..` path segments (and folds a stray `\` into `/`
 * in the process) during parsing, so the check now sees exactly what a browser will request.
 *
 * Userinfo credentials (`https://user:pass@host/x.png`) are rejected too, and deliberately NOT
 * folded into {@link safeHref}: an `<img>` auto-fires the request on page load, with no reader
 * click and no address-bar/status-bar text for them to notice — unlike a link, which requires a
 * navigation gesture first. Silently shipping whatever an author pasted as embedded Basic-Auth
 * credentials to a third-party host on every single page view is a materially different risk than
 * the same string sitting inert in an `href` until clicked, so it is rejected here even though
 * `safeHref`'s identical-looking allowance stays untouched (pre-existing, accepted, out of scope).
 *
 * Two other vectors were investigated and are NOT fixed, for stated reasons rather than left
 * silently unconsidered:
 *  - **Punycode/IDN homographs** (`https://xn--.../x.png`): not actionable at this layer. The
 *    homograph-phishing threat model is about deceiving a user who is shown a host string and
 *    makes a trust decision on it (address bar, link hover) — an `<img src>` fetch shows the
 *    reader no URL text at all, so there is nothing here for a confusable domain to spoof.
 *  - **Backslash/authority-delimiter confusion**: probed directly against Node's real WHATWG `URL`
 *    parser rather than reasoned about — no input was found where the parsed host differs from
 *    what the raw string suggests. The admin-media check above is host-agnostic BY DESIGN (it
 *    matches the path shape on any host, since this pure function is never given the admin
 *    origin), so host confusion has no distinct surface to exploit here; a backslash-based
 *    dot-segment attempt against the admin path is closed by the same `.pathname` fix above, since
 *    WHATWG folds `\` to `/` before resolving dot-segments.
 *
 * Residual, not closed: a `%2F`-encoded or doubled `/` inside the admin path both still evade this
 * check (`.pathname` does not decode `%2F`, and does not collapse consecutive slashes). Traced —
 * not curled end-to-end against a running server — to Express's router matching route segments on
 * the raw, undecoded path before decoding each one, so a segment containing a literal `%2F` does
 * not functionally reach the same route as the real `/workspaces/{id}/media/{id}/original`, and an
 * empty segment from `//` is not a valid id for any real workspace/asset either. Left unfixed
 * rather than guessed at further; flagged here so it is a known, reasoned gap and not an
 * unconsidered one.
 */
const ADMIN_MEDIA_ORIGINAL_PATH = /\/workspaces\/[^/]+\/media\/[^/]+\/original\b/i;

function safeImageSrc(value: JsonValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const src = value.trim();
  if (!/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(src)) return null;
  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return null;
  }
  if (ADMIN_MEDIA_ORIGINAL_PATH.test(parsed.pathname)) return null;
  if (parsed.username || parsed.password) return null;
  return src;
}

/**
 * Allowlisted CSS color forms an author-supplied `color` (highlight/text-color/background-color
 * marks, 2026-08-11) may take before it reaches public HTML inside a `style=""` attribute — the
 * same "collapse anything unrecognized rather than splice an arbitrary string into markup"
 * discipline {@link safeHref} applies to link hrefs (C7), adapted for CSS instead of a URL scheme.
 *
 * Accepts: 3/4/6/8-digit hex (`#abc`, `#aabbcc`, `#aabbccdd`); a bare alphabetic keyword up to 20
 * chars (`red`, `transparent`, `currentcolor` — an unrecognized keyword is simply invalid CSS the
 * browser ignores, not an injection vector, so this doesn't need a fixed keyword allowlist); or one
 * of the five functional notations Tiptap's own Color/Highlight pickers can produce (`rgb`/`rgba`/
 * `hsl`/`hsla`/`oklch`), with the characters INSIDE the parens restricted to digits/`%`/`.`/`,`/
 * whitespace/`/` (the last for `oklch(l c h / a)`'s alpha slot) — no nested `(`, no `url(`, no `;`,
 * no backslash, so nothing here can break out of the `style` attribute's value or smuggle a second
 * CSS declaration. Returns `null` (not `"#"` — there is no safe placeholder color to fall back to)
 * so every caller omits the attribute entirely on a rejected value, same as {@link renderImageTag}'s
 * own "omit rather than emit a malformed/placeholder attribute" rule.
 */
const CSS_COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20}|(?:rgb|rgba|hsl|hsla|oklch)\([0-9.%,\s/]{1,80}\))$/;
function safeCssColor(value: JsonValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim();
  return CSS_COLOR_PATTERN.test(color) ? color : null;
}

/**
 * Allowlisted CSS `font-family` values (2026-08-11) — same "collapse anything unrecognized" rule
 * {@link safeCssColor} states for itself, adapted for a font stack instead of a color: the admin
 * toolbar's own control is a closed `<select>` of preset stacks, so this exists purely as
 * defense-in-depth against `bodyJson` written some other way. Restricted to letters/digits/
 * whitespace/comma/hyphen/single-or-double-quote — enough to express a real comma-separated font
 * stack with quoted multi-word names (`"Courier New", monospace`) but no `(`, `;`, `<`, `>`, or
 * backslash, so nothing here can break out of the `style=""` attribute value or smuggle a second
 * declaration. The value is ALSO run through {@link escapeHtml} at the call site (same double-layer
 * discipline the `link` case's `href` already gets) since a quoted font name legitimately contains
 * `"`, which must become `&quot;` to stay valid inside the double-quoted HTML attribute.
 */
const CSS_FONT_FAMILY_PATTERN = /^[a-zA-Z0-9\s,'".-]{1,200}$/;
function safeCssFontFamily(value: JsonValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const fontFamily = value.trim();
  return fontFamily.length > 0 && CSS_FONT_FAMILY_PATTERN.test(fontFamily) ? fontFamily : null;
}

/**
 * Allowlisted CSS length values (2026-08-11) — `font-size`/`line-height`'s shared shape: a bare
 * unitless number (`line-height`'s own idiomatic form, e.g. `"1.5"`) or a number with one of a
 * small set of length units. Same defense-in-depth reasoning as {@link safeCssFontFamily} — the
 * toolbar's own controls are closed `<select>` presets.
 */
const CSS_LENGTH_PATTERN = /^[0-9]{1,4}(\.[0-9]{1,3})?(px|em|rem|%|pt|vh|vw)?$/;
function safeCssLength(value: JsonValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const length = value.trim();
  return CSS_LENGTH_PATTERN.test(length) ? length : null;
}

/**
 * Allowlisted `language-*` class token for a `codeBlock` node's `attrs.language`
 * (`@tiptap/extension-code-block-lowlight`, 2026-08-11 — coordinator-approved addition, option (c)
 * of three: store only the language name, emit it as a class, no server-side highlighter
 * dependency; a theme MAY load a client-side highlighter that reads this class, or may not — either
 * way the code still renders as readable monospace). Not validated against lowlight's own
 * registered-language list (unlike the editor's language `<select>`, which only offers names
 * lowlight's `common` grammar set actually registers) — an unrecognized-but-safe token is harmless
 * here, it just never matches a highlighter's own CSS/JS on the public side. Restricted to
 * alphanumeric + hyphen only (matches every real `highlight.js` language/alias name, e.g.
 * `objective-c`, `python-repl`) purely to keep this an inert class token: nothing in this pattern
 * can carry a quote, space, or `<`/`>` that would break out of the `class=""` attribute.
 */
const LANGUAGE_CLASS_PATTERN = /^[a-zA-Z0-9-]{1,32}$/;
function safeLanguageClass(value: JsonValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const language = value.trim();
  return LANGUAGE_CLASS_PATTERN.test(language) ? language : null;
}

/**
 * A YouTube video id extracted from a `youtube` node's `attrs.src` (`@tiptap/extension-youtube`,
 * 2026-08-11 — coordinator-approved, license-verified) and independently re-derived here rather than
 * trusted — the SAME "never trust attrs a direct API write could set to anything" discipline every
 * other node/mark case in this file follows, sharper here because the payoff for an attacker is
 * bigger: `attrs.src` feeds an `<iframe src>`, and the editor's own conversion to a safe embed URL
 * (`getEmbedUrlFromYoutubeUrl`, confirmed against the installed dist) runs client-side at RENDER
 * time, not at insert time — `bodyJson` stores whatever URL shape the author pasted (`watch?v=`,
 * `youtu.be/`, already-`/embed/`, …), so this renderer cannot skip re-deriving it.
 *
 * Deliberately narrower than the editor's own URL matcher: extracts only an id from one of the four
 * URL shapes the extension itself recognizes, validated against a conservative `[\w-]{1,32}`
 * (real ids are 11 chars; the slack is for future format changes, not because a longer value is
 * trusted). Anything else — a non-YouTube host, a bare id with no recognizable URL shape,
 * `javascript:`, `data:` — returns `null`, and the caller degrades to the ordinary media placeholder
 * rather than ever building an `<iframe>` from an unrecognized string.
 */
const YOUTUBE_ID_PATTERN = /^[\w-]{1,32}$/;
const YOUTUBE_URL_PATTERN = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]+)/;
function extractYoutubeVideoId(value: JsonValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(YOUTUBE_URL_PATTERN);
  const id = match?.[1];
  return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
}

/**
 * `textStyle` mark renderer — `@tiptap/extension-text-style` (2026-08-11) — `Color`/`BackgroundColor`
 * are both `Extension`s that attach a global attribute to this ONE shared mark rather than marks of
 * their own (confirmed against the installed dist, not assumed: both literally call
 * `chain().setMark("textStyle", { color/backgroundColor })`), so a run of text with both picked
 * carries a SINGLE `textStyle` mark with both attrs, not two nested marks — the combined style string
 * below mirrors that, one `<span style="...">`, not two nested spans. Each value is independently
 * allowlisted ({@link safeCssColor}) before it reaches public HTML; an unsafe/malformed value for
 * either drops just that declaration rather than the whole style attribute (an author who picked a
 * valid text color but somehow got a corrupted background value keeps the text color). No attrs
 * surviving the allowlist (including the common case: a `textStyle` mark with neither attr set, e.g.
 * from `toggleTextStyle()` or some other extension using this same mark) renders no `<span>` at all —
 * an empty `style=""` wrapper would be pure noise.
 */
function renderTextStyleMark(html: string, attrs: JsonObject): string {
  const styleParts: string[] = [];
  const color = safeCssColor(attrs.color);
  if (color) styleParts.push(`color:${color}`);
  const backgroundColor = safeCssColor(attrs.backgroundColor);
  if (backgroundColor) styleParts.push(`background-color:${backgroundColor}`);
  // Font family/size, line height (2026-08-11) — same shared `textStyle` mark, same
  // `chain().setMark("textStyle", {...})` shape confirmed against each extension's own
  // installed source (`FontFamily`/`FontSize`/`LineHeight`, `@tiptap/extension-text-style`).
  const fontFamily = safeCssFontFamily(attrs.fontFamily);
  if (fontFamily) styleParts.push(`font-family:${fontFamily}`);
  const fontSize = safeCssLength(attrs.fontSize);
  if (fontSize) styleParts.push(`font-size:${fontSize}`);
  const lineHeight = safeCssLength(attrs.lineHeight);
  if (lineHeight) styleParts.push(`line-height:${lineHeight}`);
  return styleParts.length > 0 ? `<span style="${escapeHtml(styleParts.join(";"))}">${html}</span>` : html;
}

/**
 * `highlight` mark renderer — `@tiptap/extension-highlight`, `multicolor: true` (2026-08-11) — the
 * admin toolbar button is a plain toggle (no color picker), so `attrs.color` is normally absent and
 * this renders a bare `<mark>`, styled by `.post-detail-body mark` (styles.css). A `color` attr from
 * anywhere else (pasted content, a future picker) still round-trips as an inline `background-color`
 * as long as it passes {@link safeCssColor}'s allowlist — an unsafe/malformed value degrades to the
 * bare `<mark>` rather than a malformed or unsafe style attribute.
 */
function renderHighlightMark(html: string, attrs: JsonObject): string {
  const color = safeCssColor(attrs.color);
  return color ? `<mark style="background-color:${escapeHtml(color)}">${html}</mark>` : `<mark>${html}</mark>`;
}

function renderLinkMark(html: string, attrs: JsonObject): string {
  return `<a href="${escapeHtml(safeHref(attrs.href))}">${html}</a>`;
}

/** One renderer per mark `type`, keyed the same way {@link renderMarks} used to switch on the value
 *  inline — a lookup instead of an if/else-if chain so the chain's own length stops being the thing
 *  driving this function's complexity (see `renderMarks`'s own doc). Each entry receives the
 *  already-escaped/nested `html` so far and the mark's own `attrs` (defaulted to `{}` by the caller),
 *  same contract every branch of the old chain relied on. */
/**
 * Exported (2026-09-11) purely so `features/post/agent-tools.ts`'s own test suite can gate its
 * published mark-type schema against this map's real keys instead of a hand-maintained copy going
 * stale again — no other behavior change; this map is still read only by {@link renderMarks} inside
 * this module.
 */
export const MARK_RENDERERS: Record<string, (html: string, attrs: JsonObject) => string> = {
  bold: (html) => `<strong>${html}</strong>`,
  italic: (html) => `<em>${html}</em>`,
  code: (html) => `<code>${html}</code>`,
  underline: (html) => `<u>${html}</u>`,
  strike: (html) => `<s>${html}</s>`,
  subscript: (html) => `<sub>${html}</sub>`,
  superscript: (html) => `<sup>${html}</sup>`,
  textStyle: renderTextStyleMark,
  highlight: renderHighlightMark,
  link: renderLinkMark,
};

function renderMarks(text: string, marks: JsonValue[] | undefined): string {
  let html = escapeHtml(text);
  for (const mark of marks ?? []) {
    if (!isObject(mark)) continue;
    const renderer = typeof mark.type === "string" ? MARK_RENDERERS[mark.type] : undefined;
    if (!renderer) continue;
    html = renderer(html, isObject(mark.attrs) ? mark.attrs : {});
  }
  return html;
}

/** No-widgets default for every `renderDocNode`/`renderNodes` caller that doesn't pass one. */
const EMPTY_INLINE_RESOLVED: ReadonlyMap<string, WidgetRenderIR> = new Map();

/**
 * No-transforms default for every `renderDocNode`/`renderNodes` caller that doesn't pass one —
 * mirrors {@link EMPTY_INLINE_RESOLVED}'s exact "missing means degrade safely" convention. Keyed
 * by transform NAME (not `assetId`): a registered transform's latest version is a property of
 * `(workspaceId, transformName)` alone (`transform-registry.ts`), so one small map resolved once
 * per render covers every image node in the document regardless of how many distinct assets it
 * references — this is why media resolution needs nothing like `widgetInlineResolved`'s
 * per-placement batch join.
 */
const EMPTY_MEDIA_TRANSFORM_VERSIONS: ReadonlyMap<string, number> = new Map();

/** No-overrides default for every `renderDocNode`/`renderNodes` caller that doesn't pass one —
 * same "optional, defaults to empty, degrades to no attribute" convention as
 * {@link EMPTY_MEDIA_TRANSFORM_VERSIONS} immediately above. */
const EMPTY_MEDIA_ASSET_METADATA: ReadonlyMap<string, MediaAssetRenderMeta> = new Map();

/** No-terms default for every `renderSite`/`renderPostBody` caller that doesn't pass one — same
 * "optional, defaults to empty, degrades to no block" convention as {@link EMPTY_MEDIA_ASSET_METADATA}
 * immediately above. */
const EMPTY_ASSIGNED_TERMS: readonly AssignedTermView[] = [];

/** `assetId`/`transformName` become `/m/` URL path segments (`media-rendition.ts`), so — same
 * discipline `html-embeds.ts`'s `MAX_EMBED_ID_LENGTH` applies to its own author-supplied ids —
 * shape is checked before either value is trusted into a path: non-empty, bounded, and free of
 * `/`/whitespace so an author-authored ref can never smuggle an extra path segment. An id that
 * fails this is treated exactly like a name absent from `mediaTransformVersions`: safe
 * placeholder degrade, never a malformed URL. */
const MAX_MEDIA_REF_ID_LENGTH = 200;
const PLAUSIBLE_MEDIA_REF_ID_PATTERN = /^[^\s/]+$/;

function isPlausibleMediaRefId(value: string): boolean {
  return value.length > 0 && value.length <= MAX_MEDIA_REF_ID_LENGTH && PLAUSIBLE_MEDIA_REF_ID_PATTERN.test(value);
}

/**
 * Builds a real `<img>` tag from an already-resolved, already-validated media reference — the ONE
 * place `/m/{assetId}/{transformName}.v{version}/...` is templated (ADR-027 §4's frozen URL
 * contract) and the ONE place its attributes are escaped. Two callers share this: the TipTap
 * `image` ref-node case below (`assetId`/`transformName`/`version` resolved via
 * `mediaTransformVersions`/`mediaAssetMetadata`, threaded in by the route caller) and
 * `renderWidgetIr`'s `"media-image"` case (SPEC-047, `data-embed-type="media"` Page embeds,
 * resolved ahead of render by `resolver-service.ts`'s `resolveHtmlPageEmbeds`) — same URL shape,
 * same escaping, same optional-attribute-omission rule, deliberately implemented once rather than
 * twice (the "reuse, don't reimplement" requirement the media embed resolver was dispatched under).
 *
 * `width`/`height`/`cssClass` are each emitted independently and only when non-null — an asset with
 * only `width` set gets `width="…"` alone, never a `height="0"` or empty `class="""` (owner's
 * explicit instruction, carried over unchanged from the original `image` case).
 *
 * @complexity O(1).
 * @overallScore 100
 */
/**
 * Re-validates `raw` free-text HTML attributes against the shared render-time allowlist
 * ({@link parseEmbedHtmlAttributes}, `#src/contracts/core/embeds/html-attributes` — S1, 2026-09-23
 * widget-attrs plan) and returns only the accepted attribute map — the render-path half of the
 * allowlist's defense-in-depth (owner requirement: enforced at the write path AND the render path,
 * since a client-only check is not a control). `updateMediaMetadata` (`@jini-ai/cms/media`) already
 * validates before writing, so a re-parse failure here should be unreachable through the normal
 * write path — but this function still re-validates rather than trusting a stored value was never
 * written by an older code path, a direct DB edit, or a future bug in the write-side check, matching
 * this file's own "escape/validate at the one place a tag is templated" discipline for every other
 * attribute here.
 *
 * Every render-time re-parse of a free-text `htmlAttributes` field in this file — media asset, media
 * post-node, and widget post-node — goes through this ONE function, so all three share one allowlist
 * and one failure mode: a rejected token (an `on*` handler, an unsafe URL scheme, an unsafe `style`
 * value, a disallowed name) is simply omitted from the returned map, while every other token in the
 * same string still lands (`parseEmbedHtmlAttributes`'s per-token behavior). Only `malformed` —
 * the tokenizer itself losing sync — empties the whole map; `raw`'s caller never needs to
 * distinguish that from "nothing accepted" here, since both return `{}`.
 *
 * @param raw - The free-text `htmlAttributes` field (asset- or node-level) — `null`/empty means no
 *   extra attributes.
 * @complexity O(n) in `raw`'s length (one parse pass), O(k) space for k accepted attributes.
 */
function resolveEmbedHtmlAttributes(raw: string | null): Record<string, string> {
  if (!raw) return {};
  return parseEmbedHtmlAttributes(raw).attributes;
}

/** A shallow copy of `attributes` with `key` removed — used when a call site already emits its own
 *  value for one allowlisted name (e.g. `renderImageTag`'s hardcoded `loading` default) and needs
 *  the rest formatted without emitting that name twice. @complexity O(k). */
function omitKey(attributes: Record<string, string>, key: string): Record<string, string> {
  const { [key]: _omitted, ...rest } = attributes;
  return rest;
}

/** Formats an already-resolved attribute map into escaped ` name="value"` fragments, one per
 *  entry — the shared tail every one of {@link renderImageTag}/{@link renderVideoTag}'s emitted
 *  attributes eventually goes through. @complexity O(k) in the number of attributes. */
function formatHtmlAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join("");
}

/** No marker forwarded any attribute — the common case (most media markers are bare), shared so
 *  {@link renderImageTag}/{@link renderVideoTag}'s callers don't each allocate an empty array. */
const NO_MARKER_ATTRIBUTES: readonly MarkerAttribute[] = [];

/**
 * Formats one already-decided value for embedding inside a double-quoted HTML attribute — the render-
 * path half of D3/D4 (2026-09-16 embed-attributes plan). An **asset**-sourced value (`MediaRecord.
 * cssClass`/`htmlAttributes`, already allowlist-validated by {@link resolveEmbedHtmlAttributes}, not
 * itself entity-encoded) goes through the ordinary {@link escapeHtml}, matching every pre-existing call
 * site in this file. A **marker**-sourced value is SOURCE TEXT (D4: `EmbedMarker.attrs`'s own
 * {@link MarkerAttribute}) and only its literal `"` is escaped — the identical rule
 * {@link formatMarkerAttributes} applies when re-serializing a wrapper's own kept attributes — so a
 * marker's `&amp;` is never re-escaped into `&amp;amp;`.
 *
 * @complexity O(n) in the value's length.
 */
function attributeValueHtml(value: string, source: "asset" | "marker"): string {
  return source === "asset" ? escapeHtml(value) : value.replace(/"/g, "&quot;");
}

/**
 * D3's `class` rule: the asset's `cssClass` comes first, then the author's marker `class` value,
 * joined with one space — an ADDITION, never a replacement, unlike every other attribute name (see
 * {@link mergeMediaExtraAttributes}'s own doc for why `class` is excluded from that generic merge and
 * handled here instead). A bare (valueless) marker `class` attribute contributes nothing — an
 * attribute name with no class names to add.
 *
 * @complexity O(1) beyond the linear `find` over `markerAttributes`.
 */
function mergeMediaClassAttr(assetClass: string | null, markerAttributes: readonly MarkerAttribute[]): string {
  const markerClass = markerAttributes.find((attr) => attr.name === "class")?.value;
  const parts = [
    assetClass ? attributeValueHtml(assetClass, "asset") : null,
    markerClass ? attributeValueHtml(markerClass, "marker") : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? ` class="${parts.join(" ")}"` : "";
}

/**
 * Folds a free-text `htmlAttributes`' own `class` token — now allowlisted (S1, 2026-09-23
 * widget-attrs plan), unlike the old `data-*`/`aria-*`-only boundary — into an already-built
 * ` class="..."` fragment from {@link mergeMediaClassAttr}, appended LAST so it layers on top of
 * both the asset's own `cssClass` and a marker's own `class` (D3's existing precedence between
 * those two is untouched; this is strictly an addition after it). Kept as its own step, rather than
 * folded into {@link mergeMediaClassAttr} itself, so that function's own asset/marker precedence
 * rule stays exactly as documented there — this is a third, independent source, not a change to how
 * the first two combine.
 *
 * @param classAttr - {@link mergeMediaClassAttr}'s own return value: either `""` or a full
 *   ` class="..."` fragment.
 * @param extraClass - `resolveEmbedHtmlAttributes(...).class`, already allowlist-validated,
 *   value-untouched — `undefined` when `htmlAttributes` carried no `class` token.
 * @complexity O(1).
 */
function foldHtmlAttributesClass(classAttr: string, extraClass: string | undefined): string {
  if (!extraClass) return classAttr;
  const escaped = attributeValueHtml(extraClass, "asset");
  return classAttr === "" ? ` class="${escaped}"` : `${classAttr.slice(0, -1)} ${escaped}"`;
}

/**
 * D3's `alt` rule for an `<img>`: the author's marker value REPLACES the asset's own `alt`, never
 * appends — unlike `class`. {@link renderVideoTag} has its own sibling for the fallback-text-node case
 * (`<video>` has no `alt` attribute at all).
 *
 * @complexity O(1) beyond the linear `find` over `markerAttributes`.
 */
function mediaAltAttrValue(assetAlt: string, markerAttributes: readonly MarkerAttribute[]): string {
  const markerAlt = markerAttributes.find((attr) => attr.name === "alt");
  return markerAlt ? attributeValueHtml(markerAlt.value ?? "", "marker") : attributeValueHtml(assetAlt, "asset");
}

/**
 * D3's `width`/`height` rule: the author's marker value replaces the asset's own numeric value; a
 * BARE marker `width`/`height` (no `="…"`, meaningless on its own) is treated as no override rather
 * than emitting an empty `width=""`. Shared by both dimensions since the rule (and the "author wins,
 * asset is the fallback, absent is omitted entirely" shape) is identical for each.
 *
 * @complexity O(1) beyond the linear `find` over `markerAttributes`.
 */
function mediaDimensionAttr(name: "width" | "height", assetValue: number | null, markerAttributes: readonly MarkerAttribute[]): string {
  const markerAttr = markerAttributes.find((attr) => attr.name === name);
  if (markerAttr) {
    return markerAttr.value === null ? "" : ` ${name}="${attributeValueHtml(markerAttr.value, "marker")}"`;
  }
  return assetValue != null ? ` ${name}="${assetValue}"` : "";
}

/**
 * Merges the asset's own already-allowlisted `htmlAttributes` extras with a media marker's forwarded
 * attributes (D3, 2026-09-16 embed-attributes plan) into one ordered, ready-to-emit fragment tail —
 * the shared "everything else" merge both {@link renderImageTag} and {@link renderVideoTag} call for
 * the names they don't each render at a fixed position themselves.
 *
 * Order and precedence: asset extras first, in their stored order; a marker attribute of the SAME
 * name then replaces that entry'S VALUE IN PLACE (same position — a `Map`'s `set` on an existing key
 * never moves it), while a marker attribute with a NEW name is appended, in authored order, after
 * every asset extra. This is "author wins, asset extras keep their position" (D3), not "marker
 * attributes always come last."
 *
 * `excludeNames` is how each caller keeps its own fixed-position names (`class`, `alt`, `width`,
 * `height`, `loading` for `<img>`, `controls` for `<video>`) out of this generic tail, so they are
 * never emitted twice. `src`/`srcset` are ALWAYS excluded regardless of caller — they are
 * renderer-owned (D3: the resolved asset URL is the whole point of the marker; a `srcset` would
 * silently override `src`) and a marker's own value for either name must never reach the output, not
 * even into this generic merge.
 *
 * @complexity O(n + m) in the asset-extra count n and the marker-attribute count m.
 */
function mergeMediaExtraAttributes(
  assetExtras: Record<string, string>,
  markerAttributes: readonly MarkerAttribute[],
  excludeNames: ReadonlySet<string>
): string {
  const merged = new Map<string, string>();
  for (const [name, value] of Object.entries(assetExtras)) {
    if (excludeNames.has(name)) continue;
    merged.set(name, ` ${name}="${attributeValueHtml(value, "asset")}"`);
  }
  for (const attr of markerAttributes) {
    if (excludeNames.has(attr.name) || attr.name === "src" || attr.name === "srcset") continue;
    merged.set(attr.name, attr.value === null ? ` ${attr.name}` : ` ${attr.name}="${attributeValueHtml(attr.value, "marker")}"`);
  }
  return [...merged.values()].join("");
}

/** Names {@link renderImageTag} renders itself at a fixed position — kept out of
 *  {@link mergeMediaExtraAttributes}'s generic tail so none of them is ever emitted twice. */
const MEDIA_IMAGE_FIXED_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set(["class", "alt", "width", "height", "loading"]);

function renderImageTag(props: {
  /** The `/m/...` path segment to serve this asset at — its slug when it has one, otherwise its id.
   *  Built by every caller via `mediaUrlKey` (readable-slugs S3); this function only templates
   *  whatever key it is handed, same as before this field was renamed from `assetId`. */
  readonly urlKey: string;
  readonly transformName: string;
  readonly version: number;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly cssClass: string | null;
  readonly htmlAttributes: string | null;
  readonly markerAttributes?: readonly MarkerAttribute[];
}): string {
  const src = mediaPublicPath(props.urlKey, { kind: "transform", name: props.transformName, version: props.version, ext: "jpg" });
  const markerAttributes = props.markerAttributes ?? NO_MARKER_ATTRIBUTES;
  const altAttr = mediaAltAttrValue(props.alt, markerAttributes);
  const widthAttr = mediaDimensionAttr("width", props.width, markerAttributes);
  const heightAttr = mediaDimensionAttr("height", props.height, markerAttributes);
  // `loading` is on the allowlist (an operator may legitimately want `loading="eager"`) but this
  // tag already hardcodes a `loading="lazy"` default below — the asset's own value, when present,
  // wins over the default, and a marker's own `loading` attribute (D3: author wins over asset) wins
  // over both, never a silently dropped or duplicated second `loading` attribute.
  const allExtra = resolveEmbedHtmlAttributes(props.htmlAttributes);
  // `class` is now an allowlisted name (S1, 2026-09-23 widget-attrs plan), same as `style`/`id` — it
  // is folded into the class attribute here rather than left to `mergeMediaExtraAttributes`'s
  // generic tail (which already excludes it via `MEDIA_IMAGE_FIXED_ATTRIBUTE_NAMES`, same reason
  // `mergeMediaClassAttr`'s own doc gives for the marker's `class`: an addition, never a second
  // `class="..."` attribute).
  const classAttr = foldHtmlAttributesClass(mergeMediaClassAttr(props.cssClass, markerAttributes), allExtra.class);
  const markerLoading = markerAttributes.find((attr) => attr.name === "loading");
  const loadingValue = markerLoading
    ? attributeValueHtml(markerLoading.value ?? "lazy", "marker")
    : attributeValueHtml(allExtra.loading ?? "lazy", "asset");
  const extraAttrs = mergeMediaExtraAttributes(omitKey(allExtra, "loading"), markerAttributes, MEDIA_IMAGE_FIXED_ATTRIBUTE_NAMES);
  return `<img src="${escapeHtml(src)}" alt="${altAttr}"${widthAttr}${heightAttr}${classAttr}${extraAttrs} loading="${loadingValue}">`;
}

/**
 * Builds a real `<video>` tag for a resolved video media embed (video/embed capability,
 * 2026-08-24) — {@link renderImageTag}'s sibling, same optional-attribute-omission convention, but
 * points `src` at `/m/{assetId}/original` (`routes/site/media-rendition.ts`'s
 * `registerMediaOriginalVideoRoute`) instead of the versioned transform URL: video has no
 * transform/version to template in, since it bypasses the image-transform pipeline entirely (see
 * that route's own doc for why). `alt` becomes the tag's fallback text node, not an `alt`
 * attribute — `<video>` has no such attribute; a browser that can't play the element renders its
 * children instead, so this is the same information in the shape `<video>` actually supports.
 *
 * @complexity O(1).
 */
/** Names {@link renderVideoTag} renders itself at a fixed position (or, for `controls`, via its own
 *  boolean prop rather than a forwarded attribute at all) — kept out of
 *  {@link mergeMediaExtraAttributes}'s generic tail so none of them is ever emitted twice. `controls`
 *  is excluded unconditionally even though `EmbedOccurrence.elementAttributes` never actually carries
 *  a `"controls"`-named entry (`html-embeds.ts`'s `resolveMarkerControls`/`planMediaMarkerAttributes`
 *  strip it before this function ever sees `markerAttributes`) — this is defence-in-depth for the same
 *  reason {@link resolveEmbedHtmlAttributes} fails closed on a re-parse: never trust a single upstream
 *  guarantee alone for a rule this precise (a stray `controls="false"` reaching a browser as a literal
 *  attribute still shows controls, since it is a boolean-by-presence attribute). */
const MEDIA_VIDEO_FIXED_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set(["class", "alt", "width", "height", "controls"]);

function renderVideoTag(props: {
  /** Same `mediaUrlKey`-built `/m/...` key {@link renderImageTag}'s own `urlKey` documents —
   *  readable-slugs S3. */
  readonly urlKey: string;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly cssClass: string | null;
  readonly htmlAttributes: string | null;
  readonly markerAttributes?: readonly MarkerAttribute[];
  /** `EmbedOccurrence.controls` (owner decision, 2026-09-16): `false` only when the marker's own
   *  `controls` attribute resolves to off. Rendered as a bare `controls`/nothing — never a raw
   *  forwarded attribute of that name; see {@link MEDIA_VIDEO_FIXED_ATTRIBUTE_NAMES}'s own doc.
   *  Defaults to `true` (the pre-existing, only-ever behavior before this prop existed). */
  readonly controls?: boolean;
}): string {
  const src = mediaPublicPath(props.urlKey, { kind: "original" });
  const markerAttributes = props.markerAttributes ?? NO_MARKER_ATTRIBUTES;
  const controlsAttr = (props.controls ?? true) ? " controls" : "";
  const widthAttr = mediaDimensionAttr("width", props.width, markerAttributes);
  const heightAttr = mediaDimensionAttr("height", props.height, markerAttributes);
  const allExtra = resolveEmbedHtmlAttributes(props.htmlAttributes);
  // `class` is now an allowlisted name (S1, 2026-09-23 widget-attrs plan) — folded in here, same as
  // `renderImageTag`'s own identical fold, rather than left to `mergeMediaExtraAttributes`'s generic
  // tail (already excluded via `MEDIA_VIDEO_FIXED_ATTRIBUTE_NAMES`).
  const classAttr = foldHtmlAttributesClass(mergeMediaClassAttr(props.cssClass, markerAttributes), allExtra.class);
  // No hardcoded default here to collide with (unlike `renderImageTag`'s `loading`) — every
  // allowlisted asset attribute is emitted as-is, including boolean ones (`muted`, `loop`,
  // `autoplay`, `playsinline`), which the parser records as an empty-string value; HTML treats ANY
  // value (including `""`) on a boolean attribute as "true", so `muted=""` and bare `muted` are
  // equivalent. A marker's own boolean attribute keeps ITS OWN shape instead (a bare `autoplay`
  // renders as bare `autoplay`, never `autoplay=""`) — {@link mergeMediaExtraAttributes} preserves
  // that distinction rather than normalizing every boolean attribute to the asset path's convention.
  const extraAttrs = mergeMediaExtraAttributes(allExtra, markerAttributes, MEDIA_VIDEO_FIXED_ATTRIBUTE_NAMES);
  // `alt` has no `<video>` attribute equivalent (see this function's own header doc) — a marker's
  // `alt` attribute (D3) replaces the fallback TEXT NODE instead, used verbatim as source text (never
  // re-escaped: this text node sits inside a page whose own body HTML is already unsanitized by
  // design — D6 — so a marker attribute's value carries no less trust here than it does anywhere else
  // on the same page).
  const markerAlt = markerAttributes.find((attr) => attr.name === "alt");
  const fallback = markerAlt
    ? (markerAlt.value ?? "")
    : props.alt
      ? escapeHtml(props.alt)
      : "Your browser does not support the video tag.";
  return `<video src="${escapeHtml(src)}"${controlsAttr}${widthAttr}${heightAttr}${classAttr}${extraAttrs}>${fallback}</video>`;
}

/**
 * Flattens a doc node's nested inline content down to its plain text — the heading label as a reader
 * sees it, with `bold`/`italic`/`link` marks and any other inline wrapper structure discarded. Used
 * only to derive {@link headingAnchorId}; the visible heading still renders through the normal
 * `renderNodes` path with all its markup intact.
 */
function nodeText(node: JsonValue): string {
  if (!isObject(node)) return "";
  if (typeof node.text === "string") return node.text;
  const content = Array.isArray(node.content) ? node.content : [];
  return content.map(nodeText).join("");
}

/**
 * The `id` a rendered heading carries so an in-page `#anchor` link has something to land on.
 *
 * Matches `post.ts`'s own `slugify` rule character-for-character rather than inventing a second
 * slug dialect — a heading's anchor and a post's slug should not disagree about what "C++ & Rust"
 * becomes. Returns `""` for a heading whose text slugifies to nothing (emoji-only, punctuation-only);
 * the caller then emits no `id` rather than an empty one, since `id=""` is invalid and unlinkable
 * anyway.
 */
function headingAnchorId(node: JsonValue): string {
  return nodeText(node)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Suffixes repeated heading ids within ONE rendered document (`overview`, `overview-2`, `overview-3`).
 *
 * Runs as a pass over the finished `doc` HTML rather than being threaded through `renderDocNode` as
 * an accumulator parameter, for two reasons: `renderDocNode` is exported and its signature is
 * depended on by `liquid-worker.ts` and direct test calls, and a document is the only scope where
 * "duplicate" is even meaningful — two posts may each legitimately have an `#overview`.
 *
 * Only ids this renderer just generated are touched. The pattern is anchored to a heading tag with
 * `id` as its FIRST attribute, which is exactly the shape the `heading` case emits and is not a shape
 * authored content can reach (doc nodes cannot carry raw HTML attributes), so no author-supplied
 * markup is rewritten by this.
 */
function dedupeHeadingIds(html: string): string {
  const seen = new Map<string, number>();
  return html.replace(/<h([1-6]) id="([^"]*)">/g, (_m, level: string, id: string) => {
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    return count === 1 ? `<h${level} id="${id}">` : `<h${level} id="${id}-${count}">`;
  });
}

/**
 * `text-align` inline style for a `textAlign` attr value (`@tiptap/extension-text-align`, admin
 * `PostEditor.tsx`'s `Toolbar`, 2026-08-11). `"left"` (the CSS/HTML default), `null`, and any other
 * value this renderer doesn't recognize are never emitted as an explicit attribute — same "optional,
 * omit rather than emit a no-op" convention {@link renderImageTag}'s width/height/class already
 * follow.
 *
 * @complexity O(1).
 */
function styleForAlign(align: string | null): string {
  return align && align !== "left" ? ` style="text-align:${escapeHtml(align)}"` : "";
}

/** {@link styleForAlign} read directly off a doc node's own `attrs.textAlign` — the `paragraph` and
 *  `heading` cases below share this shape; {@link extractTitleNode}'s caller reads the same attr off
 *  an already-extracted node instead, since it needs the node's inline content too. */
function alignStyleAttr(node: JsonObject): string {
  const align = isObject(node.attrs) && typeof node.attrs.textAlign === "string" ? node.attrs.textAlign : null;
  return styleForAlign(align);
}

/**
 * `text-align` inline style for a `tableCell`/`tableHeader` node's own `attrs.align`
 * (`@tiptap/extension-table`, 2026-08-11) — narrower than {@link alignStyleAttr}: a table cell's own
 * `normalizeTableCellAlign` (confirmed against the installed dist) only ever produces `"left"`,
 * `"center"`, `"right"`, or `null` — never `"justify"`, which makes little sense for a single cell's
 * content anyway. Re-checked here rather than trusted, same defense-in-depth reasoning every other
 * attrs-derived value in this file gets: `bodyJson` can be written by a direct API call, not only by
 * the editor UI that happens to constrain it client-side.
 */
function tableCellAlignAttr(node: JsonObject): string {
  const align = isObject(node.attrs) && typeof node.attrs.align === "string" ? node.attrs.align : null;
  return align === "left" || align === "center" || align === "right" ? styleForAlign(align) : "";
}

/**
 * `colspan`/`rowspan` HTML attributes for a `tableCell`/`tableHeader` node, each independently
 * bounds-checked and defaulted to `1` (both nodes' own `addAttributes` default, confirmed against
 * the installed dist) — omitted entirely when `1`, since `colspan="1"`/`rowspan="1"` is the HTML
 * default and writing it out is noise, matching this file's own "omit rather than emit a no-op"
 * convention ({@link styleForAlign}, {@link renderImageTag}'s width/height/class). The `<= 1000`
 * ceiling is a defensive bound, not a real table's expected shape — `bodyJson` is written by a
 * direct API call as easily as by the editor, and an unbounded `colspan` is a cheap way to force a
 * huge rendered table.
 */
/** Shared bounds check {@link tableSpanAttrs} applies independently to `colspan`/`rowspan` — pulled
 *  out so the compound condition is written (and complexity-counted) once instead of twice. */
function parseSpanAttr(value: JsonValue | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1000 ? value : 1;
}

function tableSpanAttrs(attrs: JsonObject): string {
  const colspan = parseSpanAttr(attrs.colspan);
  const rowspan = parseSpanAttr(attrs.rowspan);
  return `${colspan !== 1 ? ` colspan="${colspan}"` : ""}${rowspan !== 1 ? ` rowspan="${rowspan}"` : ""}`;
}

/**
 * Render-time recursion bound (worklist #5, TM-TOVU-2026-08-12-A request-cost audit) — same
 * "defensive bound, not a real document's expected shape" reasoning {@link tableSpanAttrs}'s own
 * doc already states for `colspan`/`rowspan`: `bodyJson` is written by a direct API call, an import,
 * a migration, or a plugin with table access exactly as easily as by the editor, and an unbounded
 * nesting chain is a cheap way to crash every concurrent visitor's request, not just the one that
 * asked for this page.
 *
 * Chosen empirically, not guessed. A binary search against a real `bulletList > listItem` chain (the
 * shape genuine repeated list-indentation produces, not an artificial doc) found the actual crash
 * boundary twice, from two different angles: calling `renderDocNode` directly, depth 500 renders in
 * ~2ms and depth 501 throws `RangeError: Maximum call stack size exceeded`; through a full real HTTP
 * request (more call stack already in use — Express, the route handler's own `await` chain,
 * `renderSite`), the boundary sits at depth 561/562, HIGHER than the isolated-call number, not lower
 * — plausibly because each `await` resumption in the request path runs as a fresh, shallower
 * continuation rather than accumulating stack the way nested synchronous calls do, though this isn't
 * independently confirmed. Both numbers are Node/V8/platform-specific and this repo's own commit
 * history is proof they move (`request-cost-traversal.measurement.test.ts`'s own runs varied depth
 * 500-vs-1000 across invocations before the binary search narrowed it down): a bound picked by
 * splitting the difference between two measurements taken on one laptop is not a bound, it is a
 * coin flip on whichever platform actually deploys this. `200` is roughly 40% of the LOWER (more
 * conservative) of the two measured boundaries — over 2.5x headroom below the worst observed crash
 * point — while still being far deeper than any plausible human-authored document: a nested list 200
 * `bulletList`/`listItem` pairs deep has no legitimate editorial reason to exist (ordinary nesting
 * rarely exceeds single digits).
 *
 * A node-count (breadth) bound was considered and deliberately deferred, not forgotten — see this
 * file's own commit history for the full reasoning: unlike depth, breadth doesn't crash (100,000
 * sibling paragraphs measured ~250-650ms, slow but survives), and the natural mitigation shape is a
 * different, more invasive design question (where to truncate a document that's too WIDE, and what a
 * partially-rendered page communicates to a reader, versus depth's clean "stop recursing, show a
 * placeholder for the over-deep branch, everything else renders exactly as authored").
 */
const MAX_RENDER_DEPTH = 200;

/** Emitted in place of any node whose ancestor chain exceeds {@link MAX_RENDER_DEPTH} — same
 *  labelled-placeholder convention {@link mediaPlaceholder} uses for a missing/unsafe asset, applied
 *  here for a structural reason instead. The document itself is never modified, only truncated at
 *  render time: everything above the bound still renders exactly as authored, and only the
 *  over-deep branch degrades. */
function depthLimitPlaceholder(): string {
  return `<div class="content-ph"><span class="content-ph__label">Content too deeply nested to render</span></div>`;
}

function renderNodes(
  nodes: JsonValue[] | undefined,
  inlineResolved: ReadonlyMap<string, WidgetRenderIR>,
  mediaTransformVersions: ReadonlyMap<string, number>,
  mediaAssetMetadata: ReadonlyMap<string, MediaAssetRenderMeta>,
  depth: number
): string {
  return (nodes ?? [])
    .map((node) => renderDocNode(node, inlineResolved, mediaTransformVersions, mediaAssetMetadata, depth))
    .join("");
}

/** Threaded-through render state every {@link renderDocNode} case handler needs — bundled into one
 *  object so each extracted handler (see {@link DOC_NODE_HANDLERS}) takes one params object instead
 *  of the same three maps plus `depth` repeated at every call site, the way the old single-`switch`
 *  body used to spell them out inline for every case. */
interface DocNodeRenderDeps {
  readonly inlineResolved: ReadonlyMap<string, WidgetRenderIR>;
  readonly mediaTransformVersions: ReadonlyMap<string, number>;
  readonly mediaAssetMetadata: ReadonlyMap<string, MediaAssetRenderMeta>;
  readonly depth: number;
}

/** Renders `content` one level deeper than the current node — every handler's own recursion entry
 *  point, replacing the `renderNodes(content, inlineResolved, mediaTransformVersions,
 *  mediaAssetMetadata, depth + 1)` call every case used to spell out individually. */
function renderChildNodes(content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  return renderNodes(content, deps.inlineResolved, deps.mediaTransformVersions, deps.mediaAssetMetadata, deps.depth + 1);
}

/** One handler per doc-node `type`, dispatched by {@link renderDocNode} through
 *  {@link DOC_NODE_HANDLERS} — see that table's own doc for why this file moved off a single large
 *  `switch`. */
type DocNodeHandler = (node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps) => string;

function renderDocDocNode(node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  // Dedupe at the doc boundary — see `dedupeHeadingIds` for why this is a pass over the finished
  // string rather than state threaded through the recursion.
  return dedupeHeadingIds(renderChildNodes(content, deps));
}

function renderDocParagraph(node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  return `<p${alignStyleAttr(node)}>${renderChildNodes(content, deps)}</p>`;
}

function renderDocHeading(node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  const level = isObject(node.attrs) && typeof node.attrs.level === "number" ? node.attrs.level : 2;
  const h = Math.min(Math.max(level, 1), 6);
  // Additive: an `id` changes nothing visually, and every heading rendered before this existed
  // simply had no anchor to link to. Emitted as the FIRST attribute, which `dedupeHeadingIds`
  // relies on. Omitted entirely when the text slugifies to nothing.
  const anchor = headingAnchorId(node);
  const idAttr = anchor === "" ? "" : ` id="${escapeHtml(anchor)}"`;
  return `<h${h}${idAttr}${alignStyleAttr(node)}>${renderChildNodes(content, deps)}</h${h}>`;
}

/**
 * Post-title-in-document feature (2026-08-11) — a dedicated first `doc` node an author can
 * center/style per post (`apps/admin/src/lib/post-title-extension.ts`). Renders empty in every
 * GENERIC doc walk: `entryContent`, `renderSlot("title")`, and `buildTemplateRenderData`'s
 * `post.content` already each print `post.title`/`ctx.post.title` (kept in sync with this
 * node — see `withTitleNode`/`titleNodeText`, `apps/admin/.../features/posts/rules.ts`) as
 * their OWN separate heading; letting this node ALSO emit its text here would duplicate the
 * title on every one of those render paths. `renderWidgetPostContent` is the one caller that
 * needs this node directly (for its alignment) and reads it via its own `extractTitleNode`,
 * bypassing this generic walk entirely for that one field.
 */
function renderDocTitle(): string {
  return "";
}

function renderDocText(node: JsonObject): string {
  return renderMarks(typeof node.text === "string" ? node.text : "", Array.isArray(node.marks) ? node.marks : undefined);
}

function renderDocBulletList(_node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  return `<ul>${renderChildNodes(content, deps)}</ul>`;
}
function renderDocOrderedList(_node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  return `<ol>${renderChildNodes(content, deps)}</ol>`;
}
function renderDocListItem(_node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  return `<li>${renderChildNodes(content, deps)}</li>`;
}

// Task list (`@tiptap/extension-list`'s `./task-list`/`./task-item` subpaths, 2026-08-11) — DOM
// shape confirmed against each installed extension's own `renderHTML`, not assumed:
// `<ul data-type="taskList">` wrapping `<li data-type="taskItem"><label><input
// type="checkbox">...</label><div>CONTENT</div></li>` (the `<label>`/`<span>` pair is the
// extension's own click-target styling hook, not something this renderer invents). `disabled`
// added here (the editor's own DOM has no such attribute — its checkbox is live, backed by a
// ProseMirror node-view click handler) because there is no equivalent handler on the public
// site: an unwired, clickable-looking checkbox would visually toggle on click and then silently
// do nothing, which is worse than a checkbox that's honestly inert. The editor's default
// `nested: false` (confirmed against the installed dist) means `content` here is a single
// paragraph, not a nested list — sub-tasks are out of scope until that option is turned on.
function renderDocTaskList(_node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  return `<ul data-type="taskList">${renderChildNodes(content, deps)}</ul>`;
}
function renderDocTaskItem(node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  const attrs = isObject(node.attrs) ? node.attrs : {};
  const checked = attrs.checked === true;
  return `<li data-type="taskItem"><label><input type="checkbox"${checked ? " checked" : ""} disabled/><span></span></label><div>${renderChildNodes(content, deps)}</div></li>`;
}

// Table (`@tiptap/extension-table`, 2026-08-11) — four node types confirmed against the
// installed dist: `table` (content `"tableRow+"`), `tableRow` (`<tr>`), `tableCell` (`<td>`),
// `tableHeader` (`<th>`). No `<colgroup>`/column-resize markup: the editor mounts `Table` with
// `resizable: false` (the extension's own default), so there is no column-width state to
// reproduce here — `.post-detail-body table` (styles.css) sizes columns with plain
// `table-layout: auto`, same as an ordinary unstyled HTML table. Disclosed scope limit, not an
// oversight: widening this to resizable columns would need `colwidth` threaded through both the
// editor config and this renderer's own `<colgroup>` emission, and nothing in this task asked
// for resizable tables specifically.
function renderDocTable(_node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  return `<table>${renderChildNodes(content, deps)}</table>`;
}
function renderDocTableRow(_node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  return `<tr>${renderChildNodes(content, deps)}</tr>`;
}
function renderDocTableCell(node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  const attrs = isObject(node.attrs) ? node.attrs : {};
  return `<td${tableSpanAttrs(attrs)}${tableCellAlignAttr(node)}>${renderChildNodes(content, deps)}</td>`;
}
function renderDocTableHeader(node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  const attrs = isObject(node.attrs) ? node.attrs : {};
  return `<th${tableSpanAttrs(attrs)}${tableCellAlignAttr(node)}>${renderChildNodes(content, deps)}</th>`;
}

function renderDocBlockquote(_node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  return `<blockquote>${renderChildNodes(content, deps)}</blockquote>`;
}

function renderDocCodeBlock(node: JsonObject, content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  // `attrs.language` (`@tiptap/extension-code-block-lowlight`, 2026-08-11) — see
  // `safeLanguageClass`'s own doc for why this stays a class token with no server-side
  // highlighting: the editor gets real in-browser highlighting (lowlight), this renderer stays
  // dependency-free, and a theme can opt into a client-side highlighter later without any change
  // here. Omitted entirely (bare `<code>`, exactly the prior behavior) when absent or unsafe.
  const attrs = isObject(node.attrs) ? node.attrs : {};
  const language = safeLanguageClass(attrs.language);
  const classAttr = language ? ` class="language-${escapeHtml(language)}"` : "";
  return `<pre><code${classAttr}>${renderChildNodes(content, deps)}</code></pre>`;
}

function renderDocHorizontalRule(): string {
  return "<hr/>";
}

// Leaf/atom node, `@tiptap/extension-hard-break` (Shift-Enter / Mod-Enter) — bundled by
// StarterKit v3.27, no toolbar button needed to reach it. Its own `renderHTML` emits a bare
// `["br", ...attrs]` with no content hole (verified against the installed dist), same
// childless-leaf shape `horizontalRule` above already renders self-closed. Before this case
// existed, an unrecognized `hardBreak` fell through to `default`'s `renderNodes(content, ...)`
// — since a leaf node's `content` is always `undefined`, that resolved to `""`: the line break
// silently vanished on the public site with no error and no visible difference in the editor.
function renderDocHardBreak(): string {
  return "<br/>";
}

/** The `assetId`/`transformName` pair a ref-shaped image node's `attrs` must carry, or `null` when
 *  either is absent or fails {@link isPlausibleMediaRefId}'s shape check — split out of
 *  {@link tryRenderRefImage} purely to keep that function's own branch count down; no behavior of
 *  its own beyond the two field reads plus the shape check. */
function resolveRefImageIds(attrs: JsonObject): { assetId: string; transformName: string } | null {
  const assetId = typeof attrs.assetId === "string" ? attrs.assetId : undefined;
  const transformName = typeof attrs.transformName === "string" ? attrs.transformName : undefined;
  if (!assetId || !transformName || !isPlausibleMediaRefId(assetId) || !isPlausibleMediaRefId(transformName)) return null;
  return { assetId, transformName };
}

/** `mediaAssetMetadata`'s per-asset overrides, normalized to {@link renderImageTag}'s `null`-means-
 *  "not set" contract — same reasoning as {@link resolveRefImageIds}: pulled out only to keep
 *  {@link tryRenderRefImage}'s own branch count (three `??` fallbacks plus three `?.` reads all
 *  count as separate branches under this repo's complexity gate) from being counted against it. */
function resolveMediaAssetOverrides(meta: MediaAssetRenderMeta | undefined): Pick<
  Parameters<typeof renderImageTag>[0],
  "width" | "height" | "cssClass" | "htmlAttributes"
> {
  return {
    width: meta?.width ?? null,
    height: meta?.height ?? null,
    cssClass: meta?.cssClass ?? null,
    htmlAttributes: meta?.htmlAttributes ?? null,
  };
}

/**
 * The `media` node's per-instance style precedence (2026-09-11, owner-directed: "you may have one
 * image being used across multiple things, and you wanna control the CSS in a post … just in that
 * post" — per-POST override on top of the asset-level default {@link resolveMediaAssetOverrides}
 * already resolves). One field at a time: the NODE's own value wins whenever it is set (non-null,
 * non-empty), the ASSET's value otherwise. Decided per field, not all-or-nothing, so a node that
 * overrides only `cssClass` still inherits the asset's own `htmlAttributes` (and always its
 * width/height — this task threads only `cssClass`/`htmlAttributes` onto the node, never size).
 *
 * "Empty means unset" here mirrors every other optional string field in this file rather than
 * inventing a new convention: {@link renderImageTag}'s own `props.cssClass ? … : ""` check and
 * {@link resolveEmbedHtmlAttributes}'s `!raw` guard both already treat `""` the same as `null`.
 *
 * @complexity O(1).
 */
function mediaNodeStyleOverride(nodeValue: string | null, assetValue: string | null): string | null {
  return nodeValue ? nodeValue : assetValue;
}

/**
 * Attempts the REF-node image path — `attrs.assetId`/`attrs.transformName` resolved against
 * `mediaTransformVersions`/`mediaAssetMetadata` (ADR-027 §4's frozen URL contract). Returns `null`
 * when the ref shape isn't present/plausible, or the transform name isn't yet resolvable, in which
 * case {@link renderDocImage} falls through to the LEGACY `src` path exactly as before this helper
 * was split out — see that function's own doc for the full two-shape contract this implements one
 * half of, and for why an unresolved ref degrades to a placeholder rather than a malformed URL.
 *
 * `nodeStyleOverride` (2026-09-11): optional per-node `cssClass`/`htmlAttributes`, layered over the
 * resolved asset's own same-named fields via {@link mediaNodeStyleOverride} — see that function's
 * doc for the full precedence rule. Only {@link renderDocMedia} (the `media` node) ever passes this;
 * {@link renderDocImage} (the legacy `image` node, out of scope for per-node styling) always omits
 * it, so `image` renders byte-identical to before this parameter existed.
 */
function tryRenderRefImage(
  attrs: JsonObject,
  alt: string,
  deps: DocNodeRenderDeps,
  nodeStyleOverride?: { cssClass: string | null; htmlAttributes: string | null }
): string | null {
  const ids = resolveRefImageIds(attrs);
  if (!ids) return null;
  const version = deps.mediaTransformVersions.get(ids.transformName);
  if (version === undefined) return null;
  const meta = deps.mediaAssetMetadata.get(ids.assetId);
  const assetOverrides = resolveMediaAssetOverrides(meta);
  const overrides = nodeStyleOverride
    ? {
        ...assetOverrides,
        cssClass: mediaNodeStyleOverride(nodeStyleOverride.cssClass, assetOverrides.cssClass),
        htmlAttributes: mediaNodeStyleOverride(nodeStyleOverride.htmlAttributes, assetOverrides.htmlAttributes),
      }
    : assetOverrides;
  const urlKey = mediaUrlKey({ id: ids.assetId, slug: meta?.slug ?? null });
  return renderImageTag({ urlKey, transformName: ids.transformName, version, alt, ...overrides });
}

/**
 * D7 (original), extended under ADR-027 §4 and this task's quick-and-dirty sizing fix: a
 * TipTap image node reaches this renderer in one of two shapes. LEGACY nodes carry only
 * `attrs.src`/`attrs.title` — some combination of an inlined `data:` blob, an arbitrary
 * external URL, or the *authenticated* admin media-preview URL, none of which are safe or
 * correct to embed unescaped on public, unauthenticated HTML. Those keep degrading to the
 * same aspect-ratio placeholder (`mediaPlaceholder`) exactly as before this task —
 * `src`/`title` are still never read here at all, which is precisely the property that made
 * the original D7 fix safe and must not regress: a real running server was verified live (see
 * `media/bootstrap.ts`'s file header) to have posts whose only image `src` values are exactly
 * these unsafe kinds, so silently starting to trust `src` would be a public security
 * regression, not a fix.
 *
 * REF nodes (new, ADR-027 §4's own stated `bodyJson` contract: "stores refs
 * `{assetId, transformName}`, never URLs") carry `attrs.assetId`/`attrs.transformName`
 * instead, resolved by {@link tryRenderRefImage} — only THIS shape ever produces a real
 * `<img src>`. width/height/class (this task): looked up from `mediaAssetMetadata` by
 * `assetId` ALONE (never gated on whether the src itself resolved to a placeholder-vs-real
 * image — an unresolved ref already returns `null` from {@link tryRenderRefImage}, so this
 * lookup only ever runs once a real `<img src>` is about to be emitted). Each attribute is
 * emitted independently and only when its value is non-null — an asset with only `width` set
 * gets `width="…"` alone, never a `height="0"` or empty `class=""`. Owner's explicit
 * instruction: width/height are BOTH optional; leaving either (or both) unset renders at
 * native size, never a computed/defaulted value.
 */
function renderDocImage(node: JsonObject, _content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  const attrs = isObject(node.attrs) ? node.attrs : {};
  const alt = typeof attrs.alt === "string" ? attrs.alt : "";
  const refImage = tryRenderRefImage(attrs, alt, deps);
  if (refImage) return refImage;
  // LEGACY `src`-only node (the toolbar's "Img by URL", and anything authored before refs
  // existed). Historically this fell straight through to the placeholder — `src` was never read
  // at all. The owner reversed that on 2026-08-12: refusing every `src` is a blunt instrument,
  // and this file already had the right shape for the problem in {@link safeHref}, which does
  // not refuse link hrefs but validates their scheme. {@link safeImageSrc} is that same
  // discipline for an image URL: an allowlist, not a ban. Anything it rejects still degrades to
  // the identical placeholder below, so invariant I2 (never silently empty) is unchanged.
  const legacySrc = safeImageSrc(attrs.src);
  if (legacySrc) return `<img src="${escapeHtml(legacySrc)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
  return mediaPlaceholder({ label: alt || "Image" });
}

/**
 * The generic `media` doc node (2026-09-11 — owner-directed: don't add a `video` node beside
 * `image`, add ONE node and dispatch on the asset's real content type, so the next kind (audio, …)
 * costs one more branch instead of one more node type/schema entry/renderer everywhere again).
 *
 * Same ref-only contract `image`'s REF shape already established (ADR-027 §4): `attrs.assetId` plus
 * `attrs.transformName` locked to `CORE_PUBLIC_TRANSFORM_NAME` by both the published agent schema
 * (`TIPTAP_DOC_SCHEMA`, `features/post/agent-tools.ts`) and the admin editor's own insert command —
 * there is no `attrs.src` shape here at all, unlike `image`'s LEGACY fallback: `media` is new as of
 * this task, so there is no pre-existing content authored with a raw URL that back-compat has to
 * keep rendering.
 *
 * Dispatches on `deps.mediaAssetMetadata.get(assetId)?.contentType` (see that field's own doc for
 * exactly where it comes from and its one disclosed gap): a `video/*` type renders a real `<video>`
 * via {@link renderVideoTag}. Anything else — a real image type, an unrecognized type, an asset
 * absent from `mediaAssetMetadata` entirely (`meta` is `undefined`, which reads as "not video" the
 * same as a `null`/non-video `contentType` would), or (today) an audio type with no player to
 * dispatch to — falls through to {@link tryRenderRefImage}, the EXACT resolution `image` itself
 * uses, so a real image asset referenced through this node renders byte-identical to referencing it
 * through `image`. {@link tryRenderRefImage} already returns `null` for anything it can't resolve
 * (unregistered transform, implausible id shape, …), so an unresolvable `media` node degrades to the
 * same placeholder `image` degrades to — never a crash, never silence.
 *
 * AUDIO (deliberately not wired): no `renderAudioTag` exists and there is no `audio/*` branch here
 * — the server upload MIME allowlist (`@jini-ai/cms/media`'s `media-service.ts`,
 * `DEFAULT_ALLOWED_MIME_TYPES`) has no audio type at all today, so no real audio asset can exist to
 * dispatch to; adding a fake branch for a type nothing can ever upload would be exactly the
 * pretend-support this task was told not to build. Adding real audio support later needs, in order:
 * an allowlisted upload MIME type, a `renderAudioTag` sibling to {@link renderImageTag}/
 * {@link renderVideoTag} (an `<audio controls src=…>` tag is the obvious shape — `<audio>` has no
 * width/height/alt of its own the way `<img>`/`<video>` do), and one more
 * `startsWith("audio/")` branch below — no new node type and no schema change beyond this one
 * `media` entry, which is the entire point of dispatching on content type instead of adding a third
 * node.
 *
 * PER-NODE STYLE OVERRIDES (2026-09-11): `attrs.cssClass`/`attrs.htmlAttributes` — same two field
 * names and same raw-text storage format as `MediaRecord`'s asset-level fields, added to the node
 * itself so one asset used across several posts can be styled differently per post. Precedence is
 * PER FIELD via {@link mediaNodeStyleOverride}: the node's own value wins whenever it is set
 * (non-null, non-empty), the resolved asset's value otherwise — applied identically on both dispatch
 * branches below (video and image), so an operator does not have to learn two different override
 * rules depending on what the asset turns out to be. `htmlAttributes` re-validation is NOT
 * duplicated here: both {@link renderVideoTag} and {@link tryRenderRefImage} (via
 * {@link renderImageTag}) already re-parse whatever string reaches them through
 * `resolveEmbedHtmlAttributes`'s shared embed allowlist and drop just the bad token on anything
 * disallowed, so a node-authored value gets the exact same security boundary an asset-authored value
 * already had, with no new parser and no second copy of the allowlist.
 */
function renderDocMedia(node: JsonObject, _content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  const attrs = isObject(node.attrs) ? node.attrs : {};
  const alt = typeof attrs.alt === "string" ? attrs.alt : "";
  const assetId = typeof attrs.assetId === "string" && isPlausibleMediaRefId(attrs.assetId) ? attrs.assetId : undefined;
  if (!assetId) return mediaPlaceholder({ label: alt || "Media" });

  const nodeCssClass = typeof attrs.cssClass === "string" ? attrs.cssClass : null;
  const nodeHtmlAttributes = typeof attrs.htmlAttributes === "string" ? attrs.htmlAttributes : null;

  const meta = deps.mediaAssetMetadata.get(assetId);
  if (meta?.contentType?.startsWith("video/")) {
    return renderVideoTag({
      urlKey: mediaUrlKey({ id: assetId, slug: meta.slug }),
      alt,
      width: meta.width,
      height: meta.height,
      cssClass: mediaNodeStyleOverride(nodeCssClass, meta.cssClass),
      htmlAttributes: mediaNodeStyleOverride(nodeHtmlAttributes, meta.htmlAttributes),
    });
  }

  const refImage = tryRenderRefImage(attrs, alt, deps, { cssClass: nodeCssClass, htmlAttributes: nodeHtmlAttributes });
  return refImage ?? mediaPlaceholder({ label: alt || "Media" });
}

function renderDocYoutube(node: JsonObject): string {
  // See `extractYoutubeVideoId`'s own doc for why `attrs.src` is re-derived rather than
  // trusted. `start` (seconds into the video) is the only other attr this renders — `width`/
  // `height` are deliberately ignored: `.post-detail-body .youtube-embed` (styles.css) makes
  // every embed a responsive 16:9 box instead, which is both simpler than validating two more
  // numeric attrs and better UX than reproducing the editor's fixed-pixel default on a public
  // page that also has to work on a phone. `youtube-nocookie.com` (privacy-enhanced mode) is
  // used unconditionally rather than reading `nocookie` off attrs — a deliberate simplification,
  // not something the toolbar's own plain "paste a URL" control offers a way to opt out of.
  const attrs = isObject(node.attrs) ? node.attrs : {};
  const videoId = extractYoutubeVideoId(attrs.src);
  if (!videoId) return mediaPlaceholder({ label: "Video unavailable", ratio: "16 / 9" });
  const start = typeof attrs.start === "number" && Number.isInteger(attrs.start) && attrs.start > 0 && attrs.start <= 999999 ? attrs.start : 0;
  const embedSrc = `https://www.youtube-nocookie.com/embed/${videoId}${start > 0 ? `?start=${start}` : ""}`;
  return `<div class="youtube-embed"><iframe src="${escapeHtml(embedSrc)}" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
}

function renderDocMention(node: JsonObject): string {
  // Mention (`@tiptap/extension-mention`, toolbar-polish pass 2026-08-11) — the toolbar's
  // "Mention a post" picker (`PostEditor.tsx`) inserts `{ id: <mentioned post's slug>, label:
  // <its title> }` (see `rules.ts`'s own comment, which already documents this case's contract
  // before this case existed). Before this case existed, the node fell through to `default`'s
  // `renderNodes(content, ...)`: `mention` is an atom/leaf node (`atom: true`, no content hole
  // — confirmed against the installed `@tiptap/extension-mention` dist), so `content` is always
  // `undefined` and that resolved to `""` — the whole mention silently vanished on the public
  // site with no error, same shape as the historical `textAlign`/`underline`/`strike`/
  // `hardBreak` bugs this file's own header warns about.
  //
  // `id` is re-validated against the SAME `SLUG_FORMAT_PATTERN`/`MAX_SLUG_LENGTH` the post
  // feature itself enforces at write time (`#src/features/post/index`) before it is trusted
  // into an `href` — defense-in-depth against `bodyJson` written some OTHER way (a direct API
  // call, pasted content), the same reasoning `safeCssColor`/`safeCssFontFamily`/
  // `safeCssLength` already state for their own allowlists above. Anything that fails
  // validation, or has no `label`, renders nothing rather than a dead or malformed link — never
  // a raw, unescaped attribute dump.
  //
  // Link text is `"@" + label`, matching the editor's own default `renderText`
  // (`${suggestion?.char ?? '@'}${node.attrs.label ?? node.attrs.id}`) so the public page shows
  // the identical text an author saw while writing, not a divergent public-only presentation.
  const attrs = isObject(node.attrs) ? node.attrs : {};
  const id = typeof attrs.id === "string" ? attrs.id : "";
  const label = typeof attrs.label === "string" ? attrs.label : "";
  if (id.length === 0 || id.length > MAX_SLUG_LENGTH || !SLUG_FORMAT_PATTERN.test(id) || label.length === 0) {
    return "";
  }
  return `<a class="post-mention" href="/${escapeHtml(id)}">@${escapeHtml(label)}</a>`;
}

/**
 * Renders a `widgetEmbed` node — REQ-18/REQ-21 (see inline comment below) — through the resolved
 * widget IR, optionally wrapped in a `<div class="widget-embed …">` carrying the node's own
 * `attrs.cssClass`/`attrs.htmlAttributes` (D5, 2026-09-23 embed-attributes-everywhere plan), the
 * SAME two per-node style fields {@link renderDocMedia} already supports. A bare node (neither
 * field set, the common case today) renders BYTE-IDENTICAL to before this task — no wrapper at
 * all — so every existing page keeps its exact output.
 *
 * `htmlAttributes` reuses the exact shared allowlist boundary ({@link resolveEmbedHtmlAttributes}) —
 * no extra restriction beyond it (S1, 2026-09-23 widget-attrs plan removed the old data-/aria- prefix
 * -only narrowing this wrapper used to apply on top: the base allowlist itself now covers `style`/`id`/
 * `class`/etc., so a second, narrower filter here would only take away what the owner asked to keep
 * for widget styling/animation). A rejected token (an `on*` handler, an unsafe URL/style value, a
 * disallowed name) is dropped ON ITS OWN — every other token in the same string still lands — except
 * `malformed` syntax, which still empties the whole map (see `html-attributes.ts`'s own header).
 * `htmlAttributes`' own `class` token, if present, is appended after `cssClass` rather than emitted
 * as a second `class` attribute — the same fold {@link renderImageTag}/{@link renderVideoTag} apply
 * via {@link foldHtmlAttributesClass}, just built from `cssClass` directly here since a widget node
 * has no separate marker-class source to layer under it.
 *
 * @complexity O(n) in `attrs.htmlAttributes`'s length (one allowlist parse), O(k) in its resulting
 * attribute count for the class fold and formatting.
 */
function renderDocWidgetEmbed(node: JsonObject, _content: JsonValue[] | undefined, deps: DocNodeRenderDeps): string {
  // REQ-18/REQ-21: a block-level atom node carrying a single widget-instance reference,
  // resolved server-side (by `resolvePageWidgets`, threaded in via `inlineResolved`) before this
  // content ever reaches a theme — the theme (declarative tier here, Liquid tier via
  // `liquid-worker.ts`'s `buildLiquidData` pre-computing `post.content`) never resolves a
  // `widgetEmbed` reference itself.
  const attrs = isObject(node.attrs) ? node.attrs : {};
  const placementId = typeof attrs.placementId === "string" ? attrs.placementId : undefined;
  const ir = placementId ? deps.inlineResolved.get(placementId) : undefined;
  const widgetHtml = renderWidgetIr(ir ?? WIDGET_PLACEHOLDER_IR);

  const nodeCssClass = typeof attrs.cssClass === "string" && attrs.cssClass ? attrs.cssClass : null;
  const nodeHtmlAttributes = typeof attrs.htmlAttributes === "string" && attrs.htmlAttributes ? attrs.htmlAttributes : null;
  if (!nodeCssClass && !nodeHtmlAttributes) return widgetHtml;

  const parsedAttributes = resolveEmbedHtmlAttributes(nodeHtmlAttributes);
  const classAttr = mergeWidgetClassAttr(nodeCssClass, parsedAttributes.class);
  const restAttributes = formatHtmlAttributes(omitKey(parsedAttributes, "class"));
  return `<div${classAttr}${restAttributes}>${widgetHtml}</div>`;
}

/**
 * Builds the widget wrapper's `class` attribute from the fixed `widget-embed` base plus the node's
 * own `cssClass` and, appended last, any `class` token inside its parsed `htmlAttributes` — the
 * SAME ordering {@link foldHtmlAttributesClass} applies for media (base/asset value first,
 * `htmlAttributes`' own `class` layered on top last). Always non-empty (the `widget-embed` base is
 * unconditional), unlike {@link mergeMediaClassAttr}, which returns `""` when there is nothing at
 * all to add.
 *
 * @param nodeCssClass - `attrs.cssClass`, already checked non-empty by the caller, or `null`.
 * @param attributesClass - `resolveEmbedHtmlAttributes(...).class`, already allowlist-validated,
 *   value-untouched — `undefined` when `htmlAttributes` carried no `class` token.
 * @complexity O(1).
 */
function mergeWidgetClassAttr(nodeCssClass: string | null, attributesClass: string | undefined): string {
  const parts = ["widget-embed", nodeCssClass, attributesClass].filter((part): part is string => Boolean(part));
  return ` class="${escapeHtml(parts.join(" "))}"`;
}

/** {@link renderDocNode}'s own `content` extraction, pulled out so the ternary is counted once here
 *  instead of against the dispatcher's own already-tight budget (four optional params already cost
 *  one point each under this repo's complexity gate). */
function docNodeContent(node: JsonObject): JsonValue[] | undefined {
  return Array.isArray(node.content) ? node.content : undefined;
}

/** {@link renderDocNode}'s own handler lookup, pulled out for the same reason as
 *  {@link docNodeContent} just above. */
function resolveDocNodeHandler(node: JsonObject): DocNodeHandler | undefined {
  return typeof node.type === "string" ? DOC_NODE_HANDLERS[node.type] : undefined;
}

/** One handler per doc-node `type` — a lookup instead of the large `switch` this file used to
 *  dispatch on, so the number of node kinds stops being what drives {@link renderDocNode}'s own
 *  complexity (every `case` in a `switch` counts as a branch; an entry in this table does not,
 *  since it's data, not control flow). A `type` with no entry (any node kind this renderer doesn't
 *  recognize) falls through to `renderDocNode`'s own default: render children, exactly the old
 *  `switch`'s `default` case. */
/**
 * Exported (2026-09-11) for the identical reason {@link MARK_RENDERERS} now is — a drift guard in
 * `features/post/agent-tools.ts`'s own test suite reads these keys directly so a node type added
 * here again cannot silently go undocumented in the schema published to the model. Still read only
 * by {@link renderDocNode} inside this module; no dispatch behavior changes.
 */
export const DOC_NODE_HANDLERS: Record<string, DocNodeHandler> = {
  doc: renderDocDocNode,
  paragraph: renderDocParagraph,
  heading: renderDocHeading,
  title: renderDocTitle,
  text: renderDocText,
  bulletList: renderDocBulletList,
  orderedList: renderDocOrderedList,
  listItem: renderDocListItem,
  taskList: renderDocTaskList,
  taskItem: renderDocTaskItem,
  table: renderDocTable,
  tableRow: renderDocTableRow,
  tableCell: renderDocTableCell,
  tableHeader: renderDocTableHeader,
  blockquote: renderDocBlockquote,
  codeBlock: renderDocCodeBlock,
  horizontalRule: renderDocHorizontalRule,
  hardBreak: renderDocHardBreak,
  image: renderDocImage,
  media: renderDocMedia,
  youtube: renderDocYoutube,
  mention: renderDocMention,
  widgetEmbed: renderDocWidgetEmbed,
};

/**
 * Renders a TipTap/ProseMirror-style doc node to HTML. Unknown nodes render children.
 *
 * `inlineResolved` (SPEC-043/ADR-047 REQ-21) is optional and defaults to empty — every pre-existing
 * caller (this file's `entryContent`, `liquid-worker.ts`'s `buildLiquidData`, and every direct test
 * call) keeps working unchanged; a `widgetEmbed` node with no matching entry in the map (embeds are
 * only resolvable when the caller threads a real `resolvePageWidgets` result through, see
 * `renderSite`) degrades to the same public-safe placeholder REQ-28 requires, never a crash or a raw
 * dump of the node's attrs.
 *
 * `mediaTransformVersions` (ADR-027 §4) is the same "optional, defaults to empty, degrades to the
 * placeholder" shape for the `image` case's `{assetId, transformName}` ref path — see that case's
 * own comment for the full resolution rule and the legacy-`src` backward-compat guarantee.
 *
 * `mediaAssetMetadata` (owner-directed quick-and-dirty sizing fix) is the same optional/defaults-
 * to-empty shape, keyed by `assetId` instead of `transformName` — see
 * `SiteRenderContext.mediaAssetMetadata`'s own doc.
 */
export function renderDocNode(
  node: JsonValue,
  inlineResolved: ReadonlyMap<string, WidgetRenderIR> = EMPTY_INLINE_RESOLVED,
  mediaTransformVersions: ReadonlyMap<string, number> = EMPTY_MEDIA_TRANSFORM_VERSIONS,
  mediaAssetMetadata: ReadonlyMap<string, MediaAssetRenderMeta> = EMPTY_MEDIA_ASSET_METADATA,
  /** Ancestor count above this node — the doc root is `0`. Every pre-existing caller (this file's
   *  `entryContent`, `liquid-worker.ts`'s `buildLiquidData`, every direct test call) keeps working
   *  unchanged via this default; only {@link renderNodes}'s own recursive calls ever pass a non-zero
   *  value. See {@link MAX_RENDER_DEPTH}'s own doc for why this exists and how the number was
   *  chosen. */
  depth = 0
): string {
  if (!isObject(node)) return "";
  // Checked before anything else — an over-deep node does no further work at all, which is what
  // actually stops the recursion (a `depthLimitPlaceholder()` return has no `content` to walk).
  if (depth > MAX_RENDER_DEPTH) return depthLimitPlaceholder();
  const content = docNodeContent(node);
  const deps: DocNodeRenderDeps = { inlineResolved, mediaTransformVersions, mediaAssetMetadata, depth };
  const handler = resolveDocNodeHandler(node);
  return handler ? handler(node, content, deps) : renderChildNodes(content, deps);
}

// ---------------------------------------------------------------------------
// Core component registry (v1) — the safe building blocks a theme references.
// A theme can arrange these by id; it cannot define new ones. This table has no schema,
// capability tier, or isolation boundary (each `Component` runs synchronously, in-render, with
// no timeout), so it stays closed to plugins. A future plugin-contributed component goes through
// the widget-type registry instead (`WidgetTypeKey`/`CORE_RESOLVERS`, `src/widgets/registry.ts`),
// which already has schema validation, tier gating, and a try/catch+timeout isolation boundary —
// see the Widget IR rendering block below for that seam's own dispatch (ADR-047; ratified by
// `ADS-memory/reports/architecture/2026-08-20-component-catalog-split-proposal.md`).
// ---------------------------------------------------------------------------

type Component = (ctx: SiteRenderContext, props: JsonObject) => string;

function siteHeader(ctx: SiteRenderContext, props: JsonObject): string {
  const compact = props.compact === true;
  const tagline = !compact && typeof props.tagline === "string"
    ? `<p class="tagline">${escapeHtml(props.tagline)}</p>`
    : "";
  // No admin link: under no-theme this header is the site's primary, public-facing output — every
  // visitor sees it — so advertising the admin panel's URL here would hand it to anyone who looks.
  // An operator who deliberately turned the theme off already knows where their own admin lives.
  return `<header class="site-header"><div class="wrap"><a class="wordmark" href="/">${escapeHtml(ctx.siteTitle)}</a>${tagline}<nav class="site-nav"><a href="/">Home</a></nav></div></header>`;
}

function entryList(ctx: SiteRenderContext, props: JsonObject): string {
  const layout = typeof props.layout === "string" ? props.layout : "index";
  const items = ctx.posts
    .map((post, i) => {
      const folio = String(i + 1).padStart(2, "0");
      return `<li class="entry"><a class="entry-link" href="/${escapeHtml(post.slug)}"><span class="entry-index">№ ${folio}</span><h2 class="entry-title">${escapeHtml(post.title)}</h2><p class="entry-meta">${escapeHtml(shortDate(post.updatedAt))}</p></a></li>`;
    })
    .join("");
  const body = items || `<li class="entry entry--empty"><p>No published posts yet.</p></li>`;
  return `<section class="entry-list entry-list--${escapeHtml(layout)}"><div class="wrap"><ol class="entries">${body}</ol></div></section>`;
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
      const price = escapeHtml(formatCents(product.price));
      // `|| product.id`: defensive, not the normal path — every real `SiteProduct` source
      // (`storefront.ts`'s `toSiteProduct`, `store-plugin.ts`'s `listProducts`) always sets a real
      // `slug`. Falls back rather than crashing `escapeHtml` on a caller/test double built against
      // an older, slug-less `SiteProduct` shape.
      return `<li class="entry"><a class="entry-link" href="/products/${escapeHtml(product.slug || product.id)}"><span class="entry-index">№ ${folio}</span><h2 class="entry-title">${escapeHtml(product.title)}</h2><p class="entry-meta">${price}</p></a></li>`;
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
  const price = escapeHtml(formatCents(ctx.product.price));
  return `<div class="wrap"><a class="back" href="/products">← ${escapeHtml(ctx.siteTitle)}</a><article class="entry"><h1 class="entry-title">${escapeHtml(ctx.product.title)}</h1><p class="entry-meta">${price}</p></article></div>`;
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
 * NOR `slug` (missing or invalid keys) all degrade identically to the public-safe REQ-28 marker —
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
 * @complexity O(n) over `html`'s length (one substitution pass); O(1) additional work per marker (an
 * ownership check plus two map lookups plus `renderWidgetIr`'s own O(1) dispatch).
 * @overallScore 100
 *
 * Exported for `pages.ts`'s post-template render path (post-template-picker feature, 2026-08-10) —
 * a chosen `blog-post.html` template's `{"type":"post"}` slot substitutes through this exact same
 * function, not a second implementation; the only difference from an `"html"`-format Page is WHERE
 * the html/resolved pair comes from (a theme's `pages/*.html` plus a real-id substitution, not
 * `post.bodyHtml`).
 */
export function renderHtmlPageBody(html: string, resolved: ResolveHtmlPageEmbedsResult | undefined): string {
  return substituteHtmlEmbeds(html, (ref, occurrence) => {
    if (!isPageEmbedType(ref.type)) return undefined;
    // D4 guard (2026-09-23): a "content"/"post" marker naming neither an id nor a slug has no
    // current entity to resolve against at all — e.g. the static theme's own `index.html`, whose
    // `{"type":"content","header":false}` marker names no id because D2's `finishStaticTierDocument`
    // runs this stage over assembled HTML, not a per-entity render. Leave it exactly as authored
    // (return `undefined`, `substituteMarkers`' own "leave as written" contract) instead of
    // degrading to the REQ-28 placeholder, which is the right answer only when an id/slug WAS
    // named but failed to resolve.
    if ((ref.type === "content" || ref.type === "post") && ref.id === null && ref.slug === null) return undefined;
    const lookupKey = ref.id ?? ref.slug;
    const ir = (lookupKey !== null ? resolved?.get(ref.type)?.get(lookupKey) : undefined) ?? HTML_EMBED_PLACEHOLDER_IR;
    return renderWidgetIr(withOccurrenceMediaAttributes(withOccurrenceHeader(ir, ref), ref, occurrence));
  });
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
function withOccurrenceMediaAttributes(ir: WidgetRenderIR, ref: PageHtmlEmbedRef, occurrence: EmbedOccurrence): WidgetRenderIR {
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
 * `termRef` route target to `null` (`platform/routing/types.ts`'s own `TermRefTarget` doc — "NOT
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
      const items = termNames.map((name) => `<span class="entry-terms__term">${escapeHtml(name)}</span>`).join(", ");
      return `<span class="entry-terms__group"><span class="entry-terms__taxonomy">${escapeHtml(taxonomyName)}:</span> ${items}</span>`;
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
function renderPostBody(ctx: SiteRenderContext): string {
  const post = ctx.post;
  if (!post) return "";
  const body =
    post.bodyFormat === "html"
      ? renderHtmlPageBody(post.bodyHtml ?? "", ctx.pageHtmlEmbeds)
      : renderDocNode(post.bodyJson, ctx.widgetInlineResolved, ctx.mediaTransformVersions, ctx.mediaAssetMetadata);
  return body + renderAssignedTermsBlock(ctx.assignedTerms);
}

function entryContent(ctx: SiteRenderContext): string {
  if (!ctx.post) return "";
  return `<div class="wrap"><a class="back" href="/">← ${escapeHtml(ctx.siteTitle)}</a><article class="entry"><h1 class="entry-title">${escapeHtml(ctx.post.title)}</h1><p class="entry-meta">${escapeHtml(shortDate(ctx.post.updatedAt))}</p><div class="prose">${renderPostBody(ctx)}</div></article></div>`;
}

/**
 * The footer's "theme: <name>" badge, or nothing at all when the operator turned the theme off.
 *
 * Shared by BOTH footers deliberately. `siteFooter` and `richSiteFooter` each carried their own
 * copy of this span, so suppressing the badge in only the one that is easy to find would have left
 * a themeless site emitting `<span class="theme-badge">theme: </span>` — an empty badge — from the
 * other. One helper makes "both footers agree" structural instead of a thing two edits have to
 * preserve.
 */
function themeBadge(ctx: SiteRenderContext): string {
  if (ctx.themeName === null) return "";
  return `<span class="theme-badge">theme: ${escapeHtml(ctx.themeName)}</span>`;
}

function siteFooter(ctx: SiteRenderContext): string {
  return `<footer class="site-footer"><div class="wrap"><span>${escapeHtml(ctx.siteTitle)} — powered by Tovu</span>${themeBadge(ctx)}</div></footer>`;
}

// --- Prop readers (templates are untrusted-ish data — read defensively) ---

function str(value: JsonValue | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function arr(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}
function obj(value: JsonValue | undefined): JsonObject | undefined {
  return isObject(value) ? value : undefined;
}

/** A labelled aspect-ratio box standing in for an image (no asset pipeline yet). */
function mediaPlaceholder(props: JsonObject): string {
  const label = escapeHtml(str(props.label, "Image"));
  const ratio = escapeHtml(str(props.ratio, "16 / 9"));
  return `<figure class="media-ph" style="aspect-ratio:${ratio}"><span class="media-ph__label">${label}</span></figure>`;
}

function actionsHtml(actions: JsonValue[]): string {
  const links = actions
    .map((a, i) => {
      const o = obj(a);
      if (!o) return "";
      const kind = i === 0 ? "btn btn--primary" : "btn btn--ghost";
      return `<a class="${kind}" href="${escapeHtml(safeHref(o.href))}">${escapeHtml(str(o.label, "Learn more"))}</a>`;
    })
    .join("");
  return links ? `<div class="actions">${links}</div>` : "";
}

/** Landing hero: optional badge/eyebrow, title, subtitle, actions, optional media. */
function hero(_ctx: SiteRenderContext, props: JsonObject): string {
  const badge = str(props.badge) ? `<span class="hero__badge">${escapeHtml(str(props.badge))}</span>` : "";
  const eyebrow = str(props.eyebrow) ? `<p class="eyebrow">${escapeHtml(str(props.eyebrow))}</p>` : "";
  const subtitle = str(props.subtitle) ? `<p class="hero__sub">${escapeHtml(str(props.subtitle))}</p>` : "";
  const media = obj(props.media) ? `<div class="hero__media">${mediaPlaceholder(obj(props.media)!)}</div>` : "";
  return `<section class="hero"><div class="wrap hero__inner"><div class="hero__text">${badge}${eyebrow}<h1 class="hero__title">${escapeHtml(str(props.title))}</h1>${subtitle}${actionsHtml(arr(props.actions))}</div>${media}</div></section>`;
}

/** Thin promo strip above the nav. */
function announcement(_ctx: SiteRenderContext, props: JsonObject): string {
  const text = escapeHtml(str(props.text));
  if (!text) return "";
  const link = obj(props.link);
  const linkHtml = link
    ? ` <a class="topbar__link" href="${escapeHtml(safeHref(link.href))}">${escapeHtml(str(link.label, "Learn more"))} →</a>`
    : "";
  return `<div class="topbar"><div class="wrap"><p class="topbar__text">${text}${linkHtml}</p></div></div>`;
}

/** Sticky nav bar with CSS-only hover dropdowns + a checkbox-driven mobile drawer (no JS). */
function siteNav(ctx: SiteRenderContext, props: JsonObject): string {
  const brand = escapeHtml(str(props.brand) || ctx.siteTitle);
  const caret = '<svg class="caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const items = arr(props.items)
    .map((it) => {
      const o = obj(it);
      if (!o) return "";
      const label = escapeHtml(str(o.label));
      const href = escapeHtml(safeHref(o.href));
      const children = arr(o.children);
      if (children.length) {
        const sub = children
          .map((c) => {
            const co = obj(c);
            if (!co) return "";
            return `<li><a href="${escapeHtml(safeHref(co.href))}">${escapeHtml(str(co.label))}</a></li>`;
          })
          .join("");
        return `<li class="nav-item has-children"><a class="nav-link" href="${href}">${label}${caret}</a><ul class="nav-dropdown">${sub}</ul></li>`;
      }
      return `<li class="nav-item"><a class="nav-link" href="${href}">${label}</a></li>`;
    })
    .join("");
  const cta = obj(props.cta);
  const ctaHtml = cta
    ? `<a class="btn btn--primary nav-cta" href="${escapeHtml(safeHref(cta.href))}">${escapeHtml(str(cta.label, "Get started"))}</a>`
    : "";
  return `<header class="site-header"><div class="wrap nav"><a class="brand" href="/">${brand}</a><input type="checkbox" id="nav-toggle" class="nav-toggle" aria-label="Toggle menu"/><label for="nav-toggle" class="nav-burger"><span></span><span></span><span></span></label><nav class="nav-menu"><ul class="nav-list">${items}</ul>${ctaHtml}</nav></div></header>`;
}

/** Full-width final call-to-action band. */
function ctaBand(_ctx: SiteRenderContext, props: JsonObject): string {
  const eyebrow = str(props.eyebrow) ? `<p class="eyebrow eyebrow--on-dark">${escapeHtml(str(props.eyebrow))}</p>` : "";
  const subtitle = str(props.subtitle) ? `<p class="cta__sub">${escapeHtml(str(props.subtitle))}</p>` : "";
  return `<section class="cta"><div class="wrap"><div class="cta__inner">${eyebrow}<h2 class="cta__title">${escapeHtml(str(props.title))}</h2>${subtitle}${actionsHtml(arr(props.actions))}</div></div></section>`;
}

/** Multi-column footer: brand blurb + socials, link columns, legal row. */
function siteFooterRich(ctx: SiteRenderContext, props: JsonObject): string {
  const brand = escapeHtml(str(props.brand) || ctx.siteTitle);
  const blurb = str(props.blurb) ? `<p class="footer__blurb">${escapeHtml(str(props.blurb))}</p>` : "";
  const socials = arr(props.social)
    .map((s) => {
      const o = obj(s);
      if (!o) return "";
      return `<a class="footer__social" href="${escapeHtml(safeHref(o.href))}">${escapeHtml(str(o.label))}</a>`;
    })
    .join("");
  const cols = arr(props.columns)
    .map((c) => {
      const o = obj(c);
      if (!o) return "";
      const links = arr(o.links)
        .map((l) => {
          const lo = obj(l);
          if (!lo) return "";
          return `<li><a href="${escapeHtml(safeHref(lo.href))}">${escapeHtml(str(lo.label))}</a></li>`;
        })
        .join("");
      return `<div class="footer__col"><h4>${escapeHtml(str(o.title))}</h4><ul>${links}</ul></div>`;
    })
    .join("");
  const legal = escapeHtml(str(props.legal) || `© ${new Date().getFullYear()} ${str(props.brand) || ctx.siteTitle}`);
  return `<footer class="site-footer site-footer--rich"><div class="wrap footer__top"><div class="footer__brandcol"><a class="brand" href="/">${brand}</a>${blurb}<div class="footer__socials">${socials}</div></div><div class="footer__cols">${cols}</div></div><div class="wrap footer__bottom"><span>${legal}</span>${themeBadge(ctx)}</div></footer>`;
}

function paragraphsHtml(items: JsonValue[]): string {
  return items.map((p) => `<p>${escapeHtml(str(p))}</p>`).join("");
}
function bulletsHtml(items: JsonValue[]): string {
  const lis = items.map((b) => `<li>${escapeHtml(str(b))}</li>`).join("");
  return lis ? `<ul class="ticks">${lis}</ul>` : "";
}

/** A content section: eyebrow/title/lead/body/bullets, optional side media + actions. */
function section(_ctx: SiteRenderContext, props: JsonObject): string {
  const id = str(props.id) ? ` id="${escapeHtml(str(props.id))}"` : "";
  const mediaObj = obj(props.media);
  const side = str(props.side, "right") === "left" ? "section--media-left" : "section--media-right";
  const eyebrow = str(props.eyebrow) ? `<p class="eyebrow">${escapeHtml(str(props.eyebrow))}</p>` : "";
  const title = str(props.title) ? `<h2 class="section__title">${escapeHtml(str(props.title))}</h2>` : "";
  const lead = str(props.lead) ? `<p class="section__lead">${escapeHtml(str(props.lead))}</p>` : "";
  const text = `<div class="section__text">${eyebrow}${title}${lead}${paragraphsHtml(arr(props.body))}${bulletsHtml(arr(props.bullets))}${actionsHtml(arr(props.actions))}</div>`;
  const media = mediaObj ? `<div class="section__media">${mediaPlaceholder(mediaObj)}</div>` : "";
  const layout = media ? side : "section--plain";
  return `<section class="section ${layout}"${id}><div class="wrap section__inner">${text}${media}</div></section>`;
}

/** A 3-up (auto-fill) grid of labelled feature cards. */
function featureGrid(_ctx: SiteRenderContext, props: JsonObject): string {
  const eyebrow = str(props.eyebrow) ? `<p class="eyebrow">${escapeHtml(str(props.eyebrow))}</p>` : "";
  const title = str(props.title) ? `<h2 class="section__title">${escapeHtml(str(props.title))}</h2>` : "";
  const cards = arr(props.items)
    .map((it) => {
      const o = obj(it);
      if (!o) return "";
      const tag = str(o.tag) ? `<span class="feature__tag">${escapeHtml(str(o.tag))}</span>` : "";
      return `<article class="feature"><div class="feature__head">${tag}<h3 class="feature__title">${escapeHtml(str(o.title))}</h3></div><p class="feature__body">${escapeHtml(str(o.body))}</p></article>`;
    })
    .join("");
  return `<section class="feature-grid"><div class="wrap"><header class="feature-grid__head">${eyebrow}${title}</header><div class="features">${cards}</div></div></section>`;
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
// Widget IR rendering (SPEC-043/ADR-047 W-004) — renders `resolvePageWidgets`'s
// output (`WidgetRenderIR { componentId, props, children? }`), NOT theme-authored
// `TemplateNode` data. Deliberately a separate switch, not folded into `COMPONENTS`:
// `COMPONENTS`/`Component` resolve theme-authored `{type:"component", id, props}`
// nodes and have no concept of an IR's `children` array; widget IR is core-produced,
// closed-vocabulary data (exactly the five v1 `componentId`s the widget-type
// registry can ever emit, plus the `widget-placeholder` failure IR — see
// `src/widgets/registry.ts`/`resolver-service.ts`). Both render tiers reach this
// same function — the declarative tier via `renderBlock`'s new `region` node kind,
// the Liquid tier via `liquid-worker.ts`'s extended `render_block` tag — so ADR-047
// §2a's "no new Liquid capability required, both placement paths resolve to
// something the renderer already knows how to receive" holds for regions the same
// way it already held for the original four components.
// ---------------------------------------------------------------------------

/** REQ-28: a widget resolution failure (or, here, an unresolvable IR reaching the renderer some
 * other way) renders an isolated, public-safe placeholder — no internal error detail. */
const WIDGET_PLACEHOLDER_IR: WidgetRenderIR = { componentId: "widget-placeholder", props: {} };

function renderWidgetSocialLinks(props: JsonObject): string {
  const items = arr(props.links)
    .map((link) => {
      const o = obj(link);
      if (!o) return "";
      return `<li><a class="widget-social-link" href="${escapeHtml(safeHref(o.url))}">${escapeHtml(str(o.platform))}</a></li>`;
    })
    .join("");
  return `<ul class="widget widget-social-links">${items}</ul>`;
}

/**
 * `entry-summary` builds its own `href="/${slug}"` rather than calling {@link safeHref} — `slug` is
 * never a full URL, so the allowlist scheme/relative checks {@link safeHref} runs don't apply here.
 * That made it a SECOND, independent open-redirect path (2026-08-20 audit finding, alongside
 * `safeHref`'s own protocol-relative bypass fixed above): a `props.slug` of `"/evil.example"` (a
 * leading slash smuggled inside the widget prop) reconstructs the exact same `"//evil.example"`
 * protocol-relative shape once concatenated behind the hardcoded `/` prefix — `escapeHtml` does not
 * touch `/`, so nothing upstream of this function was stopping it. Fixed the same way
 * {@link renderDocMention} already validates a mentioned post's `id` before trusting it into an
 * `href`: re-validate against the real slug format (`SLUG_FORMAT_PATTERN`/`MAX_SLUG_LENGTH`, the
 * SAME rule the post feature enforces at write time) rather than assuming this prop was ever
 * produced by that write path — `render.contribute`'s IR is attacker-shaped JSON at this boundary,
 * not necessarily a real `PostRecord.slug`. An invalid slug degrades the link target to `"#"`
 * (never a malformed/unsafe href) while the title still renders — same "degrade, don't disappear"
 * convention every other renderer in this file follows.
 */
function renderWidgetEntrySummary(props: JsonObject): string {
  const slug = str(props.slug);
  const title = str(props.title);
  const href = slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_FORMAT_PATTERN.test(slug) ? `/${escapeHtml(slug)}` : "#";
  return `<li class="widget-entry-summary"><a href="${href}">${escapeHtml(title)}</a></li>`;
}

const RECENT_ENTRIES_EMPTY_HTML = '<ul class="widget widget-recent-entries"><li class="widget-empty">No entries yet.</li></ul>';

/** Converts one `recent-entries` IR child's resolved raw JSON props (built by
 *  `features/widgets/resolvers/recent-entries.ts`'s `RecentEntryItemProps`, deliberately the same
 *  shape as `entry-list-render.ts`'s `EntryListItem`) back into that typed shape. Read defensively
 *  (`str`/`arr`/`obj`) — this crosses a resolver/renderer JSON boundary, not a compiler-enforced
 *  contract. @complexity O(f) over the item's field count. */
function toEntryListItem(props: JsonObject): EntryListItem {
  return {
    title: str(props.title),
    href: typeof props.href === "string" ? props.href : null,
    dateIso: str(props.dateIso),
    dateLabel: str(props.dateLabel),
    fields: arr(props.fields).map((raw): EntryListFieldValue => {
      const f = obj(raw) ?? {};
      return { name: str(f.name), label: str(f.label), kind: str(f.kind), value: f.value ?? null };
    }),
  };
}

/**
 * `recent-entries` widget renderer — extended by collections plan R1 into "Collection list".
 *
 * `"cards"` layout (the one genuinely new display mode this plan adds) delegates entirely to C3's
 * `renderEntryList`, so field display (`<dl>`) and the shared `.entry-list`/`.entry-card` styling
 * work identically to the `{"type":"collection"}` marker — no second implementation. Review fix 3a
 * (2026-09-23): `withEntryListStyleOnce` is called from ONE place per tier — `static-render.ts`'s
 * `renderStaticPage` (used by `finishStaticTierDocument`) for a static theme, and this file's own
 * `pageShell` for every other tier — not from here; this renderer only has to produce the
 * `[data-tovu-entry-list]`-marked markup {@link withEntryListStyleOnce} looks for. Before this fix,
 * `pageShell` never called it at all, so a cards-layout widget on a templated/handlebars/
 * declarative theme (or no theme) rendered with no styling.
 *
 * `"list"` layout (the historical default, D7 — every pre-existing widget config has no `layout` key
 * and lands here) keeps its own exact `ul.widget.widget-recent-entries` / `li.widget-entry-summary`
 * markup instead of C3's generic `entry-list`/`entry-list__item` classes, so an operator's own theme
 * CSS targeting those class names keeps matching byte-for-byte. The one visible change for an old
 * config is the previously-broken `href="/<slug>"` link (`entry-summary`'s `renderWidgetEntrySummary`
 * built it and it 404s — a real bug) becoming plain text: the resolver's `href` is `null` while entry
 * pages are off (D1), and `null` here means no `<a>` at all, matching every other renderer in this
 * file's "degrade, don't disappear" convention.
 *
 * @complexity O(n · f) over the item count and each item's displayed field count.
 */
function renderWidgetRecentEntries(ir: WidgetRenderIR): string {
  const items = (ir.children ?? []).map((child) => toEntryListItem(child.props));
  if (items.length === 0) return RECENT_ENTRIES_EMPTY_HTML;

  if (ir.props.layout === "cards") {
    const columns = typeof ir.props.columns === "number" ? ir.props.columns : 3;
    const typeKey = str(ir.props.typeKey, "recent-entries");
    return renderEntryList(items, { columns, layout: "cards", typeKey }) ?? RECENT_ENTRIES_EMPTY_HTML;
  }

  const lis = items
    .map((item) => {
      const title = escapeHtml(item.title);
      const inner = item.href === null ? title : `<a href="${escapeHtml(safeHref(item.href))}">${title}</a>`;
      return `<li class="widget-entry-summary">${inner}</li>`;
    })
    .join("");
  return `<ul class="widget widget-recent-entries">${lis}</ul>`;
}

/** The `class="…"` attribute from a resolved item's `attrs.cssClass`, or `""` when absent — same
 *  escaped, no-allowlist posture `static-render.ts`'s tree-variant renderer already established for
 *  the same `NavItemAttrs` passthrough (see that file's `menuItemClasses`). */
function widgetMenuItemClassAttr(attrs: JsonObject | undefined): string {
  const cssClass = attrs?.cssClass;
  return typeof cssClass === "string" && cssClass ? ` class="${escapeHtml(cssClass)}"` : "";
}

/** `rel="…"`/`target="_blank"` from a resolved item's `attrs.rel`/`attrs.openInNewTab`. */
function widgetMenuItemLinkAttrs(attrs: JsonObject | undefined): string {
  const rel = attrs?.rel;
  const relAttr = typeof rel === "string" && rel ? ` rel="${escapeHtml(rel)}"` : "";
  const targetAttr = attrs?.openInNewTab === true ? ' target="_blank"' : "";
  return `${relAttr}${targetAttr}`;
}

/** `icon`/`description` as child spans around the label — mirrors `static-render.ts`'s
 *  `menuItemBody` so a theme author moving between static and widget-IR themes gets the same
 *  markup shape for the same authored attrs. */
function widgetMenuItemDecoratedLabel(attrs: JsonObject | undefined, label: string): string {
  const icon = attrs?.icon;
  const iconHtml =
    typeof icon === "string" && icon ? `<span class="widget-menu-item-icon" data-icon="${escapeHtml(icon)}"></span>` : "";
  const description = attrs?.description;
  const descriptionHtml =
    typeof description === "string" && description
      ? `<span class="widget-menu-item-desc">${escapeHtml(description)}</span>`
      : "";
  return `${iconHtml}${label}${descriptionHtml}`;
}

/** Renders a `menu` widget's resolved nav items (`navigation/resolver.ts`'s `ResolvedNavItem[]`,
 * passed through as plain IR props) — mirrors `siteNav`'s own unavailable-link handling: an
 * `available:false` item renders as inert text, never a broken/empty href.
 *
 * `attrs` (`cssClass`/`rel`/`openInNewTab`/`icon`/`description`) previously reached this function
 * (the resolver already attaches `NavItemAttrs` to every `ResolvedNavItem`) but were read nowhere —
 * this was the one render path of the two that honored NONE of them, while the static-tier tree
 * renderer already honored `cssClass`/`icon`/`description`. Now both paths honor all five. */
function renderWidgetMenuItems(items: JsonValue[]): string {
  return items
    .map((item) => {
      const o = obj(item);
      if (!o) return "";
      const attrs = obj(o.attrs);
      const label = widgetMenuItemDecoratedLabel(attrs, escapeHtml(str(o.label)));
      const available = o.available === true && typeof o.href === "string";
      const link = available
        ? `<a href="${escapeHtml(safeHref(o.href))}"${widgetMenuItemLinkAttrs(attrs)}>${label}</a>`
        : `<span class="widget-menu-item--unavailable">${label}</span>`;
      const children = arr(o.children);
      const sub = children.length ? `<ul>${renderWidgetMenuItems(children)}</ul>` : "";
      return `<li${widgetMenuItemClassAttr(attrs)}>${link}${sub}</li>`;
    })
    .join("");
}

function renderWidgetMenu(props: JsonObject): string {
  const title = str(props.title);
  const heading = title ? `<h3 class="widget-menu-title">${escapeHtml(title)}</h3>` : "";
  return `<nav class="widget widget-menu">${heading}<ul>${renderWidgetMenuItems(arr(props.items))}</ul></nav>`;
}

/**
 * Renders one field descriptor's `class`/extra-attribute string, both attached to the SAME
 * rendered input element the field's own `id`/`name`/`required`/`type` already get. Re-checks
 * `ATTRIBUTE_NAME_PATTERN` here rather than trusting that every stored field passed through
 * `forms.ts`'s `validateFieldDescriptors` (this is the public render path, REQ-37/ADR-047) —
 * defense in depth, since an attribute NAME is not something `escapeHtml` can make safe the way it
 * can a value (`onclick` is structurally dangerous regardless of how its own text is escaped).
 * `className` carries no such risk once escaped, so it is not re-validated, only escaped.
 */
function renderExtraFieldAttrs(o: JsonObject): string {
  const className = o.className;
  const classAttr = typeof className === "string" && className.trim() !== "" ? ` class="${escapeHtml(className)}"` : "";
  const attributes = obj(o.attributes);
  let attrsHtml = "";
  if (attributes) {
    for (const [name, value] of Object.entries(attributes)) {
      if (typeof value !== "string" || !ATTRIBUTE_NAME_PATTERN.test(name)) continue;
      attrsHtml += ` ${name}="${escapeHtml(value)}"`;
    }
  }
  return `${classAttr}${attrsHtml}`;
}

/** One `<textarea>`/checkbox/text-or-email `<input>` for a contact-form field descriptor — pulled out
 *  of {@link renderContactFormField}'s old three-way nested ternary so each shape is a flat, separately
 *  readable branch rather than one expression whose nesting depth drove the field-renderer's cognitive
 *  complexity. `requiredAttr` is computed once and reused across all three shapes, same value the old
 *  nested ternary recomputed per-branch. `describedByAttr` wires the field to its own (initially empty
 *  and hidden) error slot for assistive tech — see {@link renderContactFormField}'s own doc for why
 *  that slot exists even though nothing fills it in on the very first render. */
function renderContactFormInput(kind: string, id: string, required: boolean, extraAttrs: string, describedByAttr: string, maxLength: unknown): string {
  const requiredAttr = required ? " required" : "";
  if (kind === "checkbox") return `<input type="checkbox" name="${id}" id="widget-contact-${id}"${requiredAttr}${describedByAttr}${extraAttrs}/>`;
  const constraintAttrs = `${requiredAttr}${contactFormMaxLengthAttr(maxLength)}`;
  if (kind === "textarea") return `<textarea name="${id}" id="widget-contact-${id}"${constraintAttrs}${describedByAttr}${extraAttrs}></textarea>`;
  const inputType = kind === "email" ? "email" : "text";
  return `<input type="${inputType}" name="${id}" id="widget-contact-${id}"${constraintAttrs}${describedByAttr}${extraAttrs}/>`;
}

/** The field's own `maxLength` as a `maxlength` attribute, so the browser stops input at the same
 *  limit `forms.ts`'s `validateSubmissionPayload` enforces (`too_long`) instead of letting a visitor
 *  type past it and lose the submission to a server rejection. Only a positive integer renders —
 *  the value comes from stored JSON, so anything else is dropped rather than interpolated.
 *  @complexity O(1). */
function contactFormMaxLengthAttr(maxLength: unknown): string {
  return typeof maxLength === "number" && Number.isInteger(maxLength) && maxLength > 0 ? ` maxlength="${maxLength}"` : "";
}

/** One contact-form field descriptor -> its `<div class="widget-form-field">` markup — extracted from
 *  {@link renderWidgetContactForm}'s old inline `.map()` callback so the field's own render logic is a
 *  named, independently measured function rather than an anonymous closure.
 *
 *  Carries its own `<div class="widget-form-field-error" data-field="ID" hidden></div>` slot, hidden
 *  and empty on every ordinary render — `renderWidgetContactForm` has no request in scope (this is a
 *  pure prop-to-HTML function, no I/O), so it cannot know at render time whether THIS submission
 *  failed validation on THIS field. The slot exists purely as a stable, pre-built anchor
 *  {@link injectFormSubmissionResultIntoHtml} fills in and un-hides after the fact, on the
 *  Post/Redirect/Get reload that follows a failed submission (see that function's own doc for the
 *  full mechanism). */
function renderContactFormField(f: JsonValue): string {
  const o = obj(f);
  if (!o) return "";
  const id = escapeHtml(str(o.id));
  const label = escapeHtml(str(o.label));
  const required = o.required === true;
  const kind = str(o.type, "text");
  const extraAttrs = renderExtraFieldAttrs(o);
  const errorId = `widget-contact-${id}-error`;
  const inputEl = renderContactFormInput(kind, id, required, extraAttrs, ` aria-describedby="${errorId}"`, o.maxLength);
  const errorSlot = `<div class="widget-form-field-error" data-field="${id}" id="${errorId}" hidden></div>`;
  return `<div class="widget-form-field"><label for="widget-contact-${id}">${label}${required ? " *" : ""}</label>${inputEl}${errorSlot}</div>`;
}

const DEFAULT_CONTACT_FORM_SUCCESS_MESSAGE = "Thanks — your message has been sent.";

/** Renders a `contact-form` widget: Forms' own declared field vocabulary (REQ-37 — never a
 * hardcoded field-type list), posting to Forms' existing public route unmodified (`POST
 * /forms/:slug/submit`, `routes/site/forms-submit.ts`) — this widget type introduces no new
 * submission endpoint (REQ-39).
 *
 * Carries three things beyond the original bare `<form>` (2026-08-31 fix, generalized the same day —
 * see `form-render.ts`'s module doc for why the baseline style/slots/splice live there now):
 * 1. `form-render.ts`'s {@link FORM_BASELINE_STYLE} — see that constant's own doc for why a `<style>`
 *    tag lives here instead of a theme stylesheet or `pageShell`'s `<head>`.
 * 2. The GENERIC `data-form-slug` anchor (plus `.widget-contact-form-success`/`-error`/
 *    `data-contact-form-slug` kept alongside it for theme back-compat — no theme has ever targeted
 *    them, per the audit `form-render.ts` cites, but they were always a documented override surface)
 *    on both the form and its (initially hidden) success-message sibling — the stable anchor
 *    {@link injectFormSubmissionResultIntoHtml} matches against.
 * 3. `props.successMessage` (previously accepted by the resolver, `contact-form.ts`, but never read
 *    here) rendered into that hidden success slot up front, so the post-submission splice only has to
 *    reveal it, never invent or fetch it — this render function is the only place `successMessage` is
 *    naturally in scope.
 */
function renderWidgetContactForm(props: JsonObject): string {
  const slug = str(props.slug);
  if (!slug) return renderWidgetPlaceholder();
  const escapedSlug = escapeHtml(slug);
  const fields = arr(props.fields).map(renderContactFormField).join("");
  const successMessage = escapeHtml(str(props.successMessage) || DEFAULT_CONTACT_FORM_SUCCESS_MESSAGE);
  const legacyAttrs = `data-contact-form-slug="${escapedSlug}"`;
  const successSlot = renderFormSuccessSlot({ slug: escapedSlug, message: successMessage, extraClasses: "widget-contact-form-success", extraAttrs: legacyAttrs });
  const errorSlot = renderFormErrorSlot({ slug: escapedSlug, extraClasses: "widget-contact-form-error", extraAttrs: legacyAttrs });
  return (
    FORM_BASELINE_STYLE +
    successSlot +
    `<form class="widget ${FORM_CLASS} widget-contact-form" method="post" action="/forms/${escapedSlug}/submit" data-form-slug="${escapedSlug}" ${legacyAttrs}>` +
    errorSlot +
    fields +
    `<button type="submit">Send</button></form>`
  );
}

/** REQ-28: no internal detail, no stack trace, no configuration secret — the placeholder itself
 * carries nothing beyond a static, styleable marker. */
function renderWidgetPlaceholder(): string {
  return `<div class="widget widget-placeholder" aria-hidden="true"></div>`;
}

/**
 * Renders a resolved `data-embed-type="media"` Page embed (SPEC-047, generalized 2026-08-07;
 * video/embed capability added 2026-08-24) — `resolver-service.ts`'s `resolveMediaTypeEmbeds`
 * already did the I/O (asset lookup, content-type lookup, and — for a non-video asset — transform
 * version lookup) and only ever puts a `"media-image"` IR into its result map once every value
 * below is a validated primitive, so this function's own `isPlausibleMediaRefId`/`typeof` checks
 * are defense-in-depth (mirrors `renderExtraFieldAttrs`'s own re-check-even-though-upstream-
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
function normalizeMarkerAttributesProp(value: JsonValue | undefined): readonly MarkerAttribute[] {
  if (!Array.isArray(value)) return NO_MARKER_ATTRIBUTES;
  const attrs: MarkerAttribute[] = [];
  for (const entry of value) {
    if (!isObject(entry) || typeof entry.name !== "string") continue;
    if (typeof entry.value !== "string" && entry.value !== null) continue;
    attrs.push({ name: entry.name, value: entry.value });
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
    markerAttributes: normalizeMarkerAttributesProp(props.markerAttributes),
    // `EmbedOccurrence.controls`'s own default (`html-embeds.ts`) is `true`; the ONLY way this ends up
    // `false` is `withOccurrenceMediaAttributes` writing the literal JSON boolean `false` here.
    controls: props.controls !== false,
  };
}

function renderWidgetMediaImage(props: JsonObject): string {
  const assetId = props.assetId;
  if (typeof assetId !== "string" || !isPlausibleMediaRefId(assetId)) {
    return renderWidgetPlaceholder();
  }
  const { width, height, cssClass, htmlAttributes, markerAttributes, controls } = normalizeMediaDimensions(props);
  const alt = str(props.alt);
  // Readable-slugs S3: `resolver-service.ts`'s `resolveOneMediaEmbed` (both its video and image IR
  // branches) stashes the resolved record's `slug` onto the IR alongside `assetId` — same
  // `mediaUrlKey` fallback-to-id rule every other emitter here uses.
  const urlKey = mediaUrlKey({ id: assetId, slug: typeof props.slug === "string" ? props.slug : null });

  if (typeof props.contentType === "string" && props.contentType.startsWith("video/")) {
    return renderVideoTag({ urlKey, alt, width, height, cssClass, htmlAttributes, markerAttributes, controls });
  }

  const transformName = props.transformName;
  const version = props.version;
  if (typeof transformName !== "string" || typeof version !== "number" || !isPlausibleMediaRefId(transformName)) {
    return renderWidgetPlaceholder();
  }
  return renderImageTag({ urlKey, transformName, version, alt, width, height, cssClass, htmlAttributes, markerAttributes });
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
  bodyJson: JsonValue
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
    html: renderNodes(innerContent, EMPTY_INLINE_RESOLVED, EMPTY_MEDIA_TRANSFORM_VERSIONS, EMPTY_MEDIA_ASSET_METADATA, 0),
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
function readMediaTransformVersions(value: JsonValue | undefined): ReadonlyMap<string, number> {
  if (!isObject(value)) return EMPTY_MEDIA_TRANSFORM_VERSIONS;
  const entries = Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number");
  return entries.length > 0 ? new Map(entries) : EMPTY_MEDIA_TRANSFORM_VERSIONS;
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
  };
}

/** Same reconstruction as {@link readMediaTransformVersions}, for `mediaAssetMetadata` — see that
 *  function's own doc for why this crosses the `widgets/`-to-`render.ts` boundary as plain JSON
 *  rather than a real `Map`. A malformed per-asset entry (not an object) is skipped, not thrown;
 *  missing `width`/`height`/`cssClass`/`htmlAttributes` fields degrade to `null` ("not set"), matching
 *  {@link MediaAssetRenderMeta}'s own "`null` means not set, not zero" contract. */
function readMediaAssetMetadata(value: JsonValue | undefined): ReadonlyMap<string, MediaAssetRenderMeta> {
  if (!isObject(value)) return EMPTY_MEDIA_ASSET_METADATA;
  const entries: [string, MediaAssetRenderMeta][] = [];
  for (const [assetId, raw] of Object.entries(value)) {
    const meta = parseMediaAssetMeta(raw);
    if (meta) entries.push([assetId, meta]);
  }
  return entries.length > 0 ? new Map(entries) : EMPTY_MEDIA_ASSET_METADATA;
}

/** Rebuilds the `placementId -> WidgetRenderIR` map `renderDocNode`'s `widgetEmbed` case needs from
 *  the plain JSON `resolver-service.ts`'s `resolvePostContentWidgetContext` stashes into
 *  `props.inlineWidgets` (2026-09-22 — before it, every inline widget in a template-rendered post was
 *  the placeholder). A malformed entry is skipped, so its node degrades to the placeholder. */
function readInlineWidgets(value: JsonValue | undefined): ReadonlyMap<string, WidgetRenderIR> {
  if (!isObject(value)) return EMPTY_INLINE_RESOLVED;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, JsonObject] => isObject(entry[1]) && typeof entry[1].componentId === "string" && isObject(entry[1].props)
  );
  return entries.length > 0 ? new Map(entries.map(([id, ir]) => [id, ir as unknown as WidgetRenderIR])) : EMPTY_INLINE_RESOLVED;
}

/**
 * Owner-reported bug (2026-08-12): a ref-based image dropped into a post's body rendered as a
 * labelled placeholder box showing the filename — everywhere this function's output reaches (the
 * editor's own "Preview" tab, which renders through `routes/admin/posts/template-preview.ts` ->
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
 * The `.post-detail-header` block (`<h1>` + optional date byline), or `""` when the caller opted
 * out via `header: false` (2026-09-04 — a "content" marker's own `header:false`, threaded here from
 * `resolver-service.ts`'s `resolveContentTypeEmbeds`). Split out of {@link renderWidgetPostContent}
 * so the opt-out's own branch lives at nesting depth 0 in a small function, rather than stacking a
 * third ternary into a function that already carries two (the title-node back-compat fork, the
 * date-label presence check) — see this repo's complexity ceiling.
 *
 * @complexity O(1) — string concatenation only, no loop or recursion.
 */
function renderPostDetailHeader(showHeader: boolean, titleHtml: string, dateLabel: string, updatedAt: string): string {
  if (!showHeader) return "";
  return (
    `<div class="post-detail-header">` +
    titleHtml +
    (dateLabel ? `<div class="post-meta"><time datetime="${escapeHtml(updatedAt)}">${escapeHtml(dateLabel)}</time></div>` : "") +
    `</div>`
  );
}

function renderWidgetPostContent(props: JsonObject): string {
  const title = props.title;
  const bodyJson = props.bodyJson;
  if (typeof title !== "string" || bodyJson === undefined) return renderWidgetPlaceholder();
  // `header` (2026-09-04): `false` only when a "content" marker explicitly opted out
  // (`resolver-service.ts`'s `resolveContentTypeEmbeds` threads `ref.header` through unchanged) —
  // absent, `true`, or any other value keeps emitting the header, matching the field's own
  // default-true contract on `PageHtmlEmbedRef.header` so every pre-existing template (no `header`
  // key at all) renders byte-identical to before this field existed.
  const showHeader = props.header !== false;
  const updatedAt = typeof props.updatedAt === "string" ? props.updatedAt : "";
  const dateLabel = updatedAt ? new Date(updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";
  // Back-compat fork (post-title-in-document feature, 2026-08-11): a migrated body's OWN title node
  // drives the `<h1>` (text AND alignment) so centering it in the editor actually centers it here;
  // a pre-migration body (no title node yet — every row saved before this feature landed) falls back
  // to the plain `props.title` string exactly as this rendered before the feature existed. Exactly
  // one `<h1>` either way — never two, never zero.
  const titleNode = extractTitleNode(bodyJson as JsonValue);
  const titleHtml =
    titleNode !== null ? `<h1${styleForAlign(titleNode.align)}>${titleNode.html}</h1>` : `<h1>${escapeHtml(title)}</h1>`;
  const mediaTransformVersions = readMediaTransformVersions(props.mediaTransformVersions as JsonValue | undefined);
  const mediaAssetMetadata = readMediaAssetMetadata(props.mediaAssetMetadata as JsonValue | undefined);
  const inlineWidgets = readInlineWidgets(props.inlineWidgets as JsonValue | undefined);
  return (
    renderPostDetailHeader(showHeader, titleHtml, dateLabel, updatedAt) +
    `<div class="post-detail-body">${renderDocNode(bodyJson, inlineWidgets, mediaTransformVersions, mediaAssetMetadata)}</div>`
  );
}

/** One renderer per resolvable `componentId` — a lookup instead of a `switch` so the number of widget
 *  types stops being what drives {@link renderWidgetIr}'s own complexity (each `case` in a `switch`
 *  counts as a branch the same way each entry here does NOT, since the entries live in data, not
 *  control flow). `"widget-placeholder"` deliberately has no entry: it already gets the exact same
 *  {@link renderWidgetPlaceholder} output via the lookup's own miss path, same as any other
 *  unrecognized id. */
const WIDGET_IR_RENDERERS: Record<string, (ir: WidgetRenderIR) => string> = {
  text: (ir) => `<div class="widget widget-text">${escapeHtml(str(ir.props.body)).replaceAll("\n", "<br/>")}</div>`,
  "social-links": (ir) => renderWidgetSocialLinks(ir.props),
  "recent-entries": (ir) => renderWidgetRecentEntries(ir),
  "entry-summary": (ir) => renderWidgetEntrySummary(ir.props),
  menu: (ir) => renderWidgetMenu(ir.props),
  "contact-form": (ir) => renderWidgetContactForm(ir.props),
  "media-image": (ir) => renderWidgetMediaImage(ir.props),
  "post-content": (ir) => renderWidgetPostContent(ir.props),
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
  return renderer ? renderer(ir) : renderWidgetPlaceholder();
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
  return `<div class="widget-region widget-region--${escapeHtml(regionKey)}">${items.map((ir) => renderWidgetIr(ir)).join("")}</div>`;
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

/** `2800` (cents) → `"$28.00"`. Neither tier's allowlist carries a currency filter/helper
 * (Shopify-specific in Liquid, nonexistent in Handlebars), so this is precomputed server-side. */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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
    // `dateShort` is the same value pre-truncated to `YYYY-MM-DD`, added for the same reason
    // `priceFormatted` exists below — the Handlebars tier's allowlist carries no date filter or
    // helper (and deliberately exposes no way for a theme to register one), so any formatting a
    // theme cannot express must be precomputed server-side. Purely additive: every existing Liquid
    // theme's `{{ post.date | date: … }}` keeps reading the same unchanged `date` field.
    posts: ctx.posts.map((p) => ({ title: p.title, slug: p.slug, date: p.updatedAt, dateShort: shortDate(p.updatedAt) })),
    post: ctx.post
      ? {
          title: ctx.post.title,
          slug: ctx.post.slug,
          date: ctx.post.updatedAt,
          dateShort: shortDate(ctx.post.updatedAt),
          content: renderPostBody(ctx),
        }
      : null,
    // `price` stays in cents — themes format it themselves; `priceFormatted`/`compareAtPriceFormatted`
    // are precomputed here so a theme can just read one field.
    products: ctx.products.map(siteProductRenderShape),
    product: ctx.product ? siteProductRenderShape(ctx.product) : null,
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
    priceFormatted: formatCents(p.price),
    stock: p.stock,
    compareAtPriceFormatted: p.compareAtPrice === undefined ? undefined : formatCents(p.compareAtPrice),
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
  void _component;
  void _region;
  const component = COMPONENTS[id];
  if (!component) return `<!-- unknown component: ${escapeHtml(id)} -->`;
  return component(ctx, rest);
}

// ---------------------------------------------------------------------------
// Slots — raw context injection points a template can drop in directly.
// ---------------------------------------------------------------------------

function renderSlot(name: string, ctx: SiteRenderContext): string {
  switch (name) {
    case "title":
      return `<h1 class="slot-title">${escapeHtml(ctx.route === "post" && ctx.post ? ctx.post.title : ctx.siteTitle)}</h1>`;
    case "content":
      return ctx.post ? `<div class="prose">${renderPostBody(ctx)}</div>` : "";
    case "entry-list":
      return entryList(ctx, {});
    default:
      return `<!-- unknown slot: ${escapeHtml(name)} -->`;
  }
}

// ---------------------------------------------------------------------------
// Template block tree
// ---------------------------------------------------------------------------

function renderComponentBlock(node: JsonObject, ctx: SiteRenderContext): string {
  const id = typeof node.id === "string" ? node.id : "";
  const component = COMPONENTS[id];
  if (!component) return `<!-- unknown component: ${escapeHtml(id)} -->`;
  return component(ctx, isObject(node.props) ? node.props : {});
}

function renderSlotBlock(node: JsonObject, ctx: SiteRenderContext): string {
  return renderSlot(typeof node.name === "string" ? node.name : "", ctx);
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
  return renderDocNode(node, ctx.widgetInlineResolved, ctx.mediaTransformVersions, ctx.mediaAssetMetadata);
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

const BASE_STYLE = `
  *,*::before,*::after { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; -webkit-font-smoothing: antialiased; }
  img { max-width: 100%; height: auto; }
  a { color: inherit; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

function tokensToCss(tokens: Record<string, string>): string {
  const decls = Object.entries(tokens)
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
  return `:root { ${decls} }\n  body { font-family: var(--font-body, system-ui, sans-serif); }`;
}

function fontLink(theme: DiscoveredTheme): string {
  const fonts = theme.manifest.fonts ?? [];
  if (fonts.length === 0) return "";
  const families = fonts.map((f) => `family=${f}`).join("&");
  return `<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=swap"/>`;
}

/**
 * The DOM id `apps/site-chat/src/main.tsx`'s bundle mounts itself into. Kept as a literal string in
 * both files rather than a shared import — `site-chat` is a standalone Vite app outside this
 * server's module graph (see that file's own header for the same tradeoff on this exact constant).
 */
const SITE_ASSISTANT_MOUNT_ID = "tovu-site-assistant-root";

/**
 * ADR-054 Task 2/3 — the visitor chat's mount node plus its `<script defer>`, injected once here
 * rather than into any of the five theme templates (see this file's own module doc). `defer`, not a
 * blocking `<script>` or a bare module tag with no attribute: the ADR's own "Costs and open risks"
 * section requires this to never block first paint, and `defer` is what guarantees the browser keeps
 * parsing/painting the rest of the document while the bundle fetches, only running it once parsing
 * finishes.
 *
 * Gated on `enabled` — never unconditional. `src/assistant/public-assistant-settings.ts`'s file
 * header spells out the contract this obeys: `publicEnabled: false` means the public page ships NO
 * assistant bundle and NO mount markup, and "a CSS or JavaScript-level hide is a defect against this
 * contract, not a shortcut." Emitting `hidden`/`display:none` markup here when disabled would be
 * exactly that defect, so the disabled case returns nothing at all rather than an inert tag.
 *
 * Ships a `<link rel="stylesheet">` alongside the script — a real, measured omission until a
 * browser check caught it (2026-08-03): the mount div and script alone got the FAB rendering, but
 * with none of `apps/site-chat/src/widget.css`'s positioning/sizing loaded, so it rendered as a bare
 * unstyled `<button>` (33×28px, page-flow position) instead of the designed fixed 56×56 circle.
 * `ChatPane`'s OWN internal theme still injects itself as a runtime `<style>` tag regardless (see
 * `AssistantDock.tsx`'s file header for that mechanism) — that part never needed this link. Only the
 * HOST-supplied layout CSS (`.chat-fab`/`.tovu-site-assistant__panel` position/size) does, because
 * nothing else on an arbitrary themed page provides it. Placed in `<head>` (not deferred like the
 * script) since it is small (under 1KB) and a visible FAB pop-in after paint would be a worse
 * regression than the negligible render-blocking cost of one tiny stylesheet.
 */
function siteAssistantMarkup(enabled: boolean): { head: string; body: string } {
  if (!enabled) return { head: "", body: "" };
  return {
    head: `<link rel="stylesheet" href="/site-chat/site-assistant.css"/>`,
    body: `<div id="${SITE_ASSISTANT_MOUNT_ID}"></div><script defer src="/site-chat/site-assistant.js"></script>`,
  };
}

/**
 * Splices `page-head.ts`'s `serializeHeadElements()` output into an already-complete static-tier
 * document's `<head>` (SPEC-008 T045 gap fix). `renderStaticPage`'s output bypasses `pageShell`
 * entirely — a static theme's page is already a full `<!doctype html>` document, not a body
 * fragment — which meant `extraHead` (the SEO fold's title/canonical/meta/OG/JSON-LD) was silently
 * dropped for every static-tier home page even though the route layer always computed it. Mirrors
 * {@link pageShell}'s own "fold's `<title>` wins" rule: when `extraHead` carries a `<title>`, the
 * theme's own hardcoded one is removed so the page never ships two competing tags. `extraHead`'s
 * elements are inserted immediately before `</head>` (append, not replace) so the theme's own
 * meta/link/script tags survive untouched. A no-op when `extraHead` is empty/absent, or when `html`
 * has no `</head>` to splice into (defensive — every real static page has one; this is the same
 * "never throw, degrade to what's already there" contract `renderStaticPage` itself follows).
 *
 * Exported (2026-08-19 follow-up) so `routes/site/pages.ts` can reuse this SAME splice for the two
 * other static-tier `renderStaticPage` call sites that bypass `renderSite`/`pageShell` entirely and
 * therefore had the identical drop: the marketing `/:slug` theme-page branch (no backing post, so
 * there is no `renderSite` call in the mix at all) and `renderViaTemplate`'s template-picker render.
 * One splice implementation, not a second parallel one — see those call sites' own docs for which
 * static-tier renders were deliberately left OUT (the admin theme-preview iframe and the 404/
 * diagnostic pages) and why.
 */
export function injectExtraHeadIntoStaticPage(html: string, extraHead: string | undefined): string {
  if (!extraHead) return html;
  const withoutOwnTitle = extraHead.includes("<title>") ? removeThemeOwnTitleElement(html) : html;
  return /<\/head>/i.test(withoutOwnTitle) ? withoutOwnTitle.replace(/<\/head>/i, `${extraHead}</head>`) : withoutOwnTitle;
}

/**
 * {@link injectExtraHeadIntoStaticPage}'s sibling for the ADR-054 visitor-chat markup. Every
 * `renderStaticPage` call site bypasses `pageShell()` (see this file's own module doc), so
 * `pageShell`'s `siteAssistantMarkup()` splice never runs for a static-tier page unless each bypass
 * site calls this too — this was the actual gap: `site.assistant.public_enabled` could read `true`
 * and the pageShell-routed tiers would show the widget while every static-tier page (the home route
 * when the active theme is `"static"`, a theme's own marketing pages, and a template-picker render)
 * stayed silently unchanged, because none of them ever called {@link siteAssistantMarkup} at all.
 *
 * Same two insertion points `pageShell` itself uses — the stylesheet link immediately before
 * `</head>`, the mount node + deferred script immediately before `</body>` — just spliced into an
 * already-complete document instead of built into one. A no-op (returns `html` unchanged) when
 * `enabled` is `false`, matching {@link siteAssistantMarkup}'s own "disabled emits nothing, not an
 * inert tag" contract.
 */
export function injectSiteAssistantIntoStaticPage(html: string, enabled: boolean): string {
  const { head, body } = siteAssistantMarkup(enabled);
  if (!head && !body) return html;
  const withHead = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${head}</head>`) : html;
  return /<\/body>/i.test(withHead) ? withHead.replace(/<\/body>/i, `${body}</body>`) : withHead;
}

/**
 * True when `index` falls inside an HTML comment. Walks `<!--`/`-->` pairs from the start rather
 * than pattern-matching around `index`, because only a left-to-right scan can tell an opener that is
 * still open at `index` from one that already closed before it. An unterminated `<!--` is treated as
 * swallowing everything after it, which is exactly what a browser's parser does.
 *
 * @complexity O(n) over `html`'s length.
 */
function isInsideHtmlComment(html: string, index: number): boolean {
  const CLOSE = "-->";
  let cursor = 0;
  for (;;) {
    const open = html.indexOf("<!--", cursor);
    if (open === -1 || open > index) return false;
    const close = html.indexOf(CLOSE, open + "<!--".length);
    if (close === -1 || index < close + CLOSE.length) return true;
    cursor = close + CLOSE.length;
  }
}

/**
 * Remove the document's own `<title>` element — the FIRST one that is real markup rather than an
 * incidental mention inside an HTML comment.
 *
 * The naive `html.replace(/<title>[\s\S]*?<\/title>/i, "")` this replaces was a live bug, not a
 * hypothetical one: `themes/static/basic/render/pages/page-shell.html`'s head opens with a comment
 * explaining its title placeholder, and that prose says `<title>` literally. The unanchored pattern
 * matched the mention inside the comment and ran its lazy tail to the real `</title>` further down,
 * deleting the comment's own `-->` along the way. Every head element after it — the theme-token
 * `<style>`, the `theme.css` link, the theme-toggle script — then parsed as comment text, so
 * `/contact`, `/team`, `/faq` and `/terms-of-service` served completely unstyled pages that looked
 * blank above the fold. Scanning for the first *uncommented* occurrence is the same lesson
 * {@link injectPageTitle} (`features/theme/static-render.ts`) already learned on this very template;
 * that one anchors on the placeholder's exact element text, which is unavailable here because this
 * runs after the placeholder has been substituted with a real title.
 *
 * Skipping only the OPEN tag (not a whole candidate element) matters: a lazy whole-element match
 * starting inside the comment consumes the real title as its tail, so a scan that rejected whole
 * matches would find no second candidate and leave two competing `<title>` tags on the page.
 *
 * @complexity O(n·k) worst case over `html`'s length and the number of `<title>` occurrences — k is
 * 1 or 2 for any real template.
 */
function removeThemeOwnTitleElement(html: string): string {
  const openTag = /<title>/gi;
  for (let open = openTag.exec(html); open !== null; open = openTag.exec(html)) {
    if (isInsideHtmlComment(html, open.index)) continue;
    const closeTag = /<\/title>/gi;
    closeTag.lastIndex = open.index + open[0].length;
    const close = closeTag.exec(html);
    if (close === null) return html;
    return html.slice(0, open.index) + html.slice(close.index + close[0].length);
  }
  return html;
}

/**
 * `extraHead` is `page-head.ts`'s `serializeHeadElements()` output (SPEC-008
 * ADR-PIPE-008 T048) — already-escaped markup, inserted verbatim. When it
 * contains its own `<title>` (SEO's fold always emits one, per
 * `page-head-contributor.ts`'s priority-100 title element), this shell's own
 * hardcoded `<title>` is suppressed rather than emitting two competing tags.
 */
function pageShell(required: {
  title: string;
  /** `null` when the operator turned the theme off — see {@link RenderSiteRequired.theme}. */
  theme: DiscoveredTheme | null;
  body: string;
  extraHead?: string;
  /** ADR-054 — the `site.assistant.public_enabled` ledger value for this request's workspace,
   *  resolved by the caller (the route handler, which already holds `deps.settingsRepo`; see this
   *  function's own doc). Defaults to `false` — the same fail-closed default the setting itself
   *  carries — so any pre-existing or test caller that does not pass this omits the assistant
   *  rather than silently gaining it. */
  siteAssistantEnabled?: boolean;
}): string {
  const { theme, extraHead } = required;
  const foldHasTitle = extraHead?.includes("<title>") ?? false;
  const titleTag = foldHasTitle ? "" : `<title>${escapeHtml(required.title)}</title>`;
  const siteAssistant = siteAssistantMarkup(required.siteAssistantEnabled ?? false);
  // The theme contributes exactly these three things to the document Tovu owns. With no theme they
  // are each ABSENT, not empty: `BASE_STYLE` is Tovu's own reset and stays either way, but a
  // synthesised `:root { }` or a `<link>` to no font family would be markup an operator has to work
  // around. `data-theme` in particular is omitted ENTIRELY rather than emitted empty — `[data-theme]`
  // matches `data-theme=""`, so an empty attribute is a selector someone hits by accident.
  const themeFontLink = theme ? fontLink(theme) : "";
  const themeStyle = theme ? `${tokensToCss(theme.tokens)}${theme.css}` : "";
  const themeAttr = theme ? ` data-theme="${escapeHtml(theme.manifest.id)}"` : "";
  const document = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
${titleTag}
${extraHead ?? ""}
${themeFontLink}
<style>${BASE_STYLE}${themeStyle}</style>
${siteAssistant.head}
</head>
<body>
<div class="site"${themeAttr}>${required.body}</div>
${siteAssistant.body}
</body>
</html>`;
  // Review fix 3a: the same once-per-page default style `finishStaticTierDocument`'s
  // `renderStaticPage` call already injects for a static theme's own `{"type":"collection"}`
  // marker (`static-render.ts`'s `renderStaticPage`) — this was the missing half, so a
  // `recent-entries` cards-layout widget on a templated/handlebars/declarative theme (or no theme)
  // used to render its `.entry-card` markup with no styling at all. Safe to call unconditionally:
  // `withEntryListStyleOnce` only ever matches its OWN `[data-tovu-entry-list]` wrapper attribute,
  // never a theme's own unrelated `.entry-list`-classed markup (`entryList`/`productEntryList`
  // below both use that class for the built-in post/product index).
  return withEntryListStyleOnce(document);
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/** {@link renderSite}'s `required` parameter, named so the tier-render helpers below can each take
 *  just the slice of it they need rather than repeating this whole shape — split out purely for
 *  {@link renderSite}'s own complexity, no change to the accepted call shape (an inline object type
 *  and a structurally-identical named interface are the same type to every existing caller). */
export interface RenderSiteRequired {
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
  siteAssistantEnabled?: boolean;
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
}

/** {@link renderSite}'s own `ctx` construction, pulled out so the four `??`/`?.` defaulting
 *  expressions are counted once here instead of against the top-level dispatcher's budget. */
function buildSiteRenderContext(required: RenderSiteRequired): SiteRenderContext {
  return {
    siteTitle: required.siteTitle,
    route: required.route,
    posts: required.posts,
    post: required.post,
    products: required.products ?? [],
    product: required.product,
    themeName: required.theme?.manifest.name ?? null,
    widgetRegions: required.widgets?.regions ?? {},
    widgetInlineResolved: required.widgets?.inlineResolved ?? EMPTY_INLINE_RESOLVED,
    mediaTransformVersions: required.mediaTransformVersions ?? EMPTY_MEDIA_TRANSFORM_VERSIONS,
    mediaAssetMetadata: required.mediaAssetMetadata ?? EMPTY_MEDIA_ASSET_METADATA,
    assignedTerms: required.assignedTerms ?? EMPTY_ASSIGNED_TERMS,
    pageHtmlEmbeds: required.pageHtmlEmbeds,
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
  const main =
    route === "post"
      ? entryContent(ctx)
      : route === "product"
        ? productEntryContent(ctx)
        : route === "products"
          ? productEntryList(ctx)
          : entryList(ctx, {});
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
function renderStaticTierHomePage(
  theme: DiscoveredTheme,
  route: SiteRenderContext["route"],
  staticMenus: RenderSiteRequired["staticMenus"],
  extraHead: string | undefined,
  siteAssistantEnabled: boolean
): string | undefined {
  if (theme.manifest.tier !== "static" || route !== "home") return undefined;
  const staticHtml = renderStaticPage({ theme, pageId: "index", menus: staticMenus });
  if (!staticHtml) return undefined;
  return injectSiteAssistantIntoStaticPage(injectExtraHeadIntoStaticPage(staticHtml, extraHead), siteAssistantEnabled);
}

/** Templated (LiquidJS) tier body — resolves the route to a `.liquid` template, renders it inside its
 *  own `worker_threads` sandbox, and degrades to {@link fallbackSiteBody} on ANY failure: a syntax
 *  error, a disallowed tag/filter the worker's defensive re-lint caught, or a sandbox timeout/OOM.
 *  Never a 500 (SPEC-004 REQ-10 spirit). */
async function renderTemplatedTierBody(
  theme: DiscoveredTheme,
  route: SiteRenderContext["route"],
  liquidTemplateIdOverride: string | undefined,
  ctx: SiteRenderContext
): Promise<string> {
  const liquidId = liquidTemplateIdOverride ?? resolveLiquidTemplateId({ route, liquidTemplates: theme.liquidTemplates });
  const source = liquidId ? theme.liquidTemplates[liquidId] : undefined;
  try {
    return source
      ? await renderLiquidInSandbox({ source, ctx, skipLiquidAllowlist: theme.manifest.skipLiquidAllowlist })
      : fallbackSiteBody(ctx, route);
  } catch (err) {
    return `<!-- theme render error: ${escapeHtml((err as Error).message)} -->${fallbackSiteBody(ctx, route)}`;
  }
}

/** Handlebars tier body — same contract as {@link renderTemplatedTierBody}, engine swapped: resolve
 *  the route to a `.hbs` template, render it inside its own `worker_threads` sandbox, and degrade to
 *  {@link fallbackSiteBody} on ANY failure. Never a 500. */
async function renderHandlebarsTierBody(theme: DiscoveredTheme, route: SiteRenderContext["route"], ctx: SiteRenderContext): Promise<string> {
  const hbsId = resolveHandlebarsTemplateId({ route, handlebarsTemplates: theme.handlebarsTemplates });
  const source = hbsId ? theme.handlebarsTemplates[hbsId] : undefined;
  try {
    return source ? await renderHandlebarsInSandbox({ source, ctx }) : fallbackSiteBody(ctx, route);
  } catch (err) {
    return `<!-- theme render error: ${escapeHtml((err as Error).message)} -->${fallbackSiteBody(ctx, route)}`;
  }
}

/** Declarative (JSON block-tree) tier body — the default tier, synchronous unlike its two siblings
 *  above since `renderBlock`'s own walk never crosses a `worker_threads` boundary. */
function renderDeclarativeTierBody(theme: DiscoveredTheme, route: SiteRenderContext["route"], ctx: SiteRenderContext): string {
  const templateId = resolveTemplateId({ route, templates: theme.templates });
  const tree = templateId ? theme.templates[templateId] : undefined;
  return tree ? renderBlock(tree, ctx) : fallbackSiteBody(ctx, route);
}

/** The `<title>` `pageShell` renders — the viewed post's own title on the `post` route, the site
 *  title everywhere else (including a `post` route whose post somehow isn't set). */
function resolvePageTitle(route: SiteRenderContext["route"], post: PostRecord | undefined, siteTitle: string): string {
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
    const title = resolvePageTitle(route, required.post, required.siteTitle);
    const body = fallbackSiteBody(ctx, route);
    return pageShell({ title, theme, body, extraHead: required.extraHead, siteAssistantEnabled: required.siteAssistantEnabled });
  }

  const staticHomePage = renderStaticTierHomePage(
    theme,
    route,
    required.staticMenus,
    required.extraHead,
    required.siteAssistantEnabled ?? false
  );
  if (staticHomePage !== undefined) return staticHomePage;

  let body: string;
  if (theme.manifest.tier === "templated") {
    body = await renderTemplatedTierBody(theme, route, required.liquidTemplateIdOverride, ctx);
  } else if (theme.manifest.tier === "handlebars") {
    body = await renderHandlebarsTierBody(theme, route, ctx);
  } else {
    body = renderDeclarativeTierBody(theme, route, ctx);
  }

  const title = resolvePageTitle(route, required.post, required.siteTitle);
  return pageShell({ title, theme, body, extraHead: required.extraHead, siteAssistantEnabled: required.siteAssistantEnabled });
}

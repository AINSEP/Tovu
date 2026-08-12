import type { JsonObject, JsonValue } from "@jini-ai/cms/core";
import { MAX_SLUG_LENGTH, SLUG_FORMAT_PATTERN, type PostRecord } from "#src/features/post/index";
import type { DiscoveredTheme, StaticMenuItem, TemplateNode } from "#src/features/theme/index";
import {
  resolveTemplateId,
  resolveLiquidTemplateId,
  resolveHandlebarsTemplateId,
  renderStaticPage,
} from "#src/features/theme/index";
import { isPageEmbedType, type ResolveHtmlPageEmbedsResult, type ResolvePageWidgetsResult } from "#src/widgets/resolver-service";
import type { WidgetRenderIR } from "#src/widgets/types";
import { substituteHtmlEmbeds } from "#src/widgets/html-embeds";
import { ATTRIBUTE_NAME_PATTERN } from "#src/forms/forms";
import { renderHandlebarsInSandbox } from "./handlebars-sandbox";
import { renderLiquidInSandbox } from "./liquid-sandbox";

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
  title: string;
  price: number; // cents
  stock: number;
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
  /** Active theme display name, for the footer badge. */
  themeName: string;
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
}

/** One resolved asset's public-render sizing override — see `SiteRenderContext.mediaAssetMetadata`'s
 * own doc. `null` on any field means "not set", not "zero"/"empty string". */
export interface MediaAssetRenderMeta {
  width: number | null;
  height: number | null;
  cssClass: string | null;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Exported for `liquid-worker.ts`, which runs in an isolated worker thread and needs the same escaping used everywhere else in this renderer. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Content doc vocabulary (unchanged from the pre-theme renderer)
// ---------------------------------------------------------------------------

/**
 * Sanitize a content `link` href (C7). Content is data, so an inline link is an
 * untrusted string: allow only in-page (`#…`), same-origin relative (`/…`),
 * `http(s)://`, and `mailto:` targets. Everything else — notably `javascript:`
 * and `data:` — collapses to `"#"` so a doc can never smuggle script into a page.
 */
function safeHref(value: JsonValue | undefined): string {
  if (typeof value !== "string") return "#";
  const href = value.trim();
  if (href.startsWith("/") || href.startsWith("#")) return href;
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href;
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
 * mint a real ref would — and would also have to solve `src/http`'s (ADR-038) UTF-8 text buffering,
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

function renderMarks(text: string, marks: JsonValue[] | undefined): string {
  let html = escapeHtml(text);
  for (const mark of marks ?? []) {
    if (!isObject(mark)) continue;
    const type = mark.type;
    if (type === "bold") html = `<strong>${html}</strong>`;
    else if (type === "italic") html = `<em>${html}</em>`;
    else if (type === "code") html = `<code>${html}</code>`;
    else if (type === "underline") html = `<u>${html}</u>`;
    else if (type === "strike") html = `<s>${html}</s>`;
    else if (type === "subscript") html = `<sub>${html}</sub>`;
    else if (type === "superscript") html = `<sup>${html}</sup>`;
    else if (type === "textStyle") {
      // `@tiptap/extension-text-style` (2026-08-11) — `Color`/`BackgroundColor` are both
      // `Extension`s that attach a global attribute to this ONE shared mark rather than marks of
      // their own (confirmed against the installed dist, not assumed: both literally call
      // `chain().setMark("textStyle", { color/backgroundColor })`), so a run of text with both
      // picked carries a SINGLE `textStyle` mark with both attrs, not two nested marks — the
      // combined style string below mirrors that, one `<span style="...">`, not two nested spans.
      // Each value is independently allowlisted ({@link safeCssColor}) before it reaches public
      // HTML; an unsafe/malformed value for either drops just that declaration rather than the
      // whole style attribute (an author who picked a valid text color but somehow got a corrupted
      // background value keeps the text color). No attrs surviving the allowlist (including the
      // common case: a `textStyle` mark with neither attr set, e.g. from `toggleTextStyle()` or
      // some other extension using this same mark) renders no `<span>` at all — an empty
      // `style=""` wrapper would be pure noise.
      const attrs = isObject(mark.attrs) ? mark.attrs : {};
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
      if (styleParts.length > 0) html = `<span style="${escapeHtml(styleParts.join(";"))}">${html}</span>`;
    } else if (type === "highlight") {
      // `@tiptap/extension-highlight`, `multicolor: true` (2026-08-11) — the admin toolbar button is
      // a plain toggle (no color picker), so `attrs.color` is normally absent and this renders a bare
      // `<mark>`, styled by `.post-detail-body mark` (styles.css). A `color` attr from anywhere else
      // (pasted content, a future picker) still round-trips as an inline `background-color` as long
      // as it passes {@link safeCssColor}'s allowlist — an unsafe/malformed value degrades to the
      // bare `<mark>` rather than a malformed or unsafe style attribute.
      const attrs = isObject(mark.attrs) ? mark.attrs : {};
      const color = safeCssColor(attrs.color);
      html = color ? `<mark style="background-color:${escapeHtml(color)}">${html}</mark>` : `<mark>${html}</mark>`;
    } else if (type === "link") {
      const attrs = isObject(mark.attrs) ? mark.attrs : {};
      html = `<a href="${escapeHtml(safeHref(attrs.href))}">${html}</a>`;
    }
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
function renderImageTag(props: {
  readonly assetId: string;
  readonly transformName: string;
  readonly version: number;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly cssClass: string | null;
}): string {
  const src = `/m/${encodeURIComponent(props.assetId)}/${encodeURIComponent(props.transformName)}.v${props.version}/image.jpg`;
  const altAttr = escapeHtml(props.alt);
  const widthAttr = props.width != null ? ` width="${props.width}"` : "";
  const heightAttr = props.height != null ? ` height="${props.height}"` : "";
  const classAttr = props.cssClass ? ` class="${escapeHtml(props.cssClass)}"` : "";
  return `<img src="${escapeHtml(src)}" alt="${altAttr}"${widthAttr}${heightAttr}${classAttr} loading="lazy">`;
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
function tableSpanAttrs(attrs: JsonObject): string {
  const colspan = typeof attrs.colspan === "number" && Number.isInteger(attrs.colspan) && attrs.colspan >= 1 && attrs.colspan <= 1000
    ? attrs.colspan
    : 1;
  const rowspan = typeof attrs.rowspan === "number" && Number.isInteger(attrs.rowspan) && attrs.rowspan >= 1 && attrs.rowspan <= 1000
    ? attrs.rowspan
    : 1;
  return `${colspan !== 1 ? ` colspan="${colspan}"` : ""}${rowspan !== 1 ? ` rowspan="${rowspan}"` : ""}`;
}

function renderNodes(
  nodes: JsonValue[] | undefined,
  inlineResolved: ReadonlyMap<string, WidgetRenderIR>,
  mediaTransformVersions: ReadonlyMap<string, number>,
  mediaAssetMetadata: ReadonlyMap<string, MediaAssetRenderMeta>
): string {
  return (nodes ?? [])
    .map((node) => renderDocNode(node, inlineResolved, mediaTransformVersions, mediaAssetMetadata))
    .join("");
}

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
  mediaAssetMetadata: ReadonlyMap<string, MediaAssetRenderMeta> = EMPTY_MEDIA_ASSET_METADATA
): string {
  if (!isObject(node)) return "";
  const content = Array.isArray(node.content) ? node.content : undefined;

  switch (node.type) {
    case "doc":
      // Dedupe at the doc boundary — see `dedupeHeadingIds` for why this is a pass over the finished
      // string rather than state threaded through the recursion.
      return dedupeHeadingIds(renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata));
    case "paragraph":
      return `<p${alignStyleAttr(node)}>${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</p>`;
    case "heading": {
      const level = isObject(node.attrs) && typeof node.attrs.level === "number" ? node.attrs.level : 2;
      const h = Math.min(Math.max(level, 1), 6);
      // Additive: an `id` changes nothing visually, and every heading rendered before this existed
      // simply had no anchor to link to. Emitted as the FIRST attribute, which `dedupeHeadingIds`
      // relies on. Omitted entirely when the text slugifies to nothing.
      const anchor = headingAnchorId(node);
      const idAttr = anchor === "" ? "" : ` id="${escapeHtml(anchor)}"`;
      return `<h${h}${idAttr}${alignStyleAttr(node)}>${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</h${h}>`;
    }
    case "title":
      // Post-title-in-document feature (2026-08-11) — a dedicated first `doc` node an author can
      // center/style per post (`apps/admin/src/lib/post-title-extension.ts`). Renders empty in every
      // GENERIC doc walk: `entryContent`, `renderSlot("title")`, and `buildTemplateRenderData`'s
      // `post.content` already each print `post.title`/`ctx.post.title` (kept in sync with this
      // node — see `withTitleNode`/`titleNodeText`, `apps/admin/.../features/posts/rules.ts`) as
      // their OWN separate heading; letting this node ALSO emit its text here would duplicate the
      // title on every one of those render paths. `renderWidgetPostContent` is the one caller that
      // needs this node directly (for its alignment) and reads it via its own `extractTitleNode`,
      // bypassing this generic walk entirely for that one field.
      return "";
    case "text":
      return renderMarks(
        typeof node.text === "string" ? node.text : "",
        Array.isArray(node.marks) ? node.marks : undefined
      );
    case "bulletList":
      return `<ul>${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</ul>`;
    case "orderedList":
      return `<ol>${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</ol>`;
    case "listItem":
      return `<li>${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</li>`;
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
    case "taskList":
      return `<ul data-type="taskList">${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</ul>`;
    case "taskItem": {
      const attrs = isObject(node.attrs) ? node.attrs : {};
      const checked = attrs.checked === true;
      return `<li data-type="taskItem"><label><input type="checkbox"${checked ? " checked" : ""} disabled/><span></span></label><div>${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</div></li>`;
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
    case "table":
      return `<table>${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</table>`;
    case "tableRow":
      return `<tr>${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</tr>`;
    case "tableCell": {
      const attrs = isObject(node.attrs) ? node.attrs : {};
      return `<td${tableSpanAttrs(attrs)}${tableCellAlignAttr(node)}>${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</td>`;
    }
    case "tableHeader": {
      const attrs = isObject(node.attrs) ? node.attrs : {};
      return `<th${tableSpanAttrs(attrs)}${tableCellAlignAttr(node)}>${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</th>`;
    }
    case "blockquote":
      return `<blockquote>${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</blockquote>`;
    case "codeBlock": {
      // `attrs.language` (`@tiptap/extension-code-block-lowlight`, 2026-08-11) — see
      // `safeLanguageClass`'s own doc for why this stays a class token with no server-side
      // highlighting: the editor gets real in-browser highlighting (lowlight), this renderer stays
      // dependency-free, and a theme can opt into a client-side highlighter later without any change
      // here. Omitted entirely (bare `<code>`, exactly the prior behavior) when absent or unsafe.
      const attrs = isObject(node.attrs) ? node.attrs : {};
      const language = safeLanguageClass(attrs.language);
      const classAttr = language ? ` class="language-${escapeHtml(language)}"` : "";
      return `<pre><code${classAttr}>${renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata)}</code></pre>`;
    }
    case "horizontalRule":
      return "<hr/>";
    // Leaf/atom node, `@tiptap/extension-hard-break` (Shift-Enter / Mod-Enter) — bundled by
    // StarterKit v3.27, no toolbar button needed to reach it. Its own `renderHTML` emits a bare
    // `["br", ...attrs]` with no content hole (verified against the installed dist), same
    // childless-leaf shape `horizontalRule` above already renders self-closed. Before this case
    // existed, an unrecognized `hardBreak` fell through to `default`'s `renderNodes(content, ...)`
    // — since a leaf node's `content` is always `undefined`, that resolved to `""`: the line break
    // silently vanished on the public site with no error and no visible difference in the editor.
    case "hardBreak":
      return "<br/>";
    case "image": {
      // D7 (original), extended under ADR-027 §4 and this task's quick-and-dirty sizing fix: a
      // TipTap image node reaches this renderer in one of two shapes. LEGACY nodes carry only
      // `attrs.src`/`attrs.title` — some combination of an inlined `data:` blob, an arbitrary
      // external URL, or the *authenticated* admin media-preview URL, none of which are safe or
      // correct to embed unescaped on public, unauthenticated HTML. Those keep degrading to the
      // same aspect-ratio placeholder (`mediaPlaceholder`) exactly as before this task —
      // `src`/`title` are still never read here at all, which is precisely the property that made
      // the original D7 fix safe and must not regress: a real running server was verified live (see
      // `media/bootstrap.ts`'s file header) to have posts whose only image `src` values are exactly
      // these unsafe kinds, so silently starting to trust `src` would be a public security
      // regression, not a fix.
      //
      // REF nodes (new, ADR-027 §4's own stated `bodyJson` contract: "stores refs
      // `{assetId, transformName}`, never URLs") carry `attrs.assetId`/`attrs.transformName`
      // instead. Only THIS shape ever produces a real `<img src>`: the version is resolved against
      // `mediaTransformVersions` (populated by the route caller from the SAME `transform_registry`
      // row `/m/` itself reads — see `renderSite`'s doc), which is exactly the value the public
      // `/m/{assetId}/{transformName}.v{version}/...` URL needs. An id that fails
      // {@link isPlausibleMediaRefId}'s shape check, or a `transformName` with no entry in the map
      // (never registered, or not yet resolved), degrades to the identical placeholder a legacy
      // node gets — a ref node can be "wrong" but can never emit a malformed or unsafe URL.
      //
      // width/height/class (this task): looked up from `mediaAssetMetadata` by `assetId` ALONE
      // (never gated on whether the src itself resolved to a placeholder-vs-real image — an
      // unresolved ref already returns early via `mediaPlaceholder` below, so this lookup only ever
      // runs once a real `<img src>` is about to be emitted). Each attribute is emitted
      // independently and only when its value is non-null — an asset with only `width` set gets
      // `width="…"` alone, never a `height="0"` or empty `class=""`. Owner's explicit instruction:
      // width/height are BOTH optional; leaving either (or both) unset renders at native size, never
      // a computed/defaulted value.
      const attrs = isObject(node.attrs) ? node.attrs : {};
      const alt = typeof attrs.alt === "string" ? attrs.alt : "";
      const assetId = typeof attrs.assetId === "string" ? attrs.assetId : undefined;
      const transformName = typeof attrs.transformName === "string" ? attrs.transformName : undefined;
      if (assetId && transformName && isPlausibleMediaRefId(assetId) && isPlausibleMediaRefId(transformName)) {
        const version = mediaTransformVersions.get(transformName);
        if (version !== undefined) {
          const meta = mediaAssetMetadata.get(assetId);
          return renderImageTag({
            assetId,
            transformName,
            version,
            alt,
            width: meta?.width ?? null,
            height: meta?.height ?? null,
            cssClass: meta?.cssClass ?? null,
          });
        }
      }
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
    case "youtube": {
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
    case "mention": {
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
    case "widgetEmbed": {
      // REQ-18/REQ-21: a block-level atom node carrying a single widget-instance reference,
      // resolved server-side (by `resolvePageWidgets`, threaded in via `inlineResolved`) before this
      // content ever reaches a theme — the theme (declarative tier here, Liquid tier via
      // `liquid-worker.ts`'s `buildLiquidData` pre-computing `post.content`) never resolves a
      // `widgetEmbed` reference itself.
      const attrs = isObject(node.attrs) ? node.attrs : {};
      const placementId = typeof attrs.placementId === "string" ? attrs.placementId : undefined;
      const ir = placementId ? inlineResolved.get(placementId) : undefined;
      return renderWidgetIr(ir ?? WIDGET_PLACEHOLDER_IR);
    }
    default:
      return renderNodes(content, inlineResolved, mediaTransformVersions, mediaAssetMetadata);
  }
}

// ---------------------------------------------------------------------------
// Core component registry (v1) — the safe building blocks a theme references.
// A theme can arrange these by id; it cannot define new ones (that is a plugin).
// ---------------------------------------------------------------------------

type Component = (ctx: SiteRenderContext, props: JsonObject) => string;

function siteHeader(ctx: SiteRenderContext, props: JsonObject): string {
  const compact = props.compact === true;
  const tagline = !compact && typeof props.tagline === "string"
    ? `<p class="tagline">${escapeHtml(props.tagline)}</p>`
    : "";
  return `<header class="site-header"><div class="wrap"><a class="wordmark" href="/">${escapeHtml(ctx.siteTitle)}</a>${tagline}<nav class="site-nav"><a href="/">Home</a><a href="/admin/">Admin</a></nav></div></header>`;
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
 * `pageHtmlEmbeds`), that type having no entry in `resolved`, or a ref's `id` being `null` (missing
 * or invalid `id` key) all degrade identically to the public-safe REQ-28 marker — this function
 * never distinguishes "unresolved" from "unresolvable" from "never attempted", never a crash and
 * never literal, unresolved marker markup reaching a visitor.
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
  return substituteHtmlEmbeds(html, (ref) => {
    if (!isPageEmbedType(ref.type)) return undefined;
    const ir = (ref.id !== null ? resolved?.get(ref.type)?.get(ref.id) : undefined) ?? HTML_EMBED_PLACEHOLDER_IR;
    return renderWidgetIr(ir);
  });
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
 * @complexity O(1) for a `"doc"` post (delegates to `renderDocNode`'s own O(n)); O(n) over
 * `bodyHtml`'s length for an `"html"` Page (delegates to `renderHtmlPageBody`'s own single
 * substitution pass — this function never re-scans).
 * @overallScore 100
 */
function renderPostBody(ctx: SiteRenderContext): string {
  const post = ctx.post;
  if (!post) return "";
  if (post.bodyFormat === "html") return renderHtmlPageBody(post.bodyHtml ?? "", ctx.pageHtmlEmbeds);
  return renderDocNode(post.bodyJson, ctx.widgetInlineResolved, ctx.mediaTransformVersions, ctx.mediaAssetMetadata);
}

function entryContent(ctx: SiteRenderContext): string {
  if (!ctx.post) return "";
  return `<div class="wrap"><a class="back" href="/">← ${escapeHtml(ctx.siteTitle)}</a><article class="entry"><h1 class="entry-title">${escapeHtml(ctx.post.title)}</h1><p class="entry-meta">${escapeHtml(shortDate(ctx.post.updatedAt))}</p><div class="prose">${renderPostBody(ctx)}</div></article></div>`;
}

function siteFooter(ctx: SiteRenderContext): string {
  return `<footer class="site-footer"><div class="wrap"><span>${escapeHtml(ctx.siteTitle)} — powered by Tovu</span><span class="theme-badge">theme: ${escapeHtml(ctx.themeName)}</span></div></footer>`;
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
      return `<a class="${kind}" href="${escapeHtml(str(o.href, "#"))}">${escapeHtml(str(o.label, "Learn more"))}</a>`;
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
    ? ` <a class="topbar__link" href="${escapeHtml(str(link.href, "#"))}">${escapeHtml(str(link.label, "Learn more"))} →</a>`
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
      const href = escapeHtml(str(o.href, "#"));
      const children = arr(o.children);
      if (children.length) {
        const sub = children
          .map((c) => {
            const co = obj(c);
            if (!co) return "";
            return `<li><a href="${escapeHtml(str(co.href, "#"))}">${escapeHtml(str(co.label))}</a></li>`;
          })
          .join("");
        return `<li class="nav-item has-children"><a class="nav-link" href="${href}">${label}${caret}</a><ul class="nav-dropdown">${sub}</ul></li>`;
      }
      return `<li class="nav-item"><a class="nav-link" href="${href}">${label}</a></li>`;
    })
    .join("");
  const cta = obj(props.cta);
  const ctaHtml = cta
    ? `<a class="btn btn--primary nav-cta" href="${escapeHtml(str(cta.href, "#"))}">${escapeHtml(str(cta.label, "Get started"))}</a>`
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
      return `<a class="footer__social" href="${escapeHtml(str(o.href, "#"))}">${escapeHtml(str(o.label))}</a>`;
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
          return `<li><a href="${escapeHtml(str(lo.href, "#"))}">${escapeHtml(str(lo.label))}</a></li>`;
        })
        .join("");
      return `<div class="footer__col"><h4>${escapeHtml(str(o.title))}</h4><ul>${links}</ul></div>`;
    })
    .join("");
  const legal = escapeHtml(str(props.legal) || `© ${new Date().getFullYear()} ${str(props.brand) || ctx.siteTitle}`);
  return `<footer class="site-footer site-footer--rich"><div class="wrap footer__top"><div class="footer__brandcol"><a class="brand" href="/">${brand}</a>${blurb}<div class="footer__socials">${socials}</div></div><div class="footer__cols">${cols}</div></div><div class="wrap footer__bottom"><span>${legal}</span><span class="theme-badge">theme: ${escapeHtml(ctx.themeName)}</span></div></footer>`;
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

function renderWidgetEntrySummary(props: JsonObject): string {
  const slug = str(props.slug);
  const title = str(props.title);
  return `<li class="widget-entry-summary"><a href="/${escapeHtml(slug)}">${escapeHtml(title)}</a></li>`;
}

function renderWidgetRecentEntries(children: readonly WidgetRenderIR[] | undefined): string {
  const items = (children ?? []).map((child) => renderWidgetIr(child)).join("");
  return `<ul class="widget widget-recent-entries">${items || '<li class="widget-empty">No entries yet.</li>'}</ul>`;
}

/** Renders a `menu` widget's resolved nav items (`navigation/resolver.ts`'s `ResolvedNavItem[]`,
 * passed through as plain IR props) — mirrors `siteNav`'s own unavailable-link handling: an
 * `available:false` item renders as inert text, never a broken/empty href. */
function renderWidgetMenuItems(items: JsonValue[]): string {
  return items
    .map((item) => {
      const o = obj(item);
      if (!o) return "";
      const label = escapeHtml(str(o.label));
      const available = o.available === true && typeof o.href === "string";
      const link = available
        ? `<a href="${escapeHtml(safeHref(o.href))}">${label}</a>`
        : `<span class="widget-menu-item--unavailable">${label}</span>`;
      const children = arr(o.children);
      const sub = children.length ? `<ul>${renderWidgetMenuItems(children)}</ul>` : "";
      return `<li>${link}${sub}</li>`;
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

/** Renders a `contact-form` widget: Forms' own declared field vocabulary (REQ-37 — never a
 * hardcoded field-type list), posting to Forms' existing public route unmodified (`POST
 * /forms/:slug/submit`, `routes/site/forms-submit.ts`) — this widget type introduces no new
 * submission endpoint (REQ-39). */
function renderWidgetContactForm(props: JsonObject): string {
  const slug = str(props.slug);
  if (!slug) return renderWidgetPlaceholder();
  const fields = arr(props.fields)
    .map((f) => {
      const o = obj(f);
      if (!o) return "";
      const id = escapeHtml(str(o.id));
      const label = escapeHtml(str(o.label));
      const required = o.required === true;
      const kind = str(o.type, "text");
      const extraAttrs = renderExtraFieldAttrs(o);
      const inputEl =
        kind === "textarea"
          ? `<textarea name="${id}" id="widget-contact-${id}"${required ? " required" : ""}${extraAttrs}></textarea>`
          : kind === "checkbox"
            ? `<input type="checkbox" name="${id}" id="widget-contact-${id}"${required ? " required" : ""}${extraAttrs}/>`
            : `<input type="${kind === "email" ? "email" : "text"}" name="${id}" id="widget-contact-${id}"${required ? " required" : ""}${extraAttrs}/>`;
      return `<div class="widget-form-field"><label for="widget-contact-${id}">${label}${required ? " *" : ""}</label>${inputEl}</div>`;
    })
    .join("");
  return `<form class="widget widget-contact-form" method="post" action="/forms/${escapeHtml(slug)}/submit">${fields}<button type="submit">Send</button></form>`;
}

/** REQ-28: no internal detail, no stack trace, no configuration secret — the placeholder itself
 * carries nothing beyond a static, styleable marker. */
function renderWidgetPlaceholder(): string {
  return `<div class="widget widget-placeholder" aria-hidden="true"></div>`;
}

/**
 * Renders a resolved `data-embed-type="media"` Page embed (SPEC-047, generalized 2026-08-07) —
 * `resolver-service.ts`'s `resolveMediaTypeEmbeds` already did the I/O (asset lookup, transform
 * version lookup) and only ever puts a `"media-image"` IR into its result map once every value
 * below is a validated primitive, so this function's own `isPlausibleMediaRefId`/`typeof` checks
 * are defense-in-depth (mirrors `renderExtraFieldAttrs`'s own re-check-even-though-upstream-
 * validated precedent), not the primary guard. A malformed `props` shape — which should never
 * happen from this codebase's own resolver, only from some future/foreign IR producer — degrades to
 * the ordinary widget placeholder rather than emitting a malformed or unsafe `<img>` tag.
 *
 * `props.width`/`height`/`cssClass` come through as `JsonValue` (a `WidgetRenderIR.props` is
 * `JsonObject`, so `null` and `number` both need explicit narrowing) — normalized to
 * {@link renderImageTag}'s `number | null` / `string | null` contract before delegating, same
 * "own it once, reuse everywhere" split `renderImageTag`'s own doc describes.
 */
function renderWidgetMediaImage(props: JsonObject): string {
  const assetId = props.assetId;
  const transformName = props.transformName;
  const version = props.version;
  if (
    typeof assetId !== "string" ||
    typeof transformName !== "string" ||
    typeof version !== "number" ||
    !isPlausibleMediaRefId(assetId) ||
    !isPlausibleMediaRefId(transformName)
  ) {
    return renderWidgetPlaceholder();
  }
  const width = typeof props.width === "number" ? props.width : null;
  const height = typeof props.height === "number" ? props.height : null;
  const cssClass = typeof props.cssClass === "string" ? props.cssClass : null;
  return renderImageTag({ assetId, transformName, version, alt: str(props.alt), width, height, cssClass });
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
    html: renderNodes(innerContent, EMPTY_INLINE_RESOLVED, EMPTY_MEDIA_TRANSFORM_VERSIONS, EMPTY_MEDIA_ASSET_METADATA),
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

/** Same reconstruction as {@link readMediaTransformVersions}, for `mediaAssetMetadata` — see that
 *  function's own doc for why this crosses the `widgets/`-to-`render.ts` boundary as plain JSON
 *  rather than a real `Map`. A malformed per-asset entry (not an object) is skipped, not thrown;
 *  missing `width`/`height`/`cssClass` fields degrade to `null` ("not set"), matching
 *  {@link MediaAssetRenderMeta}'s own "`null` means not set, not zero" contract. */
function readMediaAssetMetadata(value: JsonValue | undefined): ReadonlyMap<string, MediaAssetRenderMeta> {
  if (!isObject(value)) return EMPTY_MEDIA_ASSET_METADATA;
  const entries: [string, MediaAssetRenderMeta][] = [];
  for (const [assetId, raw] of Object.entries(value)) {
    if (!isObject(raw)) continue;
    entries.push([
      assetId,
      {
        width: typeof raw.width === "number" ? raw.width : null,
        height: typeof raw.height === "number" ? raw.height : null,
        cssClass: typeof raw.cssClass === "string" ? raw.cssClass : null,
      },
    ]);
  }
  return entries.length > 0 ? new Map(entries) : EMPTY_MEDIA_ASSET_METADATA;
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
function renderWidgetPostContent(props: JsonObject): string {
  const title = props.title;
  const bodyJson = props.bodyJson;
  if (typeof title !== "string" || bodyJson === undefined) return renderWidgetPlaceholder();
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
  return (
    `<div class="post-detail-header">` +
    titleHtml +
    (dateLabel ? `<div class="post-meta"><time datetime="${escapeHtml(updatedAt)}">${escapeHtml(dateLabel)}</time></div>` : "") +
    `</div>` +
    `<div class="post-detail-body">${renderDocNode(bodyJson, EMPTY_INLINE_RESOLVED, mediaTransformVersions, mediaAssetMetadata)}</div>`
  );
}

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
  switch (ir.componentId) {
    case "text":
      return `<div class="widget widget-text">${escapeHtml(str(ir.props.body)).replaceAll("\n", "<br/>")}</div>`;
    case "social-links":
      return renderWidgetSocialLinks(ir.props);
    case "recent-entries":
      return renderWidgetRecentEntries(ir.children);
    case "entry-summary":
      return renderWidgetEntrySummary(ir.props);
    case "menu":
      return renderWidgetMenu(ir.props);
    case "contact-form":
      return renderWidgetContactForm(ir.props);
    case "media-image":
      return renderWidgetMediaImage(ir.props);
    case "post-content":
      return renderWidgetPostContent(ir.props);
    case "widget-placeholder":
    default:
      return renderWidgetPlaceholder();
  }
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
    // `price` stays in cents — themes format it themselves; `priceFormatted` is precomputed here so
    // a theme can just read one field.
    products: ctx.products.map((p) => ({ id: p.id, title: p.title, price: p.price, priceFormatted: formatCents(p.price), stock: p.stock })),
    product: ctx.product
      ? { id: ctx.product.id, title: ctx.product.title, price: ctx.product.price, priceFormatted: formatCents(ctx.product.price), stock: ctx.product.stock }
      : null,
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

function renderBlock(node: TemplateNode, ctx: SiteRenderContext): string {
  if (!isObject(node)) return "";

  if (node.type === "component") {
    const id = typeof node.id === "string" ? node.id : "";
    const component = COMPONENTS[id];
    if (!component) return `<!-- unknown component: ${escapeHtml(id)} -->`;
    return component(ctx, isObject(node.props) ? node.props : {});
  }

  if (node.type === "slot") {
    return renderSlot(typeof node.name === "string" ? node.name : "", ctx);
  }

  // SPEC-043/ADR-047 W-004: `{"type":"region","key":"footer"}` — a theme-authored reference to a
  // theme-declared widget region (REQ-13/`ThemeManifest.regions`), resolved server-side ahead of
  // this walk (`resolvePageWidgets`, threaded in via `ctx.widgetRegions`). Checked before the
  // generic doc-vocabulary fallthrough so a region node is never mistaken for unknown content-doc
  // vocabulary (which would try to walk its `content`, not its `key`).
  if (node.type === "region") {
    return renderWidgetRegion({ ctx, regionKey: typeof node.key === "string" ? node.key : "" });
  }

  if (node.type === "doc") {
    return (Array.isArray(node.content) ? node.content : []).map((child) => renderBlock(child, ctx)).join("");
  }

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
 * `extraHead` is `page-head.ts`'s `serializeHeadElements()` output (SPEC-008
 * ADR-PIPE-008 T048) — already-escaped markup, inserted verbatim. When it
 * contains its own `<title>` (SEO's fold always emits one, per
 * `page-head-contributor.ts`'s priority-100 title element), this shell's own
 * hardcoded `<title>` is suppressed rather than emitting two competing tags.
 */
function pageShell(required: {
  title: string;
  theme: DiscoveredTheme;
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
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
${titleTag}
${extraHead ?? ""}
${fontLink(theme)}
<style>${BASE_STYLE}${tokensToCss(theme.tokens)}${theme.css}</style>
${siteAssistant.head}
</head>
<body>
<div class="site" data-theme="${escapeHtml(theme.manifest.id)}">${required.body}</div>
${siteAssistant.body}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

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
export async function renderSite(required: {
  theme: DiscoveredTheme;
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
}): Promise<string> {
  const { theme, route } = required;
  const ctx: SiteRenderContext = {
    siteTitle: required.siteTitle,
    route,
    posts: required.posts,
    post: required.post,
    products: required.products ?? [],
    product: required.product,
    themeName: theme.manifest.name,
    widgetRegions: required.widgets?.regions ?? {},
    widgetInlineResolved: required.widgets?.inlineResolved ?? EMPTY_INLINE_RESOLVED,
    mediaTransformVersions: required.mediaTransformVersions ?? EMPTY_MEDIA_TRANSFORM_VERSIONS,
    mediaAssetMetadata: required.mediaAssetMetadata ?? EMPTY_MEDIA_ASSET_METADATA,
    pageHtmlEmbeds: required.pageHtmlEmbeds,
  };

  // `products`/`product` have no dedicated fallback component (no theme built so far lacks them,
  // and every OTHER theme simply never routes here) — degrade to the same entry-list/entry-content
  // shape post/home already fall back to, so an unsupported theme still renders *something* instead
  // of relying on a component that doesn't exist (REQ-10 spirit: never a raw crash).
  const fallbackBody = (): string =>
    `${siteHeader(ctx, {})}${route === "post" || route === "product" ? entryContent(ctx) : entryList(ctx, {})}${siteFooter(ctx)}`;

  // Static tier: unlike every other branch below, a static theme's page is already a complete
  // `<!doctype html>` document (tokens, nav, footer, scripts — all of it), not a body fragment
  // `pageShell()` still needs to wrap. Returned directly, bypassing pageShell, when the theme has
  // one for this route. Home only for now — anything else (including a missing pages/index.html)
  // falls through to the existing fallbackBody()/pageShell() path below, same as any other
  // unresolved route on any other tier.
  if (theme.manifest.tier === "static" && route === "home") {
    const staticHtml = renderStaticPage({ theme, pageId: "index", menus: required.staticMenus });
    if (staticHtml) return staticHtml;
  }

  let body: string;
  if (theme.manifest.tier === "templated") {
    const liquidId = resolveLiquidTemplateId({ route, liquidTemplates: theme.liquidTemplates });
    const source = liquidId ? theme.liquidTemplates[liquidId] : undefined;
    try {
      body = source
        ? await renderLiquidInSandbox({ source, ctx, skipLiquidAllowlist: theme.manifest.skipLiquidAllowlist })
        : fallbackBody();
    } catch (err) {
      // A broken/hostile Liquid template must not 500 the site (SPEC-004
      // REQ-10 spirit) — covers a syntax error, a disallowed tag/filter the
      // worker's defensive re-lint caught, or a sandbox timeout/OOM.
      body = `<!-- theme render error: ${escapeHtml((err as Error).message)} -->${fallbackBody()}`;
    }
  } else if (theme.manifest.tier === "handlebars") {
    // Same contract as the Liquid branch above, engine swapped: resolve the
    // route to a `.hbs` template, render it inside its own `worker_threads`
    // sandbox, and degrade to the built-in fallback body on ANY failure — a
    // syntax error, a disallowed helper/partial/raw-output the worker's
    // defensive re-lint caught, or a sandbox timeout/OOM. Never a 500.
    const hbsId = resolveHandlebarsTemplateId({ route, handlebarsTemplates: theme.handlebarsTemplates });
    const source = hbsId ? theme.handlebarsTemplates[hbsId] : undefined;
    try {
      body = source ? await renderHandlebarsInSandbox({ source, ctx }) : fallbackBody();
    } catch (err) {
      body = `<!-- theme render error: ${escapeHtml((err as Error).message)} -->${fallbackBody()}`;
    }
  } else {
    const templateId = resolveTemplateId({ route, templates: theme.templates });
    const tree = templateId ? theme.templates[templateId] : undefined;
    body = tree ? renderBlock(tree, ctx) : fallbackBody();
  }

  const title = route === "post" && required.post
    ? `${required.post.title} — ${required.siteTitle}`
    : required.siteTitle;

  return pageShell({ title, theme, body, extraHead: required.extraHead, siteAssistantEnabled: required.siteAssistantEnabled });
}

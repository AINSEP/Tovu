/**
 * @file The ONE parser for embed markers (`data-embed-config`), shared by every consumer.
 *
 * Purpose:
 * Before the 2026-08-10 marker-spine unification there were four independent scanners, each with its
 * own regex, matching two different attribute vocabularies that had drifted apart:
 *
 * - `widgets/html-embeds.ts` — `data-embed-type`/`data-embed-id` in a Page's `body_html`
 * - `features/theme/static-render.ts` — the same pair for menu/post markers, PLUS
 *   `data-tovu-slot`/`data-nav-current`/`data-slot-variant` for theme partials
 * - `core/entry-refs/extractor.ts` — the same pair again, for reference extraction
 *
 * Four regexes for one concept is four places a fix has to land and four ways they can disagree
 * (they already did: the widgets pipeline only matched a self-closing `<div></div>`, while the theme
 * path deliberately matched a marker WITH authored fallback content inside it). This module is the
 * single definition. Consumers ask it what a piece of HTML references; none of them owns a pattern.
 *
 * The vocabulary is one attribute carrying JSON:
 *
 *     <div data-embed-config='{"type":"partial","id":"nav","current":"index"}'></div>
 *     <nav data-embed-config='{"type":"menu","id":"docs-nav","variant":"tree"}'>fallback</nav>
 *
 * `type` and `id` are ordinary keys, not separate attributes, so a new key never requires a new
 * attribute name. The attribute is single-quoted precisely so the JSON's own double quotes need no
 * escaping.
 *
 * Architectural role:
 * PURE. No I/O, no DOM, no resolution — it reports what a marker *says*, never what it resolves to.
 * Lives in `core/` because all three consumers above sit in different features and `core/entry-refs`
 * (the integrity path) is already here.
 *
 * ## Why regex and not a parser
 *
 * Same reason the code it replaces used one: this runs server-side against theme-authored markup and
 * Page bodies with no DOM available, and every consumer needs the marker's *source offsets* to
 * substitute in place. A real HTML parse would also have to round-trip the document back to a string
 * byte-identically, which is a much harder guarantee than locating one attribute.
 */

/** A `data-embed-config` marker located in a piece of HTML. */
export interface EmbedMarker {
  /** `config.type` — which resolver handles this. Always present; a marker without it is invalid. */
  readonly type: string;
  /**
   * `config.id` — which instance. `undefined` for a type that needs no target (none today, but the
   * shape allows one rather than forcing a meaningless id).
   */
  readonly id: string | undefined;
  /** The whole parsed object, `type`/`id` included, so a resolver reads its own keys off one place. */
  readonly config: Readonly<Record<string, unknown>>;
  /** The marker element's tag name, for consumers that rebuild the open tag. */
  readonly tag: string;
  /** The marker's attribute string, verbatim, so other authored attributes survive a substitution. */
  readonly attrs: string;
  /** The full matched element including its inner content and closing tag. */
  readonly whole: string;
  /**
   * The marker's own original inner content (between its open and close tag), exactly as authored.
   * The mirror image of {@link withInnerContent}'s parameter: that function takes NEW inner content
   * and keeps the marker's existing tag/attrs; this field is for a caller going the other way —
   * keeping (or transforming) the marker's existing inner content while changing its attrs/config,
   * e.g. {@link withAddedId} filling in a missing `id` without disturbing whatever fallback markup
   * the author put inside the marker.
   */
  readonly inner: string;
  /** Index of `whole` within the scanned html — substitution without re-searching. */
  readonly index: number;
  /** 1-based position among all markers found, for stable locators (`entry_refs` `fieldPath`). */
  readonly occurrence: number;
}

/** Why a marker was rejected. Consumers decide whether to warn, skip, or refuse a write. */
export type EmbedMarkerProblem =
  | { readonly kind: "invalid-json"; readonly raw: string; readonly message: string }
  | { readonly kind: "not-an-object"; readonly raw: string }
  | { readonly kind: "missing-type"; readonly raw: string };

/** One rejected marker, with enough context to name it in an error a human can act on. */
export interface EmbedMarkerRejection {
  readonly problem: EmbedMarkerProblem;
  readonly occurrence: number;
  readonly index: number;
}

export interface ScanEmbedMarkersResult {
  readonly markers: readonly EmbedMarker[];
  /**
   * Markers that carry the attribute but could not be understood. **Never silently empty-on-error**:
   * `entry-refs/extractor.ts` builds the where-used index that safe-delete trusts, and a marker that
   * fails to parse would otherwise drop a reference from that index without a trace — letting a
   * delete proceed against something still in use. Extraction and the write chokepoint must treat a
   * non-empty `rejected` as loud; render-time consumers may degrade quietly.
   */
  readonly rejected: readonly EmbedMarkerRejection[];
}

/**
 * Matches one element carrying `data-embed-config`, capturing its tag, attributes, and inner content
 * up to the matching close tag. The backreferenced closing tag (`<\/\1>`) is safe for a marker with
 * no same-named descendant — true for every marker convention in this codebase, and the same
 * assumption `injectMenuEmbed` documented before this module existed.
 *
 * Inner content is captured (rather than requiring an empty element) because a theme marker's
 * authored content is a real fallback that must survive when nothing resolves. The widgets pipeline
 * previously required `<div ...></div>` with nothing between the tags, which is exactly why it could
 * not be used for theme markers; unifying on the permissive form removes that split.
 */
const MARKER_PATTERN = /<([a-z]+)((?:\s+[^>]*?)?\sdata-embed-config='([^']*)'(?:\s+[^>]*?)?)\s*>([\s\S]*?)<\/\1>/gi;

/**
 * Validate one marker's raw attribute text. Split out from {@link scanEmbedMarkers} so the scan stays
 * a plain loop: all three rejection branches live here, and the caller only chooses which list to
 * push onto.
 */
function parseMarkerConfig(raw: string): { config: Record<string, unknown> } | { problem: EmbedMarkerProblem } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { problem: { kind: "invalid-json", raw, message: (err as Error).message } };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { problem: { kind: "not-an-object", raw } };
  }
  const config = parsed as Record<string, unknown>;
  if (typeof config.type !== "string" || config.type === "") {
    return { problem: { kind: "missing-type", raw } };
  }
  return { config };
}

/** Locate and parse every embed marker in `html`. Pure; allocates one result per marker. */
export function scanEmbedMarkers(html: string): ScanEmbedMarkersResult {
  const markers: EmbedMarker[] = [];
  const rejected: EmbedMarkerRejection[] = [];
  let occurrence = 0;

  for (const match of html.matchAll(MARKER_PATTERN)) {
    occurrence += 1;
    const [whole, tag, attrs, raw, inner] = match as unknown as [string, string, string, string, string];
    const index = match.index ?? 0;
    const result = parseMarkerConfig(raw);

    if ("problem" in result) {
      rejected.push({ problem: result.problem, occurrence, index });
      continue;
    }
    const { config } = result;
    markers.push({
      type: config.type as string,
      id: typeof config.id === "string" ? config.id : undefined,
      config,
      tag,
      attrs,
      whole,
      inner,
      index,
      occurrence,
    });
  }

  return { markers, rejected };
}

/** Every marker of one type, in document order. The common "which menus does this theme name" shape. */
export function markersOfType(html: string, type: string): readonly EmbedMarker[] {
  return scanEmbedMarkers(html).markers.filter((m) => m.type === type);
}

/**
 * The two marker `type` values this module parses but never itself resolves — owned end-to-end by
 * `features/theme/static-render.ts` (`injectMenuEmbeds` for {@link MENU_MARKER_TYPE}, `resolveSlots`
 * for {@link PARTIAL_MARKER_TYPE}), which run AFTER `widgets/resolver-service.ts`'s page-embed stage
 * on every static-tier page render.
 *
 * Hoisted here (2026-08-17) so that ownership fact has exactly one spelling. Before this, it existed
 * only as inline string-literal comparisons inside `static-render.ts` itself
 * (`marker.type !== "menu"`, `marker.type !== "partial"`), and `resolver-service.ts`'s own
 * `THEME_OWNED_MARKER_TYPES` carried an independently-typed copy of the same two strings as a
 * documented stopgap pending this exact hoist (`ADS-memory/reports/
 * 2026-08-16-embed-placeholder-gap.md`, "Reuse decision") — two spellings of one fact is exactly the
 * kind of drift risk this module exists to close for marker *parsing*; these two constants close it
 * for marker *type naming* the same way.
 *
 * Deliberately NOT the same question `isPageEmbedType()` (`widgets/resolver-service.ts`) answers —
 * that function tests registry membership (`Object.hasOwn(HTML_EMBED_RESOLVERS, type)`), which is
 * `false` for these two AND for a genuine unregistered/typo type alike. These constants name the
 * "owned elsewhere, not a typo" fact directly instead; see `isPageEmbedType`'s own doc for why
 * conflating the two would silence a real warning.
 */
export const MENU_MARKER_TYPE = "menu";
export const PARTIAL_MARKER_TYPE = "partial";

/**
 * The post-previews marker type (2026-09-03) — a theme/page marker that renders a bounded list of
 * published post previews wherever it appears, so any authored Page (a static theme's own marketing
 * page, or a Page/Post rendered through a `theme.json` `templates` entry) can host a post listing.
 * Same ownership shape as {@link MENU_MARKER_TYPE}/{@link PARTIAL_MARKER_TYPE} immediately above:
 * resolved end-to-end by `features/theme/static-render.ts`'s `injectPostPreviewsEmbeds`, never
 * registered in `widgets/resolver-service.ts`'s `HTML_EMBED_RESOLVERS` — see that file's
 * `THEME_OWNED_MARKER_TYPES`, which carries a matching literal entry for the same disclosed
 * "duplicated, not imported" reason its own doc already states for the other two.
 *
 * Config shape: `{"type":"post-previews","limit":6}` — `limit` is optional (defaults to
 * `DEFAULT_POST_PREVIEWS_LIMIT`, `static-render.ts`) and is always clamped, never trusted verbatim,
 * before it reaches the bounded repo query that feeds this marker.
 */
export const POST_PREVIEWS_MARKER_TYPE = "post-previews";

/**
 * Rebuild a marker's element around new inner content, keeping its own tag and every authored
 * attribute (`class`, `aria-label`, …). The counterpart to a wholesale replace: a menu marker keeps
 * its `<nav class="docs-nav">` wrapper and only swaps what's inside, whereas a partial slot marker
 * disappears entirely and is replaced by the partial.
 *
 * Synthesizing the open tag from `config` alone instead of using this is a silent bug — it drops the
 * theme's styling hooks and accessible names with nothing failing.
 */
export function withInnerContent(marker: EmbedMarker, inner: string): string {
  return `<${marker.tag}${marker.attrs}>${inner}</${marker.tag}>`;
}

/**
 * Rebuild a marker's element with `id` added to its `data-embed-config`, keeping every other
 * authored config key, the marker's own tag, its other attributes, and its authored inner content
 * ({@link EmbedMarker.inner}) completely unchanged. The counterpart to {@link withInnerContent} for a
 * caller that needs to SUPPLY a marker's target rather than its content — e.g. the unified `content`
 * marker (2026-08-11): a theme-authored `{"type":"content"}` with no `id` means "the entity the route
 * already resolved", and the route fills that id in here before the marker is ever resolved, so every
 * downstream consumer (the scanner, the resolver, a later re-scan) sees an ordinary id-carrying marker
 * rather than needing its own "no id means current entity" special case.
 *
 * Callers must check `marker.id === undefined` themselves before calling this — an author's own
 * explicit id always wins over a caller-supplied default, and this function does not re-check that
 * (it would silently overwrite an explicit reference otherwise, which is the one thing the unified
 * marker's id-vs-no-id contract must never do).
 *
 * @complexity O(n) over the marker's own attrs length (one JSON stringify of a small object, one
 * regex replace over `attrs`) — independent of the surrounding document's size.
 */
export function withAddedId(marker: EmbedMarker, id: string): string {
  const config = JSON.stringify({ ...marker.config, id });
  const attrsWithId = marker.attrs.replace(/data-embed-config='[^']*'/, `data-embed-config='${config}'`);
  return `<${marker.tag}${attrsWithId}>${marker.inner}</${marker.tag}>`;
}

/**
 * Rebuild a marker's element around new inner content, like {@link withInnerContent}, but ALSO strips
 * the marker's own `data-embed-config` attribute from the rebuilt tag — every other authored attribute
 * (`class`, `aria-label`, …) survives, only the marker-ness is removed.
 *
 * For a caller that performs its OWN final resolution outside the shared registry/render pipeline
 * (`pages.ts`'s recursive `content`-marker pre-splice, which fetches and inlines an `"html"`-format
 * entity's own body ahead of the normal `resolveHtmlPageEmbeds`/`renderHtmlPageBody` pass) and must
 * guarantee the result is not rediscovered and re-resolved by a LATER marker scan over the same output
 * — an ordinary {@link withInnerContent} splice would leave `data-embed-config` intact, and the next
 * scan would see what looks like a fresh, unresolved marker and try to resolve it again.
 *
 * @complexity O(n) over the marker's own attrs length (one regex replace) — independent of the
 * surrounding document's size.
 */
export function withInnerContentFinal(marker: EmbedMarker, inner: string): string {
  const attrsWithoutMarker = marker.attrs.replace(/\s*data-embed-config='[^']*'/, "");
  return `<${marker.tag}${attrsWithoutMarker}>${inner}</${marker.tag}>`;
}

/**
 * Replace each marker's WHOLE element with what `resolve` returns for it.
 *
 * Whole-element rather than inner-content because the two consumers genuinely differ: a partial slot
 * marker is scaffolding that vanishes once the partial is spliced in, while a menu marker is real
 * theme markup that must survive with only its contents swapped. Callers in the second camp wrap
 * their output in {@link withInnerContent}; making that explicit at the call site is better than a
 * mode flag, because the choice is a real per-type decision and not a preference.
 *
 * `resolve` returning `undefined` means "leave this marker exactly as authored", and that default is
 * load-bearing: a menu that does not exist, a target that was deleted, or a render that produces
 * nothing must fall back to the theme's authored content rather than blanking a nav. Every consumer
 * wants that rule, so it lives here rather than being re-implemented per call site.
 *
 * Applies right-to-left so each splice leaves the earlier markers' offsets valid.
 */
export function substituteMarkers(
  html: string,
  resolve: (marker: EmbedMarker) => string | undefined
): string {
  const { markers } = scanEmbedMarkers(html);
  let out = html;
  for (let i = markers.length - 1; i >= 0; i -= 1) {
    const m = markers[i];
    const replacement = resolve(m);
    if (replacement === undefined) continue;
    out = out.slice(0, m.index) + replacement + out.slice(m.index + m.whole.length);
  }
  return out;
}

/**
 * Human-readable one-liner for a rejection, for a warning line or a write-time validation error.
 * Deliberately quotes the offending JSON: the author needs to see what they typed, and the raw text
 * is theme- or admin-authored, never end-user input.
 */
export function describeRejection(rejection: EmbedMarkerRejection): string {
  const { problem, occurrence } = rejection;
  const where = `embed marker #${occurrence}`;
  if (problem.kind === "invalid-json") return `${where}: data-embed-config is not valid JSON (${problem.message}) — ${problem.raw}`;
  if (problem.kind === "not-an-object") return `${where}: data-embed-config must be a JSON object — ${problem.raw}`;
  return `${where}: data-embed-config is missing a "type" — ${problem.raw}`;
}

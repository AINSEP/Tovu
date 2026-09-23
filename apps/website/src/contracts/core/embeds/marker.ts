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
 * Matches the OPEN tag of one element carrying `data-embed-config`, capturing its tag name and its
 * attribute text. It stops at the open tag's own `>` and makes no assumption about what closes it —
 * {@link scanEmbedMarkers} locates the matching close tag separately, via {@link findBalancedClose}'s
 * depth count over the masked html.
 *
 * Before 2026-09-23 this pattern captured inner content itself, up to a backreferenced `<\/\1>`. That
 * was only safe for a marker with no same-named descendant — true for every marker convention in this
 * codebase at the time, and the same assumption `injectMenuEmbed` documented before this module
 * existed — but it meant `<div data-embed-config='...'><div>…</div></div>` (an inner element sharing
 * the marker's own tag name) closed at the FIRST `</div>`, truncating the marker's real inner content.
 * {@link findBalancedClose} removes that assumption by counting depth instead of matching nearest text.
 *
 * The tag name pattern (`[a-z][a-z0-9-]*`) accepts any HTML element name, including a custom element
 * (`<my-card>`), not just the historical letters-only set.
 *
 * Carries the `d` (`hasIndices`) flag so {@link scanEmbedMarkers} can read every field back out of
 * the ORIGINAL html at each capture group's own offsets, rather than out of whatever string was
 * actually scanned (see {@link maskNonRenderableRegions}) — see that function's doc for why the two
 * must never be the same string.
 */
const MARKER_PATTERN = /<([a-z][a-z0-9-]*)((?:\s+[^>]*?)?\sdata-embed-config='([^']*)'(?:\s+[^>]*?)?)\s*>/gid;

/** Every character of `text` replaced by a space, except newlines (left alone so a masked span
 * cannot change how many lines the surrounding string has). Same length in, same length out. */
function blank(text: string): string {
  return text.replace(/[^\n]/g, " ");
}

/** An HTML comment, open to close, non-greedy so two separate comments never merge into one span. */
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

/** A `<script>` or `<style>` element, capturing its tag name (for the backreferenced close) and its
 * raw-text content — the part a browser never parses as markup. */
const RAW_TEXT_ELEMENT_PATTERN = /<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi;

/**
 * Produce a same-length copy of `html` with every HTML comment, and the raw-text content of every
 * `<script>`/`<style>` element, replaced by space filler. {@link scanEmbedMarkers} runs
 * {@link MARKER_PATTERN} against this copy — never the original — so a well-formed
 * `data-embed-config` marker written inside an authoring note (`<!-- ... -->`) or inside a
 * `<style>` block's CSS comment can never be matched: neither is ever parsed as an element by a
 * browser, so the scanner must not treat either as one either. A marker outside both is untouched
 * here and matches exactly as before.
 *
 * Same length is load-bearing, not cosmetic: every offset {@link scanEmbedMarkers} reports (and
 * {@link substituteMarkers}'s index-based splice back into the ORIGINAL html) depends on a masked
 * span occupying exactly the same positions as what it replaces. Deleting the comment/raw-text
 * content instead of blanking it would shift every later offset out from under those callers.
 *
 * EXPORTED (2026-09-09) for `features/pages/regions.ts`, which scans the SAME page bodies for
 * `data-agent-element` region elements and needs the identical "text inside a comment or inside a
 * <style> block is not markup" rule with the identical offset-preserving guarantee. A second copy
 * of this masking is exactly the four-scanners-for-one-concept drift this module's own header
 * exists to close: region scanning is a different question about the same bytes, not a second
 * vocabulary.
 */
export function maskNonRenderableRegions(html: string): string {
  const withoutComments = html.replace(HTML_COMMENT_PATTERN, blank);
  return withoutComments.replace(RAW_TEXT_ELEMENT_PATTERN, (whole, tagName: string, content: string) => {
    const closingTagLength = tagName.length + 3; // "</" + tagName + ">"
    const openTagLength = whole.length - content.length - closingTagLength;
    return whole.slice(0, openTagLength) + blank(content) + whole.slice(openTagLength + content.length);
  });
}

/**
 * One capture group's `[start, end)` offsets from a `d`-flagged match's `indices` array. Throws
 * rather than returning `undefined` for a group `MARKER_PATTERN` never leaves unmatched — every
 * group here sits on a mandatory part of the pattern, never inside an optional alternation, so a
 * missing entry means the pattern changed underneath this function, not a normal runtime path.
 */
function requireGroupRange(indices: RegExpIndicesArray, group: number): readonly [number, number] {
  const range = indices[group];
  if (!range) {
    throw new Error(`marker.ts: expected capture group ${group} of MARKER_PATTERN to participate in the match`);
  }
  return range;
}

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

/** A tag token's `[start, end)` span in the masked html — from its `<` through its first `>`. */
type TagSpan = readonly [number, number];

/**
 * Every `<tagName`/`</tagName` token in `masked` from `fromIndex` onward, in document order. The
 * boundary lookahead (`[\s/>]`) stops `<my-card` matching a longer name like `<my-card-extra`; each
 * token ends at its first `>`, and the scan resumes there, so a token's own attribute text is never
 * re-read as another token. Stops at a trailing malformed tag with no `>` at all.
 *
 * Runs against the MASKED copy only, so a tag written inside a comment or a `<script>`/`<style>`
 * element's raw text (already blanked by {@link maskNonRenderableRegions}) is invisible here,
 * exactly as it is invisible to {@link MARKER_PATTERN} itself.
 *
 * @complexity O(n) over the remaining length of `masked`.
 */
function* tagTokens(masked: string, tagName: string, fromIndex: number): Generator<{ readonly isClose: boolean; readonly span: TagSpan }> {
  const token = new RegExp(`<(/?)${tagName}(?=[\\s/>])`, "gi");
  token.lastIndex = fromIndex;
  for (let match = token.exec(masked); match !== null; match = token.exec(masked)) {
    const closeAngle = masked.indexOf(">", match.index);
    if (closeAngle === -1) return;
    yield { isClose: match[1] === "/", span: [match.index, closeAngle + 1] };
    token.lastIndex = closeAngle + 1;
  }
}

/**
 * The depth-balanced close for the open tag whose match ended at `fromIndex`, by counting
 * {@link tagTokens} from there: `<div><div>…</div></div>` closes at the tag that actually balances the
 * one already open, not at the first `</div>` found. Falls back to the first close found when the
 * region never rebalances (a genuinely unclosed inner tag) — the result the old backreferenced pattern
 * produced, so malformed markup degrades as it did before. `null` when there is no close at all.
 *
 * Only {@link findBalancedClose}'s fallback for an open tag {@link indexTagTokens} tokenized
 * differently (its JSON config holds a `>`); every other lookup is answered from that index.
 *
 * @complexity O(n) over the remaining length of `masked`.
 */
function scanForBalancedClose(masked: string, tagName: string, fromIndex: number): TagSpan | null {
  let depth = 1;
  let firstClose: TagSpan | null = null;
  for (const { isClose, span } of tagTokens(masked, tagName, fromIndex)) {
    if (!isClose) {
      depth += 1;
      continue;
    }
    firstClose ??= span;
    depth -= 1;
    if (depth === 0) return span;
  }
  return firstClose;
}

/** One tag name's tokens over the whole masked html, paired once with a stack. */
interface TagTokenIndex {
  /** Each open token's start → the span of the close that balances it, or `null` if none does. */
  readonly partners: ReadonlyMap<number, TagSpan | null>;
  /** Every close token's span, in document order (so sorted by start). */
  readonly closes: readonly TagSpan[];
}

/**
 * Pairs every `<tagName`/`</tagName` token in `masked` in ONE pass. Stack pairing gives each open the
 * same close {@link scanForBalancedClose}'s depth count from that open would find (both match a close
 * with the nearest still-open tag), but for every open at once — so a page of k unbalanced markers
 * costs O(n), not the O(k·n) of rescanning to the end of the document once per marker.
 *
 * @complexity O(n) time, O(t) space for t tokens.
 */
function indexTagTokens(masked: string, tagName: string): TagTokenIndex {
  const partners = new Map<number, TagSpan | null>();
  const closes: TagSpan[] = [];
  const openStarts: number[] = [];
  for (const { isClose, span } of tagTokens(masked, tagName, 0)) {
    if (!isClose) {
      partners.set(span[0], null);
      openStarts.push(span[0]);
      continue;
    }
    closes.push(span);
    const opener = openStarts.pop();
    if (opener !== undefined) partners.set(opener, span);
  }
  return { partners, closes };
}

/** The first span in `closes` (sorted by start) starting at or after `fromIndex`, or `null`.
 * @complexity O(log c) — binary search. */
function firstCloseFrom(closes: readonly TagSpan[], fromIndex: number): TagSpan | null {
  let low = 0;
  let high = closes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (closes[mid][0] < fromIndex) low = mid + 1;
    else high = mid;
  }
  return closes[low] ?? null;
}

/**
 * The `[start, end)` span (in `masked`) of the close tag that balances the marker open tag spanning
 * `[openStart, openEnd)` — see {@link scanForBalancedClose} for the balancing and first-close
 * fallback rules — or `null` when no close exists at all (a void element such as `<img>`, or an
 * unclosed marker): the caller then treats the open tag alone as the whole marker, rather than
 * letting it swallow the rest of the document.
 *
 * Answers from a per-tag-name {@link indexTagTokens} built once per scan and kept in `cache`. When
 * that index tokenized this open tag differently from the marker pattern (the index ends a tag at its
 * first `>`, and a `>` inside the JSON config ends it early), it falls back to the exact linear count.
 *
 * @complexity O(log c) amortized once the tag name's O(n) index exists; O(n) on the fallback.
 */
function findBalancedClose(
  masked: string,
  tag: { readonly name: string; readonly openStart: number; readonly openEnd: number },
  cache: Map<string, TagTokenIndex>,
): TagSpan | null {
  const key = tag.name.toLowerCase();
  let index = cache.get(key);
  if (index === undefined) {
    index = indexTagTokens(masked, key);
    cache.set(key, index);
  }
  const partner = index.partners.get(tag.openStart);
  const aligned = partner !== undefined && masked.indexOf(">", tag.openStart) + 1 === tag.openEnd;
  if (!aligned) return scanForBalancedClose(masked, key, tag.openEnd);
  return partner ?? firstCloseFrom(index.closes, tag.openEnd);
}

/**
 * Locate and parse every embed marker in `html`. Pure; allocates one result per marker.
 *
 * Scans {@link maskNonRenderableRegions}'s masked copy so a marker sitting inside an HTML comment or
 * a `<script>`/`<style>` element's raw text is never matched, and so tags inside either are invisible
 * to {@link findBalancedClose}'s depth count too. Every field on the resulting {@link EmbedMarker}
 * (`whole`, `tag`, `attrs`, `inner`, the parsed config) is read back out of the ORIGINAL `html` at
 * that match's own offsets — masking only decides which spans are eligible to be a marker or to count
 * toward a close tag's depth, it must never change what an eligible marker's own fields report.
 *
 * Uses a private copy of {@link MARKER_PATTERN} (same source/flags) for the `exec` loop below, rather
 * than mutating the shared module-level regex's `lastIndex` directly — this function is PURE, and a
 * shared mutable scan cursor would corrupt a reentrant or recursive call.
 */
export function scanEmbedMarkers(html: string): ScanEmbedMarkersResult {
  const markers: EmbedMarker[] = [];
  const rejected: EmbedMarkerRejection[] = [];
  let occurrence = 0;

  const masked = maskNonRenderableRegions(html);
  const pattern = new RegExp(MARKER_PATTERN.source, MARKER_PATTERN.flags);
  const closeIndexCache = new Map<string, TagTokenIndex>();
  for (let match = pattern.exec(masked); match !== null; match = pattern.exec(masked)) {
    occurrence += 1;
    const indices = (match as RegExpExecArray & { indices: RegExpIndicesArray }).indices;
    const [wholeStart, openTagEnd] = requireGroupRange(indices, 0);
    const tagRange = requireGroupRange(indices, 1);
    const attrsRange = requireGroupRange(indices, 2);
    const rawRange = requireGroupRange(indices, 3);
    const tag = html.slice(...tagRange);

    // No close at all (a void `<img>` marker): the open tag alone is the whole marker, inner empty.
    const [closeStart, closeEnd] = findBalancedClose(masked, { name: tag, openStart: wholeStart, openEnd: openTagEnd }, closeIndexCache) ?? [
      openTagEnd,
      openTagEnd,
    ];
    pattern.lastIndex = closeEnd; // resume past this marker's whole balanced span, never re-entering it

    const index = wholeStart;
    const whole = html.slice(wholeStart, closeEnd);
    const attrs = html.slice(...attrsRange);
    const raw = html.slice(...rawRange);
    const inner = html.slice(openTagEnd, closeStart);
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
 * The collection marker type (2026-09-23) — a theme/page marker that renders a bounded, filtered,
 * sorted list of entries from one custom content type wherever it appears. Same ownership shape as
 * {@link MENU_MARKER_TYPE}/{@link PARTIAL_MARKER_TYPE}/{@link POST_PREVIEWS_MARKER_TYPE} immediately
 * above: resolved end-to-end by `features/theme/static-render.ts`'s `injectCollectionEmbeds`, never
 * registered in `widgets/resolver-service.ts`'s `HTML_EMBED_RESOLVERS` — see that file's
 * `THEME_OWNED_MARKER_TYPES`, which carries a matching literal entry for the same disclosed
 * "duplicated, not imported" reason its own doc gives for the other three.
 *
 * Config shape (validated by `entries/public-list.ts`'s `parseCollectionListConfig`, not by this
 * module): `{"type":"collection","typeKey":"recipe", …}` plus the type's own filter/sort/limit/layout
 * keys. Unlike {@link POST_PREVIEWS_MARKER_TYPE}, a resolved collection marker's wrapper is stripped
 * of `data-embed-config` on the hit path ({@link withInnerContentFinal}) so a later re-scan of the
 * same output can never rediscover and re-resolve it.
 */
export const COLLECTION_MARKER_TYPE = "collection";

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
 * One HTML attribute authored directly on a marker element (2026-09-16 — owner: "regular attributes
 * that somebody puts on a data-embed-config should work on the rendered tag"). Produced by
 * {@link parseMarkerAttributes}, consumed by callers that forward some or all of a marker's authored
 * attributes onto whatever it resolves to.
 */
export interface MarkerAttribute {
  readonly name: string;
  /** Source text, exactly as authored — never entity-decoded (see {@link parseMarkerAttributes}'s
   *  own doc for why). `null` means the attribute was written with no `="..."` at all (a boolean
   *  attribute like a bare `autoplay`), not that it had an empty value. */
  readonly value: string | null;
}

/**
 * The shape every attribute name {@link parseMarkerAttributes} accepts must have — deliberately
 * narrower than the full HTML spec's own name production, sized for real attribute names (`class`,
 * `data-*`, `aria-*`, `autoplay`, …), the same "narrower on purpose" discipline
 * `@jini-ai/cms/media`'s `html-attributes.ts` applies to its own allowlisted names. A token whose name
 * fails this is skipped, not thrown — this parser runs over already-authored page HTML (page trust,
 * no allowlist; see the 2026-09-16 embed-attributes plan §0), so "not a well-formed attribute name" is
 * a shape problem this parser degrades past, not a security boundary.
 */
const MARKER_ATTRIBUTE_NAME_PATTERN = /^[a-z_:][-a-z0-9_:.]*$/;

/**
 * Quote-aware attribute-token scanner: matches one `name`, or one `name=unquoted`, `name="value"`, or
 * `name='value'` pair. The identical loose shape `@jini-ai/cms/media`'s `html-attributes.ts` uses for
 * its own `HTML_ATTRIBUTE_TOKEN` — quote-aware so a `data-embed-config='{"type":"media"}'` token
 * (double quotes living inside a single-quoted value) is consumed as ONE token rather than corrupting
 * the scan at its first interior `"`.
 */
const MARKER_ATTRIBUTE_TOKEN = /([^\s="']+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g;

/**
 * Parses a marker's verbatim {@link EmbedMarker.attrs} text into structured attributes, in authored
 * order, with `data-embed-config` itself removed (it is the marker, not an attribute a caller would
 * ever want to forward) — the read half of the 2026-09-16 embed-attributes contract:
 * {@link formatMarkerAttributes} is its inverse.
 *
 * - Names are lowercased (HTML attribute names are case-insensitive).
 * - A token whose (lowercased) name is not a valid attribute name per
 *   {@link MARKER_ATTRIBUTE_NAME_PATTERN} is skipped, never thrown.
 * - A duplicate name keeps its FIRST occurrence — the same rule a real HTML parser applies, so this
 *   parser's result matches what a browser would actually expose on the element.
 * - Every value is kept as SOURCE TEXT: never entity-decoded. Re-decoding `&amp;` here and
 *   re-escaping on output (see {@link formatMarkerAttributes}) would double-escape a value like
 *   `title="a &amp; b"` into `&amp;amp;` — this module never round-trips through a decoded form.
 *
 * @complexity O(n) in the marker's own attrs length (one regex pass) — independent of the surrounding
 * document's size.
 */
export function parseMarkerAttributes(marker: EmbedMarker): MarkerAttribute[] {
  const seenNames = new Set<string>();
  const attributes: MarkerAttribute[] = [];
  MARKER_ATTRIBUTE_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER_ATTRIBUTE_TOKEN.exec(marker.attrs)) !== null) {
    const name = match[1]!.toLowerCase();
    if (name === "data-embed-config") continue;
    if (!MARKER_ATTRIBUTE_NAME_PATTERN.test(name)) continue;
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    const value = match[2] ?? match[3] ?? match[4] ?? null;
    attributes.push({ name, value });
  }
  return attributes;
}

/**
 * Formats parsed attributes back into attribute-string text, the inverse of
 * {@link parseMarkerAttributes}: a valueless attribute is emitted as a bare ` name`; a valued one as
 * ` name="value"`. The ONLY transform applied to a value is `"` -> `&quot;` (a value may itself
 * contain a literal `"`, e.g. carried over from a single-quoted authored attribute) — `&` is never
 * touched, so source text that already reads `&amp;` is emitted unchanged rather than
 * double-escaping into `&amp;amp;`.
 *
 * @complexity O(n) in the total length of every attribute's name and value.
 */
export function formatMarkerAttributes(attrs: readonly MarkerAttribute[]): string {
  return attrs.map((attr) => (attr.value === null ? ` ${attr.name}` : ` ${attr.name}="${attr.value.replace(/"/g, "&quot;")}"`)).join("");
}

/** Whether a marker carries any authored attribute besides `data-embed-config` itself — the "bare
 *  marker" test {@link withElementKeptIfAttributed} uses to decide whether an element survives a
 *  whole-marker substitution.
 *
 * @complexity O(n) in the marker's own attrs length (delegates to {@link parseMarkerAttributes}).
 */
export function hasAuthoredAttributes(marker: EmbedMarker): boolean {
  return parseMarkerAttributes(marker).length > 0;
}

/**
 * Rebuild a marker's element around new inner content using an EXPLICIT attribute list (rather than
 * the marker's own verbatim {@link EmbedMarker.attrs}) — for a caller that has partitioned a marker's
 * authored attributes and needs only a subset on the rebuilt wrapper (e.g. {@link substituteHtmlEmbeds}
 * moving media-element attribute names off a non-media wrapper onto the resolved `<video>`/`<img>`,
 * keeping the rest on the wrapper). The counterpart to {@link withInnerContent}, which always keeps
 * every authored attribute verbatim.
 */
export function withInnerContentAndAttributes(marker: EmbedMarker, attrs: readonly MarkerAttribute[], inner: string): string {
  return `<${marker.tag}${formatMarkerAttributes(attrs)}>${inner}</${marker.tag}>`;
}

/**
 * Whole-element replace UNLESS the marker carries authored attributes, in which case its element
 * survives (minus `data-embed-config`) around the resolved content — the 2026-09-16 rule for marker
 * types (`widget`, `partial`) that default to disappearing entirely: a bare marker keeps disappearing,
 * byte-identical to before, while an attributed one keeps whatever styling/accessibility hook the
 * author put on it. Delegates to {@link withInnerContentFinal} for the attributed case so the kept
 * wrapper's attribute text is the marker's own verbatim {@link EmbedMarker.attrs} (not a
 * parse-then-reformat round trip) — the same byte-identical-when-nothing-moves discipline
 * {@link withInnerContentFinal} itself already provides.
 */
export function withElementKeptIfAttributed(marker: EmbedMarker, inner: string): string {
  return hasAuthoredAttributes(marker) ? withInnerContentFinal(marker, inner) : inner;
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

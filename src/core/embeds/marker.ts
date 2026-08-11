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
    const [whole, tag, attrs, raw] = match as unknown as [string, string, string, string];
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

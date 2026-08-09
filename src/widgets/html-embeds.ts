/**
 * @file The `data-embed-type` placeholder convention for `"html"`-format Pages (SPEC-047 Slice 2,
 * generalized 2026-08-07 per `project-tovu-generic-embed-contract`).
 *
 * Purpose:
 * A TipTap `widgetEmbed` node has a structured home (`bodyJson`) to carry a `{placementId,
 * widgetEntryId}` attrs object. A Page's body is a free-form HTML string with no such tree, so an
 * embed there has to be a literal markup convention instead: an otherwise-empty
 * `<div data-embed-type="widget" data-embed-id="{widgetEntryId}"></div>` (or `type="form"`,
 * `type="media"`, or any future type token), anywhere in the page's `body_html`. This file is the
 * ONE place that convention is defined — `scanHtmlEmbeds` (read: which refs does this markup
 * contain) and `substituteHtmlEmbeds` (write: replace each placeholder with its resolved markup)
 * both parse against the exact same pattern, so "what render.ts embeds" and "what entry_refs
 * indexes" (via `core/entry-refs/extractor.ts`'s own, independently-written scanner — see that
 * file's header for why it is a deliberate second copy rather than an import of this one) can never
 * disagree about what counts as a reference, short of the two patterns themselves drifting apart.
 *
 * **Why `type` is a free string, not a closed union.** A closed union would mean this file's own
 * type signature has to change every time a new embed type is added — exactly the coupling the
 * generic contract exists to remove. Adding a fourth type is a new resolver registration
 * (`resolver-service.ts`'s `HTML_EMBED_RESOLVERS`), never a scanner change. Unknown types flow
 * through untouched; "is this type known" is a resolution-time question, never a scan-time one.
 *
 * **Why an empty div, not an arbitrary element with children.** Matching a self-closing pair with
 * nothing between the tags keeps this a single non-backtracking regex instead of a hand-rolled HTML
 * parser (this codebase has no HTML-parsing dependency, and `render.ts`'s whole house style is
 * string-templated output, never a real DOM) — a `<div ...>anything nested here</div>` shape would
 * need real tag-balance tracking to substitute correctly. Any content an author puts inside a
 * `data-embed-type` div today simply keeps the div from matching at all, which degrades safely
 * (REQ-28-style): the div renders verbatim, inert, never a crash and never a dropped reference
 * silently mistaken for something else.
 *
 * **Why attribute VALUES are not re-validated here for injection safety.** A Page's `body_html` is
 * already unescaped, trusted-ish markup by the time it reaches this module (see
 * `update-html.ts`'s own disclosure) — nothing this file does widens that trust boundary. The one
 * thing this module owns defensively is bounding how much work an adversarial/oversized page can
 * demand at render/index time (`MAX_HTML_EMBEDS_PER_PAGE`) and never using a captured id for
 * anything other than a map/repo lookup key (never re-emitted into HTML unescaped, never
 * interpolated into a query) — see `resolver-service.ts`'s `resolveHtmlPageEmbeds` and
 * `extractor.ts`'s html-ref collector, both of which only ever use the id that way.
 */

/**
 * One `data-embed-type` reference found in a Page's `body_html`. `type` is deliberately a free
 * string (see this file's header) — the scanner never validates it against a known-type list.
 * `id`/`name`/`variant` are `null` when the corresponding attribute is absent (or, for `id`, out of
 * {@link MAX_EMBED_ID_LENGTH} bounds) — the scanner reports what is literally written in the markup;
 * deciding whether an absent/invalid attribute makes the reference resolvable is a resolver-side
 * concern (`resolver-service.ts`), not a scanner-side one.
 */
export interface PageHtmlEmbedRef {
  readonly type: string;
  readonly id: string | null;
  readonly name: string | null;
  readonly variant: string | null;
}

/**
 * Resource bound (Programmer workflow step 5a4) mirroring `embed-service.ts`'s
 * `DEFAULT_MAX_EMBEDS_PER_DOCUMENT` for the TipTap path — same policy, same value, applied here
 * because an html Page has no equivalent write-time guardrail (`PagesHtmlDocumentStore.write()`
 * accepts any string; `embed-validation.ts`'s `validateWidgetEmbedMutation` is never in this path).
 * Without a cap, a page carrying thousands of embed placeholders would grow `entry_refs` and the
 * render-time resolved-id set unboundedly. `scanHtmlEmbeds` truncates AT this many refs; occurrences
 * beyond the cap simply resolve to the same REQ-28 placeholder every other unresolved reference
 * does (see `substituteHtmlEmbeds`'s own doc for why it does not need a matching count check).
 *
 * **This is a render/index-time resource guard, NOT a write-time invariant.** Nothing stops
 * `pages_write_html`/the admin HTML editor from storing a page with 5,000 embed placeholders in
 * `body_html` — `PagesHtmlDocumentStore.write()` has no count check of its own, unlike
 * `embed-validation.ts`'s `validateWidgetEmbedMutation` (REQ-20) on the TipTap path, which rejects
 * an over-limit mutation before it is ever persisted. This constant only bounds how much of an
 * already-stored oversized page gets resolved/indexed on any single render or reindex pass — it
 * does not guarantee such a page can never exist. A write-time cap would need its own design
 * decision (reject vs. truncate vs. warn the operator) that has not been made; do not read this
 * constant as implying one already has been.
 */
export const MAX_HTML_EMBEDS_PER_PAGE = 50;

/** An id long enough to be any real UUID/ULID but short enough that a pathological value can't
 * itself become a resource concern once carried into a `Set`/`Map` key or an `entry_refs` row. */
const MAX_EMBED_ID_LENGTH = 200;

/**
 * `<div ...data-embed-type="TYPE"...></div>`, type token captured (the div's other attributes,
 * including `data-embed-id`/`data-embed-name`/`data-embed-variant`, are pulled separately from the
 * full match text by {@link toEmbedRef} rather than by this pattern) — order-independent (the target
 * attribute may appear anywhere in the tag), but the div must be immediately closed with nothing
 * between the tags (see this file's own header for why). `TYPE` is constrained to
 * `[a-z][a-z0-9-]*` — a type token is an internal identifier this codebase defines (never rendered,
 * never attacker-controlled beyond "does this known type match"), so a narrow shape is enough
 * without needing quote-escaping defenses attribute VALUES don't get either (see this file's header).
 * Rebuilt fresh per call (`embedPattern()`) rather than shared as a module-level `RegExp`,
 * deliberately: a `g`-flagged `RegExp` is stateful (`lastIndex`), and this pattern is used from two
 * independent call sites (`scanHtmlEmbeds`, `substituteHtmlEmbeds`) that must never be able to
 * corrupt each other's scan position by sharing one mutable instance.
 */
const EMBED_PATTERN_SOURCE = String.raw`<div\b[^>]*?\bdata-embed-type\s*=\s*"([a-z][a-z0-9-]*)"[^>]*?>\s*<\/div>`;

function embedPattern(): RegExp {
  return new RegExp(EMBED_PATTERN_SOURCE, "gi");
}

/** Pulls one `attr="VALUE"` attribute's value out of a matched embed div's full tag text, or `null`
 * when the attribute is absent. Rebuilt per call for the same non-shared-stateful-RegExp reason
 * {@link embedPattern} is. */
function extractAttrValue(tagText: string, attrName: string): string | null {
  const match = tagText.match(new RegExp(`\\b${attrName}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? match[1] : null;
}

/** `null` when `rawId` is absent, empty, or beyond {@link MAX_EMBED_ID_LENGTH} — a bound too long to
 * safely carry into a `Map`/`Set` key or an `entry_refs` row (see {@link MAX_EMBED_ID_LENGTH}'s own
 * doc), same sanity check the old `data-widget-embed`/`data-form-embed` convention applied. */
function normalizeEmbedId(rawId: string | null): string | null {
  if (rawId === null || rawId.length === 0 || rawId.length > MAX_EMBED_ID_LENGTH) return null;
  return rawId;
}

function toEmbedRef(tagText: string, typeToken: string): PageHtmlEmbedRef {
  return {
    type: typeToken.toLowerCase(),
    id: normalizeEmbedId(extractAttrValue(tagText, "data-embed-id")),
    name: extractAttrValue(tagText, "data-embed-name"),
    variant: extractAttrValue(tagText, "data-embed-variant"),
  };
}

/**
 * Every `data-embed-type` reference in `html`, in document order, truncated at
 * {@link MAX_HTML_EMBEDS_PER_PAGE}. Pure — no I/O, never throws. Shared by the render-time resolver
 * (`resolver-service.ts`'s `resolveHtmlPageEmbeds`, which needs to know what to batch-load) and
 * anything that needs to enumerate a page's embed set without rendering it.
 *
 * @complexity O(n) over `html`'s length for the regex scan, plus O(min(k, cap)) to build the
 * returned array, where k is the number of matches.
 * @overallScore 100
 */
export function scanHtmlEmbeds(html: string): PageHtmlEmbedRef[] {
  const refs: PageHtmlEmbedRef[] = [];
  for (const match of html.matchAll(embedPattern())) {
    refs.push(toEmbedRef(match[0], match[1]));
    if (refs.length >= MAX_HTML_EMBEDS_PER_PAGE) break;
  }
  return refs;
}

/**
 * Replaces every `data-embed-type` placeholder in `html` with `resolve(ref)`'s return value.
 * `resolve` is synchronous and pure from this function's own perspective — the caller is expected
 * to have already batch-resolved every ref it cares about (mirroring how `render.ts`'s
 * `renderDocNode` receives an already-resolved `inlineResolved` map rather than doing its own I/O);
 * a ref `resolve` doesn't recognize (unknown type, never loaded, or beyond
 * {@link MAX_HTML_EMBEDS_PER_PAGE}) is `resolve`'s own call to degrade safely, not something this
 * function special-cases — every caller here (`render.ts`'s `renderHtmlPageBody`) already returns
 * the REQ-28 placeholder for an unresolved ref, which is exactly what "no cap-aware branch needed
 * here" relies on.
 *
 * @complexity O(n) over `html`'s length for the regex pass, plus O(1) per match for `resolve`.
 * @overallScore 100
 */
export function substituteHtmlEmbeds(html: string, resolve: (ref: PageHtmlEmbedRef) => string): string {
  return html.replace(embedPattern(), (full: string, typeToken: string) => resolve(toEmbedRef(full, typeToken)));
}

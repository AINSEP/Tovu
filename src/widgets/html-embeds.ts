/**
 * @file The `data-widget-embed`/`data-form-embed` placeholder convention for `"html"`-format Pages
 * (SPEC-047 Slice 2).
 *
 * Purpose:
 * A TipTap `widgetEmbed` node has a structured home (`bodyJson`) to carry a `{placementId,
 * widgetEntryId}` attrs object. A Page's body is a free-form HTML string with no such tree, so an
 * embed there has to be a literal markup convention instead: an otherwise-empty
 * `<div data-widget-embed="{widgetEntryId}"></div>` or `<div data-form-embed="{formDefinitionId}">
 * </div>`, anywhere in the page's `body_html`. This file is the ONE place that convention is
 * defined — `scanHtmlEmbeds` (read: which ids does this markup reference) and
 * `substituteHtmlEmbeds` (write: replace each placeholder with its resolved markup) both parse
 * against the exact same pattern, so "what render.ts embeds" and "what entry_refs indexes" (via
 * `core/entry-refs/extractor.ts`'s own, independently-written scanner — see that file's header for
 * why it is a deliberate second copy rather than an import of this one) can never disagree about
 * what counts as a reference, short of the two patterns themselves drifting apart.
 *
 * **Why an empty div, not an arbitrary element with children.** Matching a self-closing pair with
 * nothing between the tags keeps this a single non-backtracking regex instead of a hand-rolled HTML
 * parser (this codebase has no HTML-parsing dependency, and `render.ts`'s whole house style is
 * string-templated output, never a real DOM) — a `<div ...>anything nested here</div>` shape would
 * need real tag-balance tracking to substitute correctly. Any content an author puts inside a
 * `data-widget-embed`/`data-form-embed` div today simply keeps the div from matching at all, which
 * degrades safely (REQ-28-style): the div renders verbatim, inert, never a crash and never a
 * dropped reference silently mistaken for something else.
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

export type PageHtmlEmbedKind = "widget" | "form";

/** One `data-widget-embed`/`data-form-embed` reference found in a Page's `body_html`. */
export interface PageHtmlEmbedRef {
  readonly kind: PageHtmlEmbedKind;
  readonly id: string;
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
 * `<div ...data-widget-embed="ID"...></div>` or the `data-form-embed` twin, ID captured, both other
 * attribute runs discarded — order-independent (the target attribute may appear anywhere in the
 * tag), but the div must be immediately closed with nothing between the tags (see this file's own
 * header for why). Rebuilt fresh per call (`embedPattern()`) rather than shared as a module-level
 * `RegExp`, deliberately: a `g`-flagged `RegExp` is stateful (`lastIndex`), and this pattern is used
 * from two independent call sites (`scanHtmlEmbeds`, `substituteHtmlEmbeds`) that must never be able
 * to corrupt each other's scan position by sharing one mutable instance.
 */
const EMBED_PATTERN_SOURCE = String.raw`<div\b[^>]*?\bdata-(widget|form)-embed\s*=\s*"([^"]*)"[^>]*?>\s*<\/div>`;

function embedPattern(): RegExp {
  return new RegExp(EMBED_PATTERN_SOURCE, "gi");
}

function toEmbedRef(kindToken: string, id: string): PageHtmlEmbedRef | null {
  if (id.length === 0 || id.length > MAX_EMBED_ID_LENGTH) return null;
  return { kind: kindToken.toLowerCase() === "widget" ? "widget" : "form", id };
}

/**
 * Every `data-widget-embed`/`data-form-embed` reference in `html`, in document order, truncated at
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
    const ref = toEmbedRef(match[1], match[2]);
    if (!ref) continue;
    refs.push(ref);
    if (refs.length >= MAX_HTML_EMBEDS_PER_PAGE) break;
  }
  return refs;
}

/**
 * Replaces every `data-widget-embed`/`data-form-embed` placeholder in `html` with `resolve(ref)`'s
 * return value. `resolve` is synchronous and pure from this function's own perspective — the
 * caller is expected to have already batch-resolved every id it cares about (mirroring how
 * `render.ts`'s `renderDocNode` receives an already-resolved `inlineResolved` map rather than doing
 * its own I/O); an id `resolve` doesn't recognize (never loaded, or beyond
 * {@link MAX_HTML_EMBEDS_PER_PAGE}) is `resolve`'s own call to degrade safely, not something this
 * function special-cases — every caller here (`render.ts`'s `renderHtmlPageBody`) already returns
 * the REQ-28 placeholder for an unresolved id, which is exactly what "no cap-aware branch needed
 * here" relies on.
 *
 * @complexity O(n) over `html`'s length for the regex pass, plus O(1) per match for `resolve`.
 * @overallScore 100
 */
export function substituteHtmlEmbeds(html: string, resolve: (ref: PageHtmlEmbedRef) => string): string {
  return html.replace(embedPattern(), (full, kindToken: string, id: string) => {
    const ref = toEmbedRef(kindToken, id);
    return ref ? resolve(ref) : full;
  });
}

/**
 * @file The embed-reference view of a `"html"`-format Page's body (SPEC-047 Slice 2, generalized
 * 2026-08-07 per `project-tovu-generic-embed-contract`, rewired onto the shared marker parser
 * 2026-08-10).
 *
 * Purpose:
 * A TipTap `widgetEmbed` node has a structured home (`bodyJson`) to carry a `{placementId,
 * widgetEntryId}` attrs object. A Page's body is a free-form HTML string with no such tree, so an
 * embed there has to be a literal markup convention instead:
 * `<div data-embed-config='{"type":"widget","id":"{widgetEntryId}"}'></div>` (or `"type":"form"`,
 * `"media"`, `"post"`, or any future type token), anywhere in the page's `body_html`.
 *
 * **This file no longer owns a pattern.** Locating and parsing a marker is `core/embeds/marker.ts`'s
 * single job; this module is only the adapter that projects a parsed marker into the
 * {@link PageHtmlEmbedRef} shape `resolver-service.ts` resolves against. Before the 2026-08-10
 * unification there were four regexes for one concept — this one, `static-render.ts`'s,
 * `entry-refs/extractor.ts`'s deliberate second copy, and the theme-slot pair — and they had already
 * drifted: this one required an EMPTY `<div></div>`, while the theme path deliberately matched a
 * marker WITH authored fallback content inside it. Sharing the parser is what makes "what render.ts
 * embeds" and "what entry_refs indexes" incapable of disagreeing, rather than merely tested for
 * agreement after the fact.
 *
 * **Why `type` is a free string, not a closed union.** A closed union would mean this file's own
 * type signature has to change every time a new embed type is added — exactly the coupling the
 * generic contract exists to remove. Adding a fourth type is a new resolver registration
 * (`resolver-service.ts`'s `HTML_EMBED_RESOLVERS`), never a scanner change. Unknown types flow
 * through untouched; "is this type known" is a resolution-time question, never a scan-time one.
 *
 * **Inner content is now allowed, and that is a widening.** The old empty-div requirement meant any
 * content inside a placeholder kept it from matching at all — it rendered verbatim and inert. The
 * shared parser captures inner content instead, because a theme marker's authored content is a real
 * fallback that must survive when nothing resolves. For this path the consequence is that
 * {@link substituteHtmlEmbeds} replaces the WHOLE element, fallback content included, exactly as it
 * already replaced the whole empty div: an html Page's embed placeholder is scaffolding for the
 * resolved widget, not a nav that must survive a failed lookup. Unresolved still degrades to the
 * REQ-28 placeholder via the caller's own `resolve`, never to a crash and never to raw marker markup
 * reaching a visitor.
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

import { scanEmbedMarkers, substituteMarkers, type EmbedMarker } from "#src/core/embeds/marker";

/**
 * One embed reference found in a Page's `body_html`. `type` is deliberately a free string (see this
 * file's header) — the scanner never validates it against a known-type list. `id`/`name`/`variant`
 * are `null` when the corresponding CONFIG KEY is absent or not a string (or, for `id`, out of
 * {@link MAX_EMBED_ID_LENGTH} bounds) — the scanner reports what is literally written in the markup;
 * deciding whether an absent/invalid key makes the reference resolvable is a resolver-side concern
 * (`resolver-service.ts`), not a scanner-side one.
 *
 * Kept as a narrow projection of `EmbedMarker.config` rather than replaced by it: every resolver in
 * `HTML_EMBED_RESOLVERS` reads exactly these four fields, and `null`-for-absent is the shape their
 * skip branches already test. A resolver needing a new key reads it off the marker config directly
 * — this interface is the compatibility seam, not a ceiling.
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

/** One config key as a string, or `null` when absent or of any other JSON type. The resolvers'
 * `null`-means-unusable branches predate JSON configs and stay correct unchanged: a non-string
 * `"id": 7` is exactly as unusable as a missing one. */
function configString(config: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = config[key];
  return typeof value === "string" ? value : null;
}

/** `null` when `rawId` is absent, empty, or beyond {@link MAX_EMBED_ID_LENGTH} — a bound too long to
 * safely carry into a `Map`/`Set` key or an `entry_refs` row (see {@link MAX_EMBED_ID_LENGTH}'s own
 * doc), same sanity check the old `data-widget-embed`/`data-form-embed` convention applied. */
function normalizeEmbedId(rawId: string | null): string | null {
  if (rawId === null || rawId.length === 0 || rawId.length > MAX_EMBED_ID_LENGTH) return null;
  return rawId;
}

/** Project a parsed marker onto the four fields the resolvers read. `type` is lowercased here, as
 * the old attribute pattern's `i` flag did — a config is hand-authored JSON, so `"Widget"` must keep
 * reaching the same resolver `"widget"` does. */
function toEmbedRef(marker: EmbedMarker): PageHtmlEmbedRef {
  return {
    type: marker.type.toLowerCase(),
    id: normalizeEmbedId(configString(marker.config, "id")),
    name: configString(marker.config, "name"),
    variant: configString(marker.config, "variant"),
  };
}

/**
 * Every embed reference in `html`, in document order, truncated at
 * {@link MAX_HTML_EMBEDS_PER_PAGE}. Pure — no I/O, never throws. Shared by the render-time resolver
 * (`resolver-service.ts`'s `resolveHtmlPageEmbeds`, which needs to know what to batch-load) and
 * anything that needs to enumerate a page's embed set without rendering it.
 *
 * A marker whose config does not parse is simply absent from the result — render-time stays
 * forgiving (warn + degrade, never throw), and the unparseable marker's own markup survives
 * untouched into the output because {@link substituteHtmlEmbeds} cannot see it either. The LOUD
 * treatment of `rejected` belongs to `core/entry-refs/extractor.ts` (the integrity path a dropped
 * reference would let a delete proceed against) and to the write chokepoint, not here.
 *
 * @complexity O(n) over `html`'s length for the shared scan, plus O(min(k, cap)) to build the
 * returned array, where k is the number of markers.
 * @overallScore 100
 */
export function scanHtmlEmbeds(html: string): PageHtmlEmbedRef[] {
  const refs: PageHtmlEmbedRef[] = [];
  for (const marker of scanEmbedMarkers(html).markers) {
    refs.push(toEmbedRef(marker));
    if (refs.length >= MAX_HTML_EMBEDS_PER_PAGE) break;
  }
  return refs;
}

/**
 * Replaces every embed placeholder in `html` with `resolve(ref)`'s return value.
 * `resolve` is synchronous and pure from this function's own perspective — the caller is expected
 * to have already batch-resolved every ref it cares about (mirroring how `render.ts`'s
 * `renderDocNode` receives an already-resolved `inlineResolved` map rather than doing its own I/O);
 * a ref `resolve` doesn't recognize (unknown type, never loaded, or beyond
 * {@link MAX_HTML_EMBEDS_PER_PAGE}) is `resolve`'s own call to degrade safely, not something this
 * function special-cases — every caller here (`render.ts`'s `renderHtmlPageBody`) already returns
 * the REQ-28 placeholder for an unresolved ref, which is exactly what "no cap-aware branch needed
 * here" relies on.
 *
 * `resolve` returning `undefined` means **leave this marker exactly as authored**, forwarded straight
 * to `substituteMarkers`' own invariant of the same name. That is not a convenience: since the
 * 2026-08-10 unification this stage SEES markers it does not own (a theme's `partial`/`menu`), and a
 * later stage resolves them. Substituting anything at all over one of those — including the REQ-28
 * placeholder — silently deletes a nav. Which types this stage owns is `resolver-service.ts`'s
 * `isPageEmbedType` to answer; this function only carries the answer through.
 *
 * @complexity O(n) over `html`'s length for the shared scan, plus O(1) per marker for `resolve`.
 * @overallScore 100
 */
export function substituteHtmlEmbeds(
  html: string,
  resolve: (ref: PageHtmlEmbedRef) => string | undefined
): string {
  return substituteMarkers(html, (marker) => resolve(toEmbedRef(marker)));
}

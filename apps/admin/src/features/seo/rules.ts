import type { SeoIssue } from "../../lib/api";

/**
 * @file Pure logic for the `seo` feature — everything that computes a value rather than rendering
 * one.
 *
 * Follows the `rules.ts` convention `features/posts/rules.ts` establishes. `sortIssuesBySeverity`
 * was `AnalyzePanel`'s inline `.sort()` call plus its module-level `SEVERITY_ORDER` table; it
 * computes an ordering, so per that convention it moves here rather than stay "presentation" —
 * `AnalyzePanel` itself has no state and needs no hook, only this rule.
 */

const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };

/**
 * Orders issues error-first, then warning, then info, matching the severities' natural urgency.
 * An unrecognized severity sorts last (falls back to `9`) rather than throwing, since this reads
 * off a server-provided field this client does not fully control.
 *
 * @complexity Time: O(n log n) in issue count via the underlying sort; space: O(n) for the copy
 * (never mutates the array passed in).
 */
export function sortIssuesBySeverity(issues: readonly SeoIssue[]): SeoIssue[] {
  return [...issues].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}

/**
 * One edited per-entry override field's outgoing value. An emptied text/URL box means "remove this
 * override so the entry falls back to the site default", which on the wire is `null` — the clear
 * sentinel `SeoExtFieldsPatch` documents (`apps/website/src/features/seo/types.ts`) and
 * `setEntrySeoOverrides` implements by `delete`-ing the key.
 *
 * It is NOT `""`. `write-service.ts` stores `""` as a genuine override and `seo.ts` resolves
 * overrides with `??`, so a blank override beats the site default — the exact trap that left one
 * post pinned at `{"description":""}` with no way back from the admin UI. It is not `undefined`
 * either: an omitted key means "leave unchanged", and `JSON.stringify` would drop it from the
 * request body entirely.
 *
 * Generic and value-shaped rather than key-shaped on purpose — the two robots checkboxes go
 * through the same setter and pass straight through, since a checkbox has no "empty" gesture with
 * which to express a clear. Only a genuinely emptied string can mean one.
 *
 * @complexity O(1) — one equality test.
 */
export function overrideOrClear<V>(value: V): V | null {
  return value === "" ? null : value;
}

/** An optional site-wide default's controlled-input value — `Seo.tsx`'s three optional defaults
 *  (`defaultDescription`, `defaultOgImage`, `twitterSite`) all fall back to `""` the same way. */
export function orEmpty(value: string | undefined): string {
  return value ?? "";
}

/** A pending-action button's label — `Seo.tsx` uses this for both the save-settings button
 *  ("Saving…"/"Save settings") and the regenerate-sitemap button ("Working…"/"Regenerate
 *  sitemap"), same `pending ? … : …` shape, different copy. Also reused by `SitemapModal.tsx`'s
 *  own footer Regenerate button — same two states, same copy, different trigger. */
export function actionLabel(pending: boolean, pendingLabel: string, idleLabel: string): string {
  return pending ? pendingLabel : idleLabel;
}

/**
 * One `<url>` entry from a parsed sitemap. Only the fields `apps/website`'s
 * `registerSeoSitemapRoute` (`server/inbound/public-http/routes/site/sitemap.ts`) actually emits —
 * `<loc>` always, `<lastmod>` when the entry has one — verified by reading that route rather than
 * guessed: it never writes `changefreq`/`priority`, so `SitemapModal.tsx`'s table has no columns
 * for those (SPEC intent: "omit a column entirely if the sitemap never emits that field").
 */
export interface SitemapUrlEntry {
  loc: string;
  lastmod: string | null;
}

/**
 * Parses a `<urlset>` sitemap document into its `<url>` entries via the browser's built-in
 * `DOMParser` — no new dependency, and it reads the exact same bytes `GET /sitemap.xml` served
 * (this never re-derives sitemap content of its own). Malformed input (a parser error, a document
 * with no `<url>` elements, empty text) yields `[]` rather than throwing: `useSitemapModal` already
 * guards the fetch itself via `SitemapPort`; this only guards the parse step.
 *
 * @complexity Time/space: O(n) in document size — one DOM parse, one linear pass over `<url>` nodes.
 */
export function parseSitemapXml(xmlText: string): SitemapUrlEntry[] {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return [];
  return Array.from(doc.getElementsByTagName("url"))
    .map((urlEl) => ({
      loc: urlEl.getElementsByTagName("loc")[0]?.textContent?.trim() ?? "",
      lastmod: urlEl.getElementsByTagName("lastmod")[0]?.textContent?.trim() || null,
    }))
    .filter((entry) => entry.loc !== "");
}

/** Case-insensitive substring filter over a parsed sitemap's URLs — `SitemapModal.tsx`'s filter
 *  box, for the same "narrow a long list by typing" shape every other filter in this admin uses.
 *  An empty/whitespace-only query returns every entry unchanged (a copy, not the same reference,
 *  matching `sortIssuesBySeverity`'s own never-mutate-the-input convention above).
 *
 * @complexity Time: O(n) in entry count; space: O(n) for the filtered copy. */
export function filterSitemapEntries(entries: readonly SitemapUrlEntry[], query: string): SitemapUrlEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...entries];
  return entries.filter((entry) => entry.loc.toLowerCase().includes(needle));
}

/**
 * `MediaRefField`'s ref-building/preview logic (`ogImage`/`twitterImage`/`defaultOgImage` all
 * share this shape — SPEC intent: "make the OG image selectable, with a preview"). The reference
 * format itself is NOT reinvented here — it is verified, not guessed, against the one function that
 * actually parses it server-side: `resolveSeoImageRef` (`apps/website/src/features/seo/media.ts`)
 * accepts either an already-absolute URL, passed through unchanged, or a bare `{assetId}:{transformName}`
 * pair split on the FIRST `:`. `isAbsoluteMediaRef`/`parseMediaRefAssetId` below duplicate that
 * parsing rather than import across the app boundary (apps/admin has no dependency on apps/website)
 * — kept in lockstep by this doc comment naming the source of truth; a change to that split MUST
 * update both.
 */

/** The transform every upload receives (the server's default rendition) — the one
 *  `buildMediaRef` always targets, matching `EmbedInsertControl.tsx`'s own
 *  `transformName: "public"` for the identical `{assetId}:{transformName}` shape it writes into a
 *  post body's image node. */
const SEO_IMAGE_TRANSFORM = "public";

/** Mirrors `resolveSeoImageRef`'s own `isAbsoluteUrl` (`apps/website/src/features/seo/media.ts`) —
 *  see this section's file-header doc for why this is a duplicate, not an import. */
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
function isAbsoluteMediaRef(value: string): boolean {
  return ABSOLUTE_URL_PATTERN.test(value) || value.startsWith("//");
}

/** Mirrors `resolveSeoImageRef`'s own `parseMediaRefParts`, narrowed to just the `assetId` half —
 *  all `MediaRefField`'s preview needs. Returns `null` for an absolute URL (nothing to parse) or a
 *  malformed ref (no `:`, or nothing on one side of it). */
function parseMediaRefAssetId(ref: string): string | null {
  if (!ref || isAbsoluteMediaRef(ref)) return null;
  const separatorIndex = ref.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === ref.length - 1) return null;
  return ref.slice(0, separatorIndex);
}

/** Builds the `{slug}:public` reference `MediaRefField` writes into the field on selection —
 *  prefers the asset's readable slug over its id (readable-slugs S5b, 2026-09-23), matching
 *  `resolveSeoImageRef`'s own id-or-slug lookup server-side (`findMediaByIdOrSlug`,
 *  `apps/website/src/features/seo/media.ts`, S4) so a saved override reads as a slug, not an opaque
 *  uuid. Falls back to `id` when `slug` is empty — defensive only; a real upload always derives one
 *  (`deriveUniqueMediaSlug`). Same `transformName: "public"` `EmbedInsertControl.tsx` already writes
 *  for an inserted image node. An old stored `{assetId}:public` value keeps resolving regardless
 *  (S4's `resolveSeoImageRef` accepts either spelling) — this only changes what gets WRITTEN next. */
export function buildMediaRef(item: { id: string; slug: string }): string {
  const key = item.slug || item.id;
  return `${key}:${SEO_IMAGE_TRANSFORM}`;
}

/** `MediaRefField`'s thumbnail `<img src>` for the field's current value. An absolute URL (the
 *  field's other legal shape — someone pasted a raw URL) renders directly; a `{assetId}:{transform}`
 *  ref resolves through the injected `mediaOriginalUrl` builder — the admin media library's own
 *  preview URL (`MediaPickerPort.mediaOriginalUrl`), same as `MediaPickerDialog`'s own grid
 *  thumbnails use, NOT the public `/m/...` rendition URL (that needs a live workspace/transform
 *  lookup this client-side preview has no reason to perform). `null` for an empty or unparseable
 *  value — the caller renders no preview then, rather than a broken `<img>`. `typeof value !==
 *  "string"` also resolves to `null` rather than throwing — `MediaRefField`'s `value` prop is a
 *  `fieldValue(key, resolved) ?? ""` fallback chain (`Seo.tsx`), where `??` does not replace a
 *  non-nullish-but-wrong-typed result from a misbehaving caller; matches `resolveSeoImageRef`'s own
 *  "never throws over one bad reference" contract (`apps/website/src/features/seo/media.ts`).
 *
 * @complexity O(1) — string parsing only, no I/O (the returned URL is a template; the browser
 * performs the actual fetch only once it is used as an `<img src>`). */
export function resolveMediaRefPreviewUrl(value: string, mediaOriginalUrl: (id: string) => string): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  if (isAbsoluteMediaRef(trimmed)) return trimmed;
  const assetId = parseMediaRefAssetId(trimmed);
  return assetId ? mediaOriginalUrl(assetId) : null;
}

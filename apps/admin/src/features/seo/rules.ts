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

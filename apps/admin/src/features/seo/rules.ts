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
 *  sitemap"), same `pending ? … : …` shape, different copy. */
export function actionLabel(pending: boolean, pendingLabel: string, idleLabel: string): string {
  return pending ? pendingLabel : idleLabel;
}

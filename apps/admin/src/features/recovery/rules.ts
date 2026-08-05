import type { AdminDegradedBanner, DatabaseContextEnvelope } from "../../lib/api";

/**
 * @file Pure logic for the `recovery` feature — everything that computes a value rather than
 * rendering one. Follows the convention `features/posts/rules.ts` establishes: no React, no
 * hooks, importable and directly testable.
 */

const CATEGORY_LABELS: Record<string, string> = {
  posts_pages: "posts/pages writes",
  plugin_table: "plugin-table rows",
};

/** Human label for one discarded-write-window category (design-spec.md §4.3). Falls back to
 *  `"<category> writes"` for a category the server sends that this table has not been taught yet,
 *  so a new category degrades to readable-but-generic copy instead of `undefined`. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? `${category} writes`;
}

/**
 * Whether a Recovery degraded banner needs `role="alert"`/`aria-live="assertive"` rather than the
 * default polite announcement.
 *
 * AC-27/EC-06/INV-07: `pending-migration`'s action always deep-links to Database's own migration
 * ceremony, never a Recovery restore action — restoring to an older snapshot does not resolve
 * schema drift against the current runtime. Both this kind and `migration-interrupted` are urgent
 * enough that the operator should not have to notice them on their own.
 *
 * @complexity Time/space: O(1) — two fixed comparisons.
 */
export function isAssertiveRecoveryBanner(banner: AdminDegradedBanner): boolean {
  return banner.kind === "migration-interrupted" || banner.kind === "pending-migration";
}

/** Discriminated parse result for {@link parseDeepLinkEnvelope} — `ok: false` carries no reason
 *  because the caller's only response to either failure mode is the same silent no-op. */
export type DeepLinkEnvelopeParseResult = { ok: true; envelope: DatabaseContextEnvelope } | { ok: false };

/**
 * Client-side shape check for a deep-link envelope pulled out of `sessionStorage` — valid JSON,
 * nothing deeper. `resolveRecoveryDeepLink` (the server) always re-verifies `restorePointId`
 * itself (ADR-041 §7/ADR-045 §5, INV-04); this only decides whether the envelope is even worth
 * sending. `ok: false` on anything unparseable — a `JSON.parse` throw only, deliberately NOT a
 * truthiness check on the parsed value, so a literal `"null"`/`"0"`/`"false"` payload (valid JSON,
 * falsy value) is still forwarded rather than silently swallowed here, matching the original
 * `try { envelope = JSON.parse(raw) } catch { return }` guard exactly. The caller treats `ok:
 * false` as "no deep link", same as no envelope having been stashed at all — a
 * malformed/forged/stale value is an expected, non-exceptional case, not an error toast.
 *
 * @complexity Time/space: O(1) beyond `JSON.parse`'s own cost in input length.
 */
export function parseDeepLinkEnvelope(raw: string): DeepLinkEnvelopeParseResult {
  try {
    return { ok: true, envelope: JSON.parse(raw) as DatabaseContextEnvelope };
  } catch {
    return { ok: false };
  }
}

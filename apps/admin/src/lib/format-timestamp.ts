/**
 * @file Shared timestamp display helper — audit cross-cutting finding #4
 * (`ADS-memory/reports/audits/20260801-admin-adversarial-ux-audit.md`): `x.slice(0, 16).replace("T",
 * " ")` was copy-pasted at roughly a dozen call sites (`Comments.tsx`, `Database.tsx`,
 * `Recovery.tsx`, `Members.tsx`, `Pages.tsx`, `Posts.tsx`, and more) to turn an ISO timestamp into
 * `YYYY-MM-DD HH:MM` for display.
 *
 * Deliberately reproduces that exact output, byte for byte, rather than improving it in this pass:
 * no timezone conversion (every timestamp still displays in whatever zone the value was stored
 * in — the server's own zone, unlabeled), no locale-aware formatting, no relative-time framing.
 * The point of this file is only to make a *future* version of any of those three things a
 * one-file change instead of a grep-and-replace across a dozen call sites — see the audit
 * fix-up report for the open proposal (label the zone explicitly, or switch to
 * `Intl.DateTimeFormat` once there's a place to read the operator's preferred zone from).
 */

/**
 * Formats an ISO 8601 timestamp as `YYYY-MM-DD HH:MM` for display in an admin list/detail view.
 * A fixed-width slice, not a parse: cheap, and tolerant of trailing seconds/milliseconds/zone
 * suffix (all fall after the 16th character and are simply dropped), but it assumes a standard
 * `YYYY-MM-DDTHH:MM...` prefix — a non-ISO input (e.g. a raw epoch-millisecond number rather than
 * a string) is a caller-side type error, not something this function guards against.
 *
 * @complexity O(1) — a fixed-width slice plus one single-character replace, no parsing.
 * @overallScore 100
 */
export function formatTimestamp(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

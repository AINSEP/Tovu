// Display compatibility rationale: Jini/packages/ui/src/features/panel-kit/helpers/format-timestamp.ts.
import { formatTimestamp as formatPackageTimestamp, formatRelativeMinutesAgo as formatPackageRelativeTime } from "@jini-ai/ui/panel-kit";

/** Format an admin timestamp through the shared formatter.
 *
 * Pre-extraction host rationale (historical names below describe the original layout).
 * The shared implementation and its active lifecycle constraints now live in Jini; Tovu keeps
 * this provenance so the adapter does not erase policy, bug history or the reasons for thresholds.
 *
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
 *
 * Formats an ISO 8601 timestamp as `YYYY-MM-DD HH:MM` for display in an admin list/detail view.
 * A fixed-width slice, not a parse: cheap, and tolerant of trailing seconds/milliseconds/zone
 * suffix (all fall after the 16th character and are simply dropped), but it assumes a standard
 * `YYYY-MM-DDTHH:MM...` prefix — a non-ISO input (e.g. a raw epoch-millisecond number rather than
 * a string) is a caller-side type error, not something this function guards against.
 *
 * @complexity O(1) — a fixed-width slice plus one single-character replace, no parsing.
 *
 * "N minutes ago"-style relative framing for the standing-draft autosave recovery banner (2026-09-06
 * — "unsaved changes from N minutes ago", the owner's own phrasing). The one relative-time need this
 * file's header flagged as future work, now that there's a real caller for it. No locale-aware
 * pluralization or `Intl.RelativeTimeFormat` — same "reproduce the simple thing, improve later"
 * discipline `formatTimestamp` already documents for itself; a caller wanting more than
 * English-only "N minute(s) ago" needs a bigger pass than this one function.
 *
 * @param iso The timestamp to describe, ISO 8601.
 * @param nowMs Epoch milliseconds for "now" — injected rather than read via `Date.now()` internally
 *   so this stays a pure function a test can call with a fixed clock; real callers pass `Date.now()`.
 * @complexity O(1).
 */
export function formatTimestamp(iso: string): string {
  return formatPackageTimestamp({ iso });
}

/** Preserve Tovu's English relative-time copy and caller-supplied clock. */
export function formatRelativeMinutesAgo(iso: string, nowMs: number): string {
  return formatPackageRelativeTime({ iso, nowMs }, { translate: (key) => key });
}

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
 * D-06: the stored ISO prefix described server time as though it were the viewer's local time.
 * Convert the instant with local Date getters before delegating the fixed-width display to Jini.
 * No timezone option is set: the browser's timezone is the viewer's timezone, including DST.
 * Zone-less ISO input already represents local wall time. Invalid input stays visible verbatim.
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
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  const localIso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return formatPackageTimestamp({ iso: localIso });
}

/** Preserve Tovu's English relative-time copy and caller-supplied clock. */
export function formatRelativeMinutesAgo(iso: string, nowMs: number): string {
  return formatPackageRelativeTime({ iso, nowMs }, { translate: (key) => key });
}

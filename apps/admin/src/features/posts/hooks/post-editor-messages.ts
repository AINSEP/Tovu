import { type Translate, interpolate } from "@jini-ai/core/text";
import { isUnexpectedServerFailure } from "@/lib/server-failure";
import type { AdminPost } from "@/features/posts/api/posts-api.types";
import { isoToLocalDateTimeInput, isScheduledPost } from "../rules";

/**
 * @file The save-flow status copy of the post editor: the success toast, the "changed outside" notice
 * and the save-failure line. A verbatim move out of `use-post-editor.hooks.ts` (its size ratchet).
 */

export type SaveStatusOverride = "draft" | "published" | undefined;

/**
 * `save`'s success-toast copy (complexity-ceiling pass, 2026-09-05 — same "nested ternary moves to a
 * top-level function" reasoning {@link computeContentDirty} above already states). Split out purely
 * so `save`'s own cognitive-complexity score doesn't carry this string's branching on top of the
 * stale-settlement guard added the same day.
 */
export function formatSaveSuccessMessage({ statusOverride, saved, t }: { statusOverride: SaveStatusOverride; saved: AdminPost; t: Translate }, { expectedVersion }: { expectedVersion?: number } = {}): string {
  // The server skips a save whose content matches what's stored and answers with the SAME version
  // (2026-10-10, no-op save guard), so an unchanged version means nothing new was written.
  if (statusOverride === undefined && expectedVersion !== undefined && saved.version === expectedVersion) {
    return interpolate({ template: t("No changes found · nothing new saved (version {version})"), vars: { version: saved.version } });
  }
  // A Publish whose time is still ahead does not go live yet (2026-10-05) — saying "Published" next
  // to the "Scheduled" badge contradicted it. The time is shown in local time, as the operator typed it.
  if (statusOverride === "published" && isScheduledPost({ input: { status: saved.status, publishAt: saved.publishAt ?? null }, nowMs: Date.now() })) {
    return interpolate({ template: t("Scheduled for {time} · version {version}"), vars: {
      time: isoToLocalDateTimeInput({ iso: saved.publishAt }).replace("T", " "),
      version: saved.version,
    } });
  }
  return interpolate({ template: t(statusOverride === "published" ? "Published · version {version}" : "Saved · version {version}"), vars: { version: saved.version } });
}

/**
 * The status line once a version saved outside this editor (the assistant, another tab) is the
 * stored one. Without it the line kept naming this editor's own last save ("Saved · version 2")
 * after the assistant had saved versions 3 and 4 (UI check 2026-10-31).
 */
export function formatOutsideChangeMessage({ version, t }: { version: number; t: Translate }, _options: Record<string, never> = {}): string {
  return interpolate({ template: t("Changed outside the editor · version {version}"), vars: { version } });
}

/**
 * `save`'s failure copy — same extraction reasoning as {@link formatSaveSuccessMessage} just above.
 * A thrown `Error`'s own message wins; otherwise falls back to a verb-specific default so the
 * operator hears "publish failed" rather than the generic "save failed" when the Publish button is
 * what triggered this call.
 */
export function formatSaveErrorMessage({ error, statusOverride, t }: { error: unknown; statusOverride: SaveStatusOverride; t: Translate }, _options: Record<string, never> = {}
): string {
  // A server or network failure already raised the shared failure notice with plain words and
  // copyable details; repeating its raw message here would show the same string twice.
  if (isUnexpectedServerFailure({ error })) return t(statusOverride === "published" ? "Not published. Your edits are still here." : "Not saved. Your edits are still here.");
  if (error instanceof Error) return error.message;
  return t(statusOverride === "published" ? "publish failed" : "save failed");
}

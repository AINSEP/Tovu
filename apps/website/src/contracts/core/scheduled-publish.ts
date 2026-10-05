import { isTrashed } from "./soft-delete.js";

/**
 * @file Scheduled publishing (2026-10-05) — the one rule for "is this published row live yet?".
 *
 * A scheduled post is NOT a third status. It is a `status: "published"` row whose `publishAt` is
 * still in the future: stored as published, hidden from every public read until that instant
 * passes. Render-time on purpose — there is no background job to miss, crash or lag, so a post is
 * live at the first request after its time with nothing else having to run.
 *
 * Why not a `"scheduled"` status: `PostStatus` is a two-value union matched by ~50 call sites
 * (admin editors, headless contracts, publish-to-live), and every one of them would have had to
 * learn a third value. Here they keep working unchanged and only the public read gates add this
 * check. Lives in `contracts/core` (beside `isTrashed`) so `platform/routing` can apply the same
 * rule without importing `features/post` — the cycle `soft-delete.ts`'s own header describes.
 *
 * `publishAt` and `nowIso` are both ISO-8601 UTC strings from `Date.prototype.toISOString()`
 * (`normalizePublishAt` in `features/post/post.ts` is the only writer), so a plain string compare
 * orders them correctly.
 */

export interface SchedulableRecord {
  readonly status: string;
  readonly publishAt?: string | null;
}

/** The current instant in the same ISO shape `publishAt` is stored in. */
export function currentIso(): string {
  return new Date().toISOString();
}

/** True when a published row's go-live time is still ahead of `nowIso`. A draft is never "scheduled":
 *  its `publishAt` only takes effect once it is published. @complexity O(1). */
export function isScheduledAt(record: SchedulableRecord, nowIso: string): boolean {
  return record.status === "published" && typeof record.publishAt === "string" && record.publishAt > nowIso;
}

/** Published, not trashed, and past its go-live time — the whole public-visibility rule for a post
 *  or page row. @complexity O(1). */
export function isLiveAt(record: SchedulableRecord & { readonly deletedAt?: string | null }, nowIso: string): boolean {
  return record.status === "published" && !isTrashed(record) && !isScheduledAt(record, nowIso);
}

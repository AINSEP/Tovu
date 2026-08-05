import {
  ApiError,
  describeApiError,
  type AdminComment,
  type CommentModerationAction,
  type CommentsSettings,
  type CommentStatus,
} from "../../lib/api";
import { hasPermission } from "../../lib/permissions";
import type { RowMenuItem } from "@jini-ai/admin/react";

/**
 * @file Pure logic for the `comments` feature — everything that computes a value rather than
 * rendering one. Follows the `posts/rules.ts` convention: no React import, no hooks, directly
 * testable.
 *
 * Moved here from `Comments.tsx`: `RowActionState`/`emptyRowState` and `describeModerationError`/
 * `truncate` (already module-scope free functions in the original, just not exported), the
 * moderation-queue row-menu item builder (a permission-and-status branch per action), and the
 * Comments-settings patch builder plus its validation (REQ-08/09/10).
 */

/** Per-row moderation-action state (Approve/Spam/Trash/Restore/Purge share one `busy` flag — only
 *  one action per row at a time). */
export interface RowActionState {
  busy: boolean;
  error: string | null;
}

export function emptyRowState(): RowActionState {
  return { busy: false, error: null };
}

/** REQ-07: a 409 (stale `expectedVersion`) gets its own message instead of the generic fallback,
 * using the route's own `{error, currentVersion}` body when present. */
export function describeModerationError(e: unknown): string {
  if (e instanceof ApiError && e.status === 409) {
    const currentVersion = typeof e.body?.currentVersion === "number" ? e.body.currentVersion : undefined;
    return `This comment changed since you loaded it${
      currentVersion !== undefined ? ` (current version ${currentVersion})` : ""
    } — refresh and try again.`;
  }
  return describeApiError(e, "Failed to update comment.");
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** The callbacks a row menu needs. Passed in rather than imported, so this module stays free of
 *  state (same convention as `posts/rules.ts`'s `PostRowMenuHandlers`). */
export interface CommentRowMenuHandlers {
  onModerate: (comment: AdminComment, action: CommentModerationAction) => void;
  /** Opens the confirm dialog; only offered under the trash filter for an already-trashed
   *  comment, and only with `comments.delete.force`. */
  onRequestPurge: (comment: AdminComment) => void;
}

/** At-rest row actions for `RowMenu` — every condition here is copied verbatim from the inline
 *  buttons this replaces, so a permission/status combination that used to hide a button still
 *  omits the matching menu item rather than rendering a guaranteed-failing click.
 *
 * REQ-06: purge only ever surfaces from the trash filter view (`currentFilterStatus === "trash"`),
 * not merely a trashed comment reached under a different filter. Genuinely destructive (its own
 * confirm copy: "cannot be undone") — `destructive: true`, unlike the reversible actions above.
 *
 * @complexity Time/space: O(1) — at most five entries, no iteration; three `hasPermission` checks.
 */
export function commentRowMenuItems(
  comment: AdminComment,
  context: { permissions: readonly string[]; currentFilterStatus: CommentStatus },
  handlers: CommentRowMenuHandlers,
): RowMenuItem[] {
  const canModerate = hasPermission(context.permissions, "comments.moderate");
  const canDelete = hasPermission(context.permissions, "comments.delete");
  const canForceDelete = hasPermission(context.permissions, "comments.delete.force");

  const items: RowMenuItem[] = [];
  if (comment.status !== "approved" && canModerate) {
    items.push({ key: "approve", label: "Approve", onSelect: () => handlers.onModerate(comment, "approve") });
  }
  if (comment.status !== "spam" && canModerate) {
    items.push({ key: "spam", label: "Spam", onSelect: () => handlers.onModerate(comment, "spam") });
  }
  if (comment.status !== "trash" && canDelete) {
    items.push({ key: "trash", label: "Trash", onSelect: () => handlers.onModerate(comment, "trash") });
  }
  if ((comment.status === "spam" || comment.status === "trash") && canModerate) {
    items.push({ key: "restore", label: "Restore", onSelect: () => handlers.onModerate(comment, "restore") });
  }
  if (context.currentFilterStatus === "trash" && comment.status === "trash" && canForceDelete) {
    items.push({ key: "purge", label: "Purge", destructive: true, onSelect: () => handlers.onRequestPurge(comment) });
  }
  return items;
}

/** REQ-08/09/10: builds a partial patch containing only the fields the operator actually changed
 * (the backend's `setCommentsSettings` is a partial-patch contract — REQ-08 asks the client to
 * mirror that instead of always sending the full object, as `Seo.tsx`'s form does). */
export function buildSettingsPatch(required: { form: FormData; current: CommentsSettings }): Partial<CommentsSettings> {
  const { form, current } = required;
  const patch: Partial<CommentsSettings> = {};

  const enabled = form.get("enabled") === "on";
  if (enabled !== current.enabled) patch.enabled = enabled;

  const requireModeration = form.get("requireModeration") === "on";
  if (requireModeration !== current.requireModeration) patch.requireModeration = requireModeration;

  const maxDepthRaw = String(form.get("maxDepth") ?? "");
  const maxDepth = Number(maxDepthRaw);
  if (maxDepthRaw !== "" && Number.isFinite(maxDepth) && maxDepth !== current.maxDepth) patch.maxDepth = maxDepth;

  // REQ-10: blank means "never closes" -> null on the wire; the UI never sends the backend's
  // own -1 sentinel, only null or a positive number.
  const closeAfterDaysRaw = String(form.get("closeAfterDays") ?? "").trim();
  const closeAfterDaysNum = Number(closeAfterDaysRaw);
  const closeAfterDays =
    closeAfterDaysRaw === "" ? null : Number.isFinite(closeAfterDaysNum) ? closeAfterDaysNum : undefined;
  if (closeAfterDays !== undefined && closeAfterDays !== current.closeAfterDays) {
    patch.closeAfterDays = closeAfterDays;
  }

  const spamAutoRejectScoreRaw = String(form.get("spamAutoRejectScore") ?? "");
  const spamAutoRejectScore = Number(spamAutoRejectScoreRaw);
  if (spamAutoRejectScoreRaw !== "" && Number.isFinite(spamAutoRejectScore) && spamAutoRejectScore !== current.spamAutoRejectScore) {
    patch.spamAutoRejectScore = spamAutoRejectScore;
  }

  const maxPerIpPerHourRaw = String(form.get("maxPerIpPerHour") ?? "");
  const maxPerIpPerHour = Number(maxPerIpPerHourRaw);
  if (maxPerIpPerHourRaw !== "" && Number.isFinite(maxPerIpPerHour) && maxPerIpPerHour !== current.maxPerIpPerHour) {
    patch.maxPerIpPerHour = maxPerIpPerHour;
  }

  return patch;
}

/** REQ-09: client-side validates `spamAutoRejectScore` before the network call — mirrors the
 * backend's own `validateCommentsSettingsPatch` bound (`src/comments/settings.ts`). Returns the
 * error message to show, or `null` when the patch is valid. Split out of `save`'s body (originally
 * an inline `if`) because it is the one piece of that flow that computes a value rather than
 * performing an effect. */
export function validateSettingsPatch(patch: Partial<CommentsSettings>): string | null {
  if (patch.spamAutoRejectScore !== undefined && (patch.spamAutoRejectScore < 0 || patch.spamAutoRejectScore > 1)) {
    return "Spam auto-reject score must be between 0 and 1.";
  }
  return null;
}

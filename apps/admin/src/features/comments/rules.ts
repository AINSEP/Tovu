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

/** Permissions resolved once per {@link commentRowMenuItems} call and threaded into each
 *  candidate-item builder below, so each builder stays a single-condition pure function. */
interface RowMenuPermissions {
  canModerate: boolean;
  canDelete: boolean;
  canForceDelete: boolean;
}

function approveItem(comment: AdminComment, perms: RowMenuPermissions, handlers: CommentRowMenuHandlers): RowMenuItem | null {
  if (comment.status === "approved" || !perms.canModerate) return null;
  return { key: "approve", label: "Approve", onSelect: () => handlers.onModerate(comment, "approve") };
}

function spamItem(comment: AdminComment, perms: RowMenuPermissions, handlers: CommentRowMenuHandlers): RowMenuItem | null {
  if (comment.status === "spam" || !perms.canModerate) return null;
  return { key: "spam", label: "Spam", onSelect: () => handlers.onModerate(comment, "spam") };
}

function trashItem(comment: AdminComment, perms: RowMenuPermissions, handlers: CommentRowMenuHandlers): RowMenuItem | null {
  if (comment.status === "trash" || !perms.canDelete) return null;
  return { key: "trash", label: "Trash", onSelect: () => handlers.onModerate(comment, "trash") };
}

function restoreItem(comment: AdminComment, perms: RowMenuPermissions, handlers: CommentRowMenuHandlers): RowMenuItem | null {
  const isRestorable = comment.status === "spam" || comment.status === "trash";
  if (!isRestorable || !perms.canModerate) return null;
  return { key: "restore", label: "Restore", onSelect: () => handlers.onModerate(comment, "restore") };
}

/** REQ-06: purge only ever surfaces from the trash filter view (`currentFilterStatus === "trash"`),
 *  not merely a trashed comment reached under a different filter. Genuinely destructive (its own
 *  confirm copy: "cannot be undone") — `destructive: true`, unlike the reversible actions above. */
function purgeItem(
  comment: AdminComment,
  currentFilterStatus: CommentStatus,
  perms: RowMenuPermissions,
  handlers: CommentRowMenuHandlers,
): RowMenuItem | null {
  const inTrashFilter = currentFilterStatus === "trash" && comment.status === "trash";
  if (!inTrashFilter || !perms.canForceDelete) return null;
  return { key: "purge", label: "Purge", destructive: true, onSelect: () => handlers.onRequestPurge(comment) };
}

/** At-rest row actions for `RowMenu` — every condition here is copied verbatim from the inline
 *  buttons this replaces, so a permission/status combination that used to hide a button still
 *  omits the matching menu item rather than rendering a guaranteed-failing click. Each candidate
 *  item is its own single-condition pure function above; this just resolves permissions once and
 *  filters out the misses.
 *
 * @complexity Time/space: O(1) — at most five entries, no iteration; three `hasPermission` checks.
 */
export function commentRowMenuItems(
  comment: AdminComment,
  context: { permissions: readonly string[]; currentFilterStatus: CommentStatus },
  handlers: CommentRowMenuHandlers,
): RowMenuItem[] {
  const perms: RowMenuPermissions = {
    canModerate: hasPermission(context.permissions, "comments.moderate"),
    canDelete: hasPermission(context.permissions, "comments.delete"),
    canForceDelete: hasPermission(context.permissions, "comments.delete.force"),
  };

  const candidates = [
    approveItem(comment, perms, handlers),
    spamItem(comment, perms, handlers),
    trashItem(comment, perms, handlers),
    restoreItem(comment, perms, handlers),
    purgeItem(comment, context.currentFilterStatus, perms, handlers),
  ];
  return candidates.filter((item): item is RowMenuItem => item !== null);
}

/** A blank or non-numeric raw value means "no opinion" — the field is left out of the patch
 *  rather than coerced to `0`/`NaN`. Shared by every numeric settings field except
 *  `closeAfterDays`, whose blank case means something else (see {@link parseCloseAfterDays}). */
export function parseOptionalNumber(raw: string): number | undefined {
  if (raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** REQ-10: blank means "never closes" -> `null` on the wire; the UI never sends the backend's own
 *  `-1` sentinel, only `null` or a positive number. A non-numeric raw value is "no opinion"
 *  (`undefined`), same as the other numeric fields. */
export function parseCloseAfterDays(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

function diffCheckboxField<K extends "enabled" | "requireModeration">(
  form: FormData,
  key: K,
  current: CommentsSettings,
): Pick<CommentsSettings, K> | undefined {
  const value = form.get(key) === "on";
  return value !== current[key] ? ({ [key]: value } as Pick<CommentsSettings, K>) : undefined;
}

function diffNumberField<K extends "maxDepth" | "spamAutoRejectScore" | "maxPerIpPerHour">(
  form: FormData,
  key: K,
  current: CommentsSettings,
): Pick<CommentsSettings, K> | undefined {
  const value = parseOptionalNumber(String(form.get(key) ?? ""));
  return value !== undefined && value !== current[key] ? ({ [key]: value } as Pick<CommentsSettings, K>) : undefined;
}

function diffCloseAfterDaysField(
  form: FormData,
  current: CommentsSettings,
): Pick<CommentsSettings, "closeAfterDays"> | undefined {
  const closeAfterDays = parseCloseAfterDays(String(form.get("closeAfterDays") ?? ""));
  return closeAfterDays !== undefined && closeAfterDays !== current.closeAfterDays ? { closeAfterDays } : undefined;
}

/** REQ-08/09/10: builds a partial patch containing only the fields the operator actually changed
 * (the backend's `setCommentsSettings` is a partial-patch contract — REQ-08 asks the client to
 * mirror that instead of always sending the full object, as `Seo.tsx`'s form does). Each field's
 * diff logic is a standalone pure helper above so it can be tested (and reasoned about) on its
 * own; this function is just the merge. */
export function buildSettingsPatch(required: { form: FormData; current: CommentsSettings }): Partial<CommentsSettings> {
  const { form, current } = required;
  return {
    ...diffCheckboxField(form, "enabled", current),
    ...diffCheckboxField(form, "requireModeration", current),
    ...diffNumberField(form, "maxDepth", current),
    ...diffCloseAfterDaysField(form, current),
    ...diffNumberField(form, "spamAutoRejectScore", current),
    ...diffNumberField(form, "maxPerIpPerHour", current),
  };
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

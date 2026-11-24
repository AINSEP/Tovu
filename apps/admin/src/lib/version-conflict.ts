// VERSION_CONFLICT_CODE is the server's machine-readable code for a superseded basis version.
import { VERSION_CONFLICT_CODE, type SaveConflict } from "@jini-ai/core/optimistic-concurrency";
import { ApiError } from "./admin-http/request";

/**
 * @file The one classifier for "this save lost a compare-and-set", shared by every editor whose
 * route answers a stale `expectedVersion` with `409` + `code: "VERSION_CONFLICT"` (posts, pages,
 * entries, menus). Keyed on the `code`, never the status alone: the same routes also send code-less
 * 409s (a slug already taken, a slug held by a trashed item) whose server message is the useful
 * copy, so a bare `status === 409` check would hide those behind "someone else changed this".
 */

/**
 * The English key (and copy) an editor without its own conflict banner shows for a lost
 * compare-and-set; translated in `COMMON_I18N`, so any feature translator resolves it. Says what an
 * operator cannot infer from the screen: nothing was saved, the edits are still in front of them,
 * and a reload (which drops those edits) is what shows the other person's version.
 */
export const VERSION_CONFLICT_MESSAGE =
  "Someone else changed this while you were editing. Your changes were not saved. Copy anything you want to keep, then reload to see their version.";

/**
 * Whether a caught save error is the stale-version 409.
 *
 * @complexity Time/space: O(1).
 */
export function isVersionConflict(required: { error: unknown }, _optional: Record<string, never> = {}): required is { error: ApiError } {
  const { error } = required;
  return error instanceof ApiError && error.status === 409 && error.code === VERSION_CONFLICT_CODE;
}

/**
 * Classifies a caught save error: the version conflict, or `null` for everything else (including the
 * slug-uniqueness 409, which is the same status from the same error class and must NOT take this
 * branch — that is the trap this function exists to close).
 *
 * Reads both versions out of the response `details` rather than parsing the message prose, and
 * tolerates their absence (`null`) rather than throwing: an older server that returns the code
 * without the detail bag must still produce a conflict the editor reacts to, since misreading a
 * conflict as an ordinary error is what loses an operator's work.
 *
 * @complexity Time/space: O(1).
 */
export function readVersionConflict(
  required: { error: unknown; attemptedStatus: "draft" | "published" | undefined },
  _optional: Record<string, never> = {},
): SaveConflict | null {
  if (!isVersionConflict(required)) return null;
  const details = (required.error.body?.details ?? {}) as Record<string, unknown>;
  return {
    expectedVersion: typeof details.expectedVersion === "number" ? details.expectedVersion : null,
    currentVersion: typeof details.currentVersion === "number" ? details.currentVersion : null,
    attemptedStatus: required.attemptedStatus,
  };
}

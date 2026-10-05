import { ApiError } from "./api";

/**
 * @file The one classifier for "this save lost a compare-and-set", shared by every editor whose
 * route answers a stale `expectedVersion` with `409` + `code: "VERSION_CONFLICT"` (posts, pages,
 * entries, menus). Keyed on the `code`, never the status alone: the same routes also send code-less
 * 409s (a slug already taken, a slug held by a trashed item) whose server message is the useful
 * copy, so a bare `status === 409` check would hide those behind "someone else changed this".
 */

/** The server's machine-readable code for a superseded basis version. */
export const VERSION_CONFLICT_CODE = "VERSION_CONFLICT";

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
export function isVersionConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409 && error.code === VERSION_CONFLICT_CODE;
}

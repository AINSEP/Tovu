import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import type { HeldBackApprovalResult, HeldBackCheckResult, HeldBackRestoreResult, HeldBackThemesList } from "@jini-ai/core/contracts/site/cms-admin-held-back-themes";

/**
 * @file The admin API calls behind the Themes screen's "Held back on import" section (A452).
 *
 * Site import sets aside every theme that fails the safety checks under the site's import
 * quarantine. Their ids carry a slash (`static/foo`), so — unlike `themesApi` — the id always
 * travels in the request BODY, never the URL, and the path is `held-back-themes` rather than
 * `themes/...` (`GET themes/:themeId` is registered earlier and would swallow it).
 */

const BASE_PATH = `/workspaces/${WORKSPACE_ID}/held-back-themes`;

/** POST helper: every write sends its ids as JSON. */
function post<T>({ path, body }: { path: string; body: Record<string, string> }, _optional: Record<string, never> = {}) {
  return request<T>({ path }, { init: { method: "POST", body: JSON.stringify(body) } });
}

/** The held-back-themes admin calls. Refusals surface as `ApiError` carrying the contract's `code`. */
export const heldBackThemesApi = {
  /** Needs `theme.set` (the same read gate as the themes list). */
  list: (_required: Record<string, never> = {}, _optional: Record<string, never> = {}) => request<HeldBackThemesList>({ path: BASE_PATH }),
  /** Read-only re-check. 400 `INVALID_ID`, 404 `HELD_BACK_NOT_FOUND`. */
  check: ({ themeId }: { themeId: string }, _optional: Record<string, never> = {}) =>
    post<HeldBackCheckResult>({ path: `${BASE_PATH}/check`, body: { themeId } }),
  /** Records the owner's "Restore" click on the approval card for the checked plan. Needs `theme.edit`. */
  approveRestore: ({ themeId, planId, planHash }: { themeId: string; planId: string; planHash: string }, _optional: Record<string, never> = {}) =>
    post<HeldBackApprovalResult>({ path: `${BASE_PATH}/restore/approval`, body: { themeId, planId, planHash, decision: "approve" } }),
  /**
   * Moves the theme to its live place (never activates it). Needs `theme.edit`, the check's digest (a
   * version check) AND the approval's token. Refusals: 400 `APPROVAL_REQUIRED`/`INVALID_ID`;
   * 403 `ACTOR_CLASS_MISMATCH`; 404 `HELD_BACK_NOT_FOUND`; 409 `CHECK_FAILED` (with `problems`),
   * `CHANGED_SINCE_CHECK`, `NAME_TAKEN`, `PLAN_STALE`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_REDEEMED`.
   */
  restore: ({ themeId, approvedDigest, confirmationToken }: { themeId: string; approvedDigest: string; confirmationToken: string }, _optional: Record<string, never> = {}) =>
    post<HeldBackRestoreResult>({ path: `${BASE_PATH}/restore`, body: { themeId, approvedDigest, confirmationToken } }),
};

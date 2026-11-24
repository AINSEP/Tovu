import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";

/**
 * @file The admin API calls behind the Themes screen's "Held back on import" section (A452).
 *
 * Site import sets aside every theme that fails the safety checks under the site's import
 * quarantine. Their ids carry a slash (`static/foo`), so — unlike `themesApi` — the id always
 * travels in the request BODY, never the URL, and the path is `held-back-themes` rather than
 * `themes/...` (`GET themes/:themeId` is registered earlier and would swallow it).
 */

/** One theme set aside by a site import. */
export interface HeldBackTheme {
  /** Quarantine id, with a slash (`static/foo`); the key for check and restore. */
  id: string;
  /** The manifest's name, else the folder name. */
  name: string;
  tier: "static" | "declarative";
  /** It came from the site's `__original-themes__` catalogue rather than its live themes. */
  original: boolean;
  files: number;
  bytes: number;
}

/** The theme the site had chosen before import swapped it for the default one. */
export interface ChosenThemeHeldBack {
  themeId: string;
  name: string;
  /** The theme visitors see instead. */
  fallbackThemeId: string;
}

export interface HeldBackThemesList {
  themes: HeldBackTheme[];
  /** `null` unless the chosen theme is still held back and the owner has not picked another since. */
  chosenThemeHeldBack: ChosenThemeHeldBack | null;
}

/** The server's fresh safety check of one held-back theme. */
export interface HeldBackCheckResult {
  themeId: string;
  passes: boolean;
  /** Plain-words reasons; empty when `passes`. */
  problems: string[];
  /** Fingerprint of the checked files — only when `passes`; restore must echo it back. */
  digest: string | null;
  /** A live theme folder already exists where this one would go. */
  nameTaken: boolean;
  /** The plan the approval card confirms — only when `passes`; `null` otherwise. */
  approval: { planId: string; planHash: string } | null;
}

/** The server's record of the approval card's answer; only an approval carries a token. */
export interface HeldBackApprovalResult {
  approved: boolean;
  /** Single-use, bound to this person, workspace, theme and digest. */
  confirmationToken?: string;
}

export interface HeldBackRestoreResult {
  theme: { id: string; name: string; status: "valid" | "invalid" };
  restoredFrom: string;
}

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

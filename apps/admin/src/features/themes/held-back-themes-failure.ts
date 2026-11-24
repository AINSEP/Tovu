import { formatUserFacingError, type UserFacingError } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import type { Translate } from "@jini-ai/core/text";

import { ApiError, describeApiError } from "../../lib/admin-http/request";

/**
 * @file Plain-words copy for what the held-back-themes routes refuse with (A452 contract codes).
 * Pure: no state, no requests — the hook decides what to do with the result.
 */

/** Dictionary keys (also the English copy) by contract `code`. */
const MESSAGE_BY_CODE: Record<string, string> = {
  APPROVAL_REQUIRED: "Restoring needs your approval. Check the theme, then confirm again.",
  CHECK_FAILED: "This theme still fails the safety checks, so it stays held back.",
  CHANGED_SINCE_CHECK: "This theme changed since you checked it — check again.",
  NAME_TAKEN: "A theme with this name is already installed, so this one can't be restored.",
  HELD_BACK_NOT_FOUND: "This theme is no longer held back. The list was refreshed.",
};

/** What a row (or the list) shows after a refused or failed call. */
export interface HeldBackFailure {
  message: string;
  /** Plain-words reasons from a failed check; empty for every other failure. */
  problems: string[];
  /** Set only for an unexpected failure that carries the server's `ERR-` reference. */
  report: UserFacingError | null;
}

/** The server's `errorId` (the `ERR-` reference), when the body carries one. */
function errorIdOf(error: unknown): string | undefined {
  return error instanceof ApiError && typeof error.body?.errorId === "string" ? error.body.errorId : undefined;
}

/** `problems` from a `CHECK_FAILED` body, keeping only strings. */
function problemsOf(error: ApiError): string[] {
  const problems = error.body?.problems;
  return Array.isArray(problems) ? problems.filter((problem): problem is string => typeof problem === "string") : [];
}

/**
 * Turns a thrown call error into copy. A contract code gets its own plain-words message; anything
 * else keeps the server's message and, when the body has one, its `ERR-` reference (the same
 * `formatUserFacingError` disclosure the Skills screen uses), so an unexpected failure can be reported.
 *
 * @param required.error - What the port rejected with.
 * @param required.fallbackKey - Dictionary key shown when the error has no message of its own.
 * @complexity O(problems) time and space.
 */
export function heldBackFailure(
  { error, fallbackKey, t }: { error: unknown; fallbackKey: string; t: Translate },
  _optional = {},
): HeldBackFailure {
  const known = error instanceof ApiError && error.code !== undefined ? MESSAGE_BY_CODE[error.code] : undefined;
  if (known !== undefined && error instanceof ApiError) return { message: t(known), problems: problemsOf(error), report: null };
  const message = describeApiError({ e: error, fallback: t(fallbackKey) });
  const errorId = errorIdOf(error);
  if (errorId === undefined) return { message, problems: [], report: null };
  const report = formatUserFacingError(
    { message, action: t("Try again, and report this reference if it keeps happening."), step: "held-back-themes", cause: error },
    { ...TOVU_ERROR_REDACTION_OPTIONS, errorId },
  );
  return { message, problems: [], report };
}

/** Whether a list refusal means "this owner cannot see the section" (no permission, or an older server). */
export function isSectionUnavailable({ error }: { error: unknown }, _optional = {}): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

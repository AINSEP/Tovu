import { formatUserFacingError, type UserFacingError } from "@jini-ai/core";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { ApiError, describeApiError } from "../../lib/api";

/** Format Skills failures at the admin disclosure boundary, preserving the server incident ID.
 * @param input Original failure, operation fallback and the current feature translator.
 * @returns Redacted, bounded details; no transport or clipboard effects.
 * @complexity O(diagnostic characters) time/space; output is capped by the shared formatter.
 * @example skillFailure({ error, message: "Could not load skills.", t });
 */
export function skillFailure(
  { error, message, t }: { error: unknown; message: string; t: Translate },
  _options = {},
): UserFacingError {
  return formatUserFacingError({ message: t(describeApiError(error, message)),
    action: t("Reload skills before trying the change again."), step: "skills", cause: error },
  { ...TOVU_ERROR_REDACTION_OPTIONS,
    errorId: error instanceof ApiError && typeof error.body?.errorId === "string" ? error.body.errorId : undefined });
}

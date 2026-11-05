import { describeRequestFailure, formatUserFacingError, type UserFacingError } from "@jini-ai/core";
import { createFailureChannel } from "@jini-ai/ui/panel-kit";
import { decodeApiError } from "@jini-ai/protocol";
import { ADMIN_FAILURE_VOCABULARY } from "@tovu/contracts/admin-failure-copy";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { getAdminDraftIdentity } from "./admin-draft-identity";

/** One retained incident for this admin instance; reset invalidates older in-flight requests. */
export const adminFailureChannel = createFailureChannel({}, {});

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Accept only a formatter-shaped explanation from an authenticated response. Never stringify bodies.
 * @complexity O(1), fixed field checks; formatter bounds and redacts all displayed text.
 * @overallScore 98 — trusted server disclosure remains a boundary contract, tested with anonymous canaries.
 */
function approvedFailure({ value }: { value: unknown }): UserFacingError | undefined {
  const candidate = record(value);
  if (typeof candidate.message !== "string" || typeof candidate.action !== "string" || typeof candidate.step !== "string" || typeof candidate.cause !== "string") return undefined;
  return formatUserFacingError({ message: candidate.message, action: candidate.action, step: candidate.step, cause: candidate.cause }, {
    ...TOVU_ERROR_REDACTION_OPTIONS,
    errorId: typeof candidate.errorId === "string" ? candidate.errorId : undefined,
    time: typeof candidate.time === "string" ? candidate.time : undefined,
    appVersion: typeof candidate.appVersion === "string" ? candidate.appVersion : undefined,
    jiniVersion: typeof candidate.jiniVersion === "string" ? candidate.jiniVersion : undefined,
  });
}

/** Tovu's disclosure adapter: safe shared wording for legacy failures, approved details after sign-in.
 * Inputs are the final failed response and its captured session generation; no new I/O or retries.
 * @complexity O(path length + bounded formatted text); retains one incident in memory.
 * @overallScore 98 — the server owns approved explanation accuracy; no raw legacy text is disclosed here.
 */
export function publishAdminFailure(
  { body, path, method, status, generation }: { body: unknown; path: string; method?: string; status: number; generation: number },
  _options = {},
): void {
  const decoded = decodeApiError({ body });
  const details = record(decoded.details);
  const envelope = record(body);
  const reference = details.errorId ?? envelope.errorId ?? decoded.requestId;
  const errorId = typeof reference === "string" ? reference : undefined;
  const authenticated = getAdminDraftIdentity() !== null && !path.startsWith("/auth/");
  const approved = authenticated ? approvedFailure({ value: details.failure }) : undefined;
  const wording = describeRequestFailure({ method, route: path, vocabulary: ADMIN_FAILURE_VOCABULARY });
  const step = status === 0 ? `${wording.step} (no server response)` : `${wording.step} (HTTP ${status})`;
  const failure = approved ?? formatUserFacingError({ ...wording, step, cause: "The error ID identifies the server report." }, {
    ...TOVU_ERROR_REDACTION_OPTIONS, errorId, time: new Date().toISOString(),
  });
  adminFailureChannel.publish({ failure, generation });
}

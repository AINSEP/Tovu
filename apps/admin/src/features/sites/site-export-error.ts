import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { formatUserFacingError, type UserFacingError } from "@jini-ai/core";
import { decodeApiError } from "@jini-ai/protocol";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { ApiError, describeApiError } from "@/lib/api";

const EXPORT_FAILURE_FIELDS = ["message", "action", "step", "cause", "errorId", "appVersion", "jiniVersion", "time"];

/** Export's wire adapter. Reformat the server's fields rather than trusting a supplied copy block.
 * Legacy refusals keep their explanation. No fetch, clock, retry or clipboard side effects.
 * @complexity O(response fields + diagnostic characters); one bounded copy block in component state.
 */
export function siteExportFailure({ error, t }: { error: unknown; t: Translate }, _options = {}): UserFacingError {
  const saved = exportFailureFields({ error });
  return formatUserFacingError({
    message: saved.message ?? describeApiError(error, t("The site export could not finish.")),
    action: saved.action ?? t("Check export history before starting another export. Copy details and report this problem."),
    step: saved.step ?? "export request",
    cause: saved.cause ?? error,
  }, { ...saved, ...TOVU_ERROR_REDACTION_OPTIONS });
}

/** Admit only the export envelope's string fields; ignore a wire-supplied copy block entirely. */
function exportFailureFields({ error }: { error: unknown }): Partial<UserFacingError> {
  if (!(error instanceof ApiError)) return {};
  const details = decodeApiError({ body: error.body }).details;
  if (!details || typeof details !== "object") return {};
  const record = (details as { failure?: unknown }).failure;
  if (!record || typeof record !== "object") return {};
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => EXPORT_FAILURE_FIELDS.includes(key) && typeof value === "string"));
}

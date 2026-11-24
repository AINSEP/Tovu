/**
 * @file Tovu's binding of `@jini-ai/admin`'s page-wide failure reporter: Tovu's failure vocabulary,
 * secret redaction, version labels and server codes. Jini owns the disclosure rules; this module
 * calls the factory once and the app imports the bound values.
 */
import { describeRequestFailure, formatUserFacingError } from "@jini-ai/core";
import { createFailureChannel } from "@jini-ai/ui/panel-kit";
import { decodeApiError } from "@jini-ai/protocol";
import { describeRequestFailure, formatUserFacingError } from "@jini-ai/core";
import { createAdminFailureReporter } from "@jini-ai/admin/shell/lib/admin-failure-reporter";
import { ADMIN_FAILURE_VOCABULARY } from "@tovu/contracts/admin-failure-copy";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { JINI_CORE_VERSION, TOVU_ADMIN_VERSION } from "./app-version";

/** The server's codes for "the assistant's background service is not running right now". Boot
 * registers the agent daemon without spawning it, and an idle daemon parks; passive reads must not
 * wake it (W4-E2), so they answer one of these until the dock activates it or a message is sent.
 * `AGENT_DAEMON_KNOWN_FAILED` (a boot that really failed) is deliberately absent: that stays loud. */
const ASSISTANT_NOT_RUNNING_CODES: ReadonlySet<string> = new Set(["AGENT_DAEMON_PARKED", "AGENT_DAEMON_UNAVAILABLE"]);

/** One retained incident for this admin instance; reset invalidates older in-flight requests. */
export const { adminFailureChannel, isPageWideFailure, publishAdminFailure, publishLocalAdminFailure } = createAdminFailureReporter({
  channel: createFailureChannel({}, {}),
  vocabulary: ADMIN_FAILURE_VOCABULARY,
  redaction: TOVU_ERROR_REDACTION_OPTIONS,
  appVersion: `Tovu Admin ${TOVU_ADMIN_VERSION}`,
  jiniVersion: JINI_CORE_VERSION,
  decodeError: decodeApiError,
  notRunningCodes: ASSISTANT_NOT_RUNNING_CODES,
  formatUserFacingError,
  describeRequestFailure,
});

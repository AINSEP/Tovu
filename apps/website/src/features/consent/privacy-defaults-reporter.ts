import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";

/**
 * @file The host's reporter for a failed consent privacy-page repair. `@jini-ai/cookie-consent/site/settings`
 * requires it whenever a repair is passed; the host owns the console channel, the `[consent]` line
 * prefix and the redaction options, so the log line stays byte-identical to the pre-extraction one.
 */

/**
 * Logs the redacted failure (message + stack, secrets masked) without blocking consent readiness.
 * @param required.error - The value the repair threw.
 * @complexity O(message + stack length) for redaction.
 */
export function reportPrivacyDefaultsFailure({ error }: { error: unknown }, _optional: Record<string, never> = {}): void {
  console.error(`[consent] privacy defaults failed: ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`);
}

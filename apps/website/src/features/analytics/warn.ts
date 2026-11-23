/**
 * @file The host's analytics warn reporters. `@jini-ai/analytics/site/forwarding` reports plain
 * messages through a REQUIRED `warn`; the host owns the channel (`console.warn`) and the
 * `[analytics]` line prefix operators grep for, so the log lines stay byte-identical to the
 * pre-extraction output. `reportAnalyticsForwardFailure` is the REQUIRED
 * `AnalyticsIngestRouteDeps.reportForwardFailure` of `@jini-ai/analytics/site/jini-adapters`.
 */

import type { AnalyticsForwardReport } from "@jini-ai/analytics";

/**
 * Writes one analytics warning to the host console, prefixed `[analytics] `.
 * @param message - A plain package message (never key material; the package builds it from fixed text).
 * @complexity O(1).
 */
export function warnAnalytics(message: string): void {
  console.warn(`[analytics] ${message}`);
}

/**
 * Vendor failures are logged by forwarder id and outcome only — never the hit or a payload.
 * @complexity O(1).
 */
export const reportAnalyticsForwardFailure: AnalyticsForwardReport = ({ forwarderId, outcome, message }) =>
  console.warn(`[analytics] forward to '${forwarderId}' ${outcome}: ${message}`);

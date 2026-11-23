/**
 * @file The host's analytics HKDF wire context, injected into `@jini-ai/analytics/site/jini-adapters`
 * (`AnalyticsIngestRouteDeps.saltContext`) and `@jini-ai/analytics/site/salt`. The package never
 * defines these bytes; the host pins them so existing visitor/session hashes stay stable.
 */
import type { AnalyticsSaltContext } from "@jini-ai/analytics";

/**
 * Host-owned HKDF wire context: changing either string changes existing visitor/session hashes.
 * The fixed non-secret extraction salt pins the extraction step reproducibly across processes;
 * uniqueness comes from the secret analytics seed and the workspace/date info, not this constant.
 */
export const analyticsSaltContext: AnalyticsSaltContext = {
  extractionSalt: "tovu-analytics-daily-salt-hkdf-v1",
  infoPrefix: "analytics-salt:",
};

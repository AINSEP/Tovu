/**
 * @file Public surface of the `analytics` core library (Tier-2, §3.5).
 *
 * This barrel is the module's ADR-009 typed-call boundary — other modules import from here,
 * never via deep paths. TYPES/INTERFACES ONLY at this stage (ADR-035 draft): the concrete
 * ingest/rollup/query services and adapters land against this surface later.
 */

export type {
  AggregateDelta,
  AnalyticsConfigPort,
  AnalyticsDomainEvent,
  AnalyticsHooks,
  AnalyticsRepoPort,
  AnalyticsSinkCapabilities,
  AnalyticsSinkPort,
  IngestDeps,
  IngestRequired,
  QueryDeps,
  QueryRequired,
  RollupDeps,
  RollupInput,
  RollupRequired,
  RollupResult,
} from "./ports.js";

export {
  AnalyticsDisabledError,
  AnalyticsPiiRejectedError,
  AnalyticsValidationError,
  AnalyticsWorkspaceUnresolvedError,
} from "./ports.js";
export type { VisitorAnalyticsDeps } from "./contracts.js";
export { createAnalyticsIngestBinding, type AnalyticsIngestRouteDeps } from "./jini-adapters.js";

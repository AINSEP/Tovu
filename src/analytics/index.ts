/**
 * @file Public surface of the `analytics` core library (Tier-2, §3.5).
 *
 * This barrel is the module's ADR-009 typed-call boundary — other modules import from here,
 * never via deep paths. TYPES/INTERFACES ONLY at this stage (ADR-035 draft): the concrete
 * ingest/rollup/query services and adapters land against this surface later.
 */
export type {
  AnalyticsAggregateRow,
  AnalyticsDomainEventName,
  AnalyticsDomainEventPayloads,
  AnalyticsEventRow,
  AnalyticsGoalDef,
  AnalyticsGranularity,
  AnalyticsPermission,
  AnalyticsSessionRow,
  AnalyticsSinkKind,
  AnalyticsSiteConfig,
  BreakdownRow,
  DeviceClass,
  DimensionName,
  DimensionOverflowValue,
  GoalTriggeredPayload,
  HitKind,
  IngestBeacon,
  IngestContext,
  MetricName,
  NormalizedHit,
  RealtimeSnapshot,
  RollupCompletedPayload,
  StatsFilter,
  StatsQuery,
  StatsResult,
  TimeSeriesPoint,
  UtmParams,
  VisitorSketch,
} from "./types.js";

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

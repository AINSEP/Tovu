/**
 * @file Operator-facing configuration for `platform/observability` — off by default.
 *
 * Mirrors the `fooFromEnv(env = process.env)` shape `features/deployments/publish-credentials/
 * execution-mode.ts`'s `executionModeFromEnv` already establishes: a safe default plus an
 * injectable `env` parameter so tests supply a fake env object instead of mutating the real
 * `process.env` (see that file's own test for the precedent this one follows).
 *
 * Deliberately reads OpenTelemetry's OWN standard env vars (`OTEL_EXPORTER_OTLP_ENDPOINT`,
 * `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_SERVICE_NAME`) rather than inventing `TOVU_OTEL_*`
 * equivalents. Every other env-driven default in this composition root (`TOVU_CONTENT_DB`,
 * `TOVU_SITE_DIR`, `TOVU_EXECUTION_MODE`, …) is `TOVU_*`-namespaced because it names a
 * Tovu-specific concept with no existing standard. An OTLP endpoint is not that: it is
 * OpenTelemetry's own config surface, and an operator following OpenTelemetry's own setup docs for
 * any other language already knows these names.
 *
 * This module deliberately does NOT resolve or expose the endpoint URL itself, only whether one is
 * configured. `otel.ts` constructs `new OTLPTraceExporter()` with no explicit `url`, letting the
 * OTLP SDK's own env resolution (`@opentelemetry/otlp-exporter-base`) pick the endpoint — that
 * resolution is spec-defined and non-trivial (`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is used
 * VERBATIM; the general `OTEL_EXPORTER_OTLP_ENDPOINT` gets `/v1/traces` APPENDED, per the
 * OpenTelemetry spec's base-vs-per-signal distinction). Re-deriving that logic here to build a
 * `url` string and pass it through the constructor would both duplicate the SDK's own
 * spec-compliant behavior and get the base-endpoint case wrong (an operator who sets the
 * documented general var without a `/v1/traces` suffix — the common case — would silently 404
 * against every real collector).
 */

/** Built when no OTLP endpoint env var is configured — the default for almost every self-hosted
 *  install. `index.ts`'s `createObservabilityPort` maps this straight to the no-op port without
 *  ever loading the OTel SDK. */
export interface ObservabilityConfigDisabled {
  enabled: false;
}

/** Built once an operator has set either OTLP endpoint env var (see file header for why the actual
 *  URL is resolved by the OTel SDK itself, not exposed here). */
export interface ObservabilityConfigEnabled {
  enabled: true;
  serviceName: string;
}

export type ObservabilityConfig = ObservabilityConfigDisabled | ObservabilityConfigEnabled;

/**
 * Resolves operator configuration from the environment. Either a non-empty
 * `OTEL_EXPORTER_OTLP_ENDPOINT` or a non-empty `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` decides
 * `enabled` — the two standard OTel env vars that mean "an operator configured an exporter" — which
 * is what keeps telemetry off by default for a self-hosted install whose operator never opted in.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function resolveObservabilityConfig(env: NodeJS.ProcessEnv = process.env): ObservabilityConfig {
  const otlpConfigured = Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) || Boolean(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim());
  if (!otlpConfigured) return { enabled: false };

  return {
    enabled: true,
    serviceName: env.OTEL_SERVICE_NAME?.trim() || "tovu",
  };
}

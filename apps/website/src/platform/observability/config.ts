// Endpoint policy: Jini/packages/diagnostics/src/observability/config.ts.
import { resolveObservabilityConfig as resolveDiagnosticConfig, type ObservabilityConfig } from "@jini-ai/diagnostics/observability";

/**
 * Resolves Tovu telemetry policy from an explicit environment snapshot. Standard OTLP endpoint
 * names enable telemetry; absent endpoints disable it. Jini handles per-signal/base URL resolution.
 * @param required Operator environment; composition owns the process.env read.
 * @returns Disabled config, or enabled config with Tovu's default service/tracer identity.
 * @complexity O(1) time and space aside from endpoint string normalization.
 * @example resolveObservabilityConfig({ env: process.env });
 *
 * Operator-facing configuration for `platform/observability` — off by default.
 *
 * Originally mirrored the `fooFromEnv(env = process.env)` shape `features/deployments/publish-credentials/
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
 * Originally this module deliberately did not resolve or expose the endpoint URL, only whether
 * one was configured. The SDK's zero-argument OTLPTraceExporter constructor applied the
 * spec-defined base-vs-per-signal distinction. The refactor keeps that distinction in Jini's
 * explicit resolver: OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is used verbatim, while the general
 * OTEL_EXPORTER_OTLP_ENDPOINT gets /v1/traces appended. Treating the general endpoint as a
 * complete traces URL silently 404s against collectors in the common operator configuration.
 * The host now supplies that resolved endpoint to the SDK so the injected environment snapshot
 * and the exporter cannot disagree. The status route still reports only enabled/serviceName;
 * it must never disclose collector hostnames or credentials from this internal configuration.
 */
export function resolveObservabilityConfig({ env }: { env: NodeJS.ProcessEnv }): ObservabilityConfig {
  return resolveDiagnosticConfig({
    serviceName: env.OTEL_SERVICE_NAME?.trim() || "tovu",
    tracerName: "tovu.observability",
  }, {
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    tracesEndpoint: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  });
}

import type { ObservabilityPort, RequestTracker } from "./ports.js";

/**
 * The shared, do-nothing tracker every `trackRequest()` call from the no-op port returns. One
 * frozen object reused across every call (never constructed per-request) so the default path pays
 * zero allocation cost per request, not merely zero I/O cost.
 */
const NOOP_TRACKER: RequestTracker = Object.freeze({ end(): void {} });

/**
 * The default `ObservabilityPort` — every method is a no-op. Tovu ships to operators who self-host
 * their own instance; `platform/observability/config.ts`'s `resolveObservabilityConfig` is off
 * unless an operator sets `OTEL_EXPORTER_OTLP_ENDPOINT`, so this is the port implementation the
 * overwhelming majority of real boots actually run. It must never allocate, time, branch, or touch
 * the network beyond returning the one shared tracker above.
 *
 * @complexity O(1), zero allocation per call.
 * @overallScore 100
 */
export function createNoopObservabilityPort(): ObservabilityPort {
  return {
    trackRequest(): RequestTracker {
      return NOOP_TRACKER;
    },
  };
}

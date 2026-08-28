import { createRequire } from "node:module";

import { createNoopObservabilityPort } from "./noop.js";
import { resolveObservabilityConfig } from "./config.js";
import type { ObservabilityConfig } from "./config.js";
import type { ObservabilityPort } from "./ports.js";

export type { ObservabilityConfig, ObservabilityConfigDisabled, ObservabilityConfigEnabled } from "./config.js";
export { resolveObservabilityConfig } from "./config.js";
export type { ObservabilityPort, RequestTracker, RequestTrackingInput, RequestTrackingOutcome } from "./ports.js";
export { createNoopObservabilityPort } from "./noop.js";

const require = createRequire(import.meta.url);

/**
 * Builds the `ObservabilityPort` a composition root should inject into `RouteDeps.observability`.
 * `config` defaults to {@link resolveObservabilityConfig}'s real env read; both composition roots
 * (`server/runtime/composition/deps.ts`'s `createSqliteRouteDeps`, the real running server) call
 * this with no argument. `server/runtime/composition/app.ts`'s hermetic `createRouteDeps()`
 * deliberately does NOT call this — it always uses {@link createNoopObservabilityPort} directly, so
 * a stray `OTEL_EXPORTER_OTLP_ENDPOINT` left in a developer's shell can never make the hermetic
 * test composition try to reach a real collector (the same "hermetic root gets the safe double,
 * SQLite root gets the real env-driven adapter" split every other rule-of-two pair in `RouteDeps`
 * already follows — `ConsoleMailerAdapter` vs `HttpApiMailerAdapter`, `InMemoryPublishHistoryStore`
 * vs `SqlitePublishHistoryStore`, etc.).
 *
 * The OTel adapter module is loaded lazily — see `otel.ts`'s file header for the full mechanism and
 * why it matters — so this function costs nothing beyond the `enabled` check for the common case.
 *
 * @complexity O(1); the disabled branch never touches the filesystem or module resolver.
 * @overallScore 100
 */
export function createObservabilityPort(config: ObservabilityConfig = resolveObservabilityConfig()): ObservabilityPort {
  if (!config.enabled) return createNoopObservabilityPort();

  const { createOtelObservabilityPort } = require("./otel.js") as typeof import("./otel.js");
  return createOtelObservabilityPort(config);
}

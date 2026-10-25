import { createRequire } from "node:module";
import { combineObservabilityPorts, createNoopObservabilityPort, type ObservabilityAdapter, type ObservabilityConfig, type ObservabilityPort } from "@jini-ai/diagnostics/observability";
import type { SentryConfig } from "./config.js";
// Decorators for the DB kernel, the guarded HTTP client and raw fetch; all are identity for the no-op port.
export { instrumentStorageKernel, isNoopObservabilityPort, trackFetch, trackHttpClient } from "@jini-ai/diagnostics/observability";

// Retained host adapter surface: consumers must continue to resolve these names while r15
// rewires the shared roots to the package and explicit configuration arguments.
export type { AgentRunStatus, ErrorReport, ObservabilityConfig, ObservabilityConfigDisabled, ObservabilityConfigEnabled, ObservabilityPort, RequestTracker, RequestTrackingInput, RequestTrackingOptions, RequestTrackingOutcome, OperationAttributes, OperationTracker, OperationTrackingInput, OperationTrackingOutcome } from "@jini-ai/diagnostics/observability";
export { createNoopObservabilityPort };
export { resolveObservabilityConfig, resolveSentryConfig, type SentryConfig } from "./config.js";

const require = createRequire(import.meta.url);

// Request-port rationale: Jini packages/diagnostics/src/observability/ports.ts.
// Zero-allocation disabled-request rationale: Jini/packages/diagnostics/src/observability/noop.ts.
// Hermetic roots choose the no-op directly so a stray OTEL_EXPORTER_OTLP_ENDPOINT in a developer's
// shell cannot cause tests to contact a real collector; only the running root uses operator config.
// Load the SDK with require only after enablement: composition is synchronous. The SDK adapters are
// Jini provider subpaths (owner 2026-10-25: "a provider plugin … no way it should be in core, because
// we're gonna want to use it for other projects"), so nothing under this directory imports
// `@opentelemetry/*` or `@sentry/*` (`observability-vendor-boundary.unit.test.ts`). Requiring a
// package's ESM subpath shares Node's one ESM module cache with the static imports above, so there is
// no second copy of the port module (and `isNoopObservabilityPort` identity holds). Literal specifiers
// so `no-first-party-require.boundary.test.ts` can see they are packages, not first-party modules.
/**
 * Selects the observability port from config: the noop, or the lazily required Jini provider
 * subpaths (OpenTelemetry, Sentry), fanned out when both are configured.
 * Disabled telemetry never loads the SDK. Composition supplies explicit operator configuration;
 * hermetic roots must call Jini's createNoopObservabilityPort({}) directly.
 * @param required Resolved telemetry policy.
 * @param optional `sentry` config; `onDispose` receives each enabled provider's teardown (the site
 *   store's `onClose` in `deps.ts`), so a closed site releases its SDK clients and timers.
 * @returns The diagnostics request-tracking port, with no global tracer registration.
 * @throws SDK initialization errors when enabled.
 * @complexity O(1) setup; requests are tracked by the package-owned lifecycle.
 * @example createObservabilityPort({ config: resolveObservabilityConfig({ env: process.env }) });
 *
 * The `observability` port (Constitution Article VIII) — now owned by Jini diagnostics.
 *
 * Purpose:
 * `ObservabilityPort` is the one seam every instrumented code path calls through. It is written
 * from THIS codebase's own vocabulary (`trackRequest`, matching how `2026-08-28-observability-
 * groundwork.md` §3 catalogued Tovu's real I/O surfaces — inbound HTTP today, DB queries/outbound
 * fetch/agent-daemon calls as later, separate additions) rather than from OpenTelemetry's
 * (`startSpan`/`Span`/`Tracer`). No OTel type appears in that request port, deliberately: the owner's
 * explicit intent is to be able to replace OpenTelemetry itself with a different instrumentation
 * system later, not merely to swap which backend OTel's Collector forwards to. A port shaped like
 * `startSpan(name, attributes)` would still be OTel underneath every wrapper; a port shaped like
 * `trackRequest` is a real seam because a non-OTel adapter could satisfy it without knowing what a
 * "span" is.
 *
 * Architectural role:
 * Mirrors `platform/mail/ports.ts`'s "port file has no concrete adapter" shape. Jini lifecycle adapters:
 * `noop.ts` (the default — see its own header for why it must cost nothing) and `otel.ts` (request lifecycle through structural factories); the SDK
 * provider subpaths (`observability/opentelemetry`, `observability/sentry`) are lazily required by this `createObservabilityPort`.
 *
 * Originally kept to one method (inbound HTTP, via `server/inbound/shared/observability-middleware.ts`):
 * `trackDbQuery`/`trackOutboundCall`/`trackAgentRun` were named as the port's next additions but
 * deliberately not built until each had a real call site to design the input/outcome shape against
 * — the same reason `trackRequest`'s shape follows Express's actual request/response lifecycle
 * rather than a guessed-in-advance generic shape. They now exist (2026-10-04), each shaped after its
 * seam: the storage kernel (`instrumentStorageKernel`, in `deps.ts`), the guarded HTTP client
 * (`createDefaultHttpClient(policy, { observability })`) and the agent-run finalizer
 * (`assistant-run-finalizer.ts`). The SDK adapter also gets an AsyncLocalStorage span scope so
 * those spans nest under the request that caused them.
 *
 * The shared, do-nothing tracker every `trackRequest()` call from the no-op port returns. One
 * Jini-owned frozen object reused across every call (never constructed per-request) so the default path pays
 * zero allocation cost per request, not merely zero I/O cost.
 * The default `ObservabilityPort` — every method is a no-op. Tovu ships to operators who self-host
 * their own instance; Tovu's `resolveObservabilityConfig({ env })` is off
 * unless an operator sets an OTLP endpoint (general or traces-specific), so this is the implementation the
 * overwhelming majority of real boots actually run. It must never allocate, time, branch, or touch
 * the network beyond returning Jini's one shared tracker.
 *
 * @complexity O(1), zero allocation per call.
 *
 * Builds the `ObservabilityPort` a composition root should inject into `RouteDeps.observability`.
 * Historically `config` defaulted to resolveObservabilityConfig's real env read, and the running
 * `server/runtime/composition/deps.ts` root called with no argument. The r15 integration must
 * supply `{ config: resolveObservabilityConfig({ env: process.env }) }` explicitly.
 * `server/runtime/composition/app.ts`'s hermetic `createRouteDeps()`
 * deliberately does NOT call this — it always uses {@link createNoopObservabilityPort} directly, so
 * a stray `OTEL_EXPORTER_OTLP_ENDPOINT` left in a developer's shell can never make the hermetic
 * test composition try to reach a real collector (the same "hermetic root gets the safe double,
 * SQLite root gets the real env-driven adapter" split every other rule-of-two pair in `RouteDeps`
 * already follows — `ConsoleMailerAdapter` vs `SmtpMailerAdapter`, `InMemoryPublishHistoryStore`
 * vs `SqlitePublishHistoryStore`, etc.).
 *
 * The OTel adapter module is loaded lazily — see the provider's file header
 * (Jini `diagnostics/src/observability/opentelemetry.ts`) for the full mechanism and why it matters —
 * so this function costs nothing beyond the `enabled` check for the common case.
 *
 * @complexity O(1); the disabled branch never touches the filesystem or module resolver.
 */
export function createObservabilityPort({ config }: { config: ObservabilityConfig }, { sentry, onDispose }: { sentry?: SentryConfig; onDispose?: (dispose: () => Promise<void>) => void } = {}): ObservabilityPort {
  if (!config.enabled && !sentry?.enabled) return createNoopObservabilityPort({});
  // Both configured: fan out (OpenTelemetry carries traces, Sentry carries incidents). Each adapter
  // is loaded only when its own setting is present; neither knows the other exists.
  const adapters = [createOtelAdapter({ config }), createSentryAdapter({ sentry })].filter((adapter) => adapter !== undefined);
  for (const adapter of adapters) onDispose?.(adapter.dispose);
  return combineObservabilityPorts({ ports: adapters.map((adapter) => adapter.port) });
}

function createOtelAdapter({ config }: { config: ObservabilityConfig }): ObservabilityAdapter | undefined {
  if (!config.enabled) return undefined;
  const { createOtelObservabilityAdapter }: typeof import("@jini-ai/diagnostics/observability/opentelemetry") = require("@jini-ai/diagnostics/observability/opentelemetry");
  return createOtelObservabilityAdapter({ config });
}

/** Same lazy-load rule as the OTel SDK: `@sentry/node` is required only once `SENTRY_DSN` is set. */
function createSentryAdapter({ sentry }: { sentry?: SentryConfig | undefined }): ObservabilityAdapter | undefined {
  if (!sentry?.enabled) return undefined;
  const { createSentryObservabilityAdapter }: typeof import("@jini-ai/diagnostics/observability/sentry") = require("@jini-ai/diagnostics/observability/sentry");
  return createSentryObservabilityAdapter({ config: sentry });
}

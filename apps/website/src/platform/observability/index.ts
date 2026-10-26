import { createNoopObservabilityPort } from "@jini-ai/diagnostics/observability";
// Decorators for the DB kernel, the guarded HTTP client and raw fetch; all are identity for the no-op port.
export { instrumentStorageKernel, isNoopObservabilityPort, trackFetch, trackHttpClient } from "@jini-ai/diagnostics/observability";

// Retained host adapter surface: consumers must continue to resolve these names.
export type { AgentRunStatus, ObservabilityConfig, ObservabilityConfigDisabled, ObservabilityConfigEnabled, ObservabilityPort, RequestTracker, RequestTrackingInput, RequestTrackingOptions, RequestTrackingOutcome } from "@jini-ai/diagnostics/observability";
export { createNoopObservabilityPort };

// Request-port rationale: Jini packages/diagnostics/src/observability/ports.ts.
// Zero-allocation disabled-request rationale: Jini/packages/diagnostics/src/observability/noop.ts.
// Hermetic roots choose the no-op directly so nothing in a developer's environment can make tests
// contact a real collector; only the running root selects configured provider plugins.
/**
 * @file Tovu's observability surface: Jini's vendor-neutral port, its no-op and its decorators.
 * Selection moved to provider plugins (provider wave 2, 2026-10-25): the real root
 * (`server/runtime/composition/deps.ts`) takes `observability` from
 * `server/runtime/composition/provider-plugins.ts` (installed + enabled + configured observability
 * plugins, fanned out; otherwise this no-op), so Tovu core loads no vendor SDK at all.
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
 * `noop.ts` (the default — see its own header for why it must cost nothing) and `otel.ts` (request
 * lifecycle through structural factories); the SDK factories now ship in the OTel provider plugin.
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
 * their own instance; observability is off unless an operator installs, enables and configures an
 * observability provider plugin, so this is the implementation the
 * overwhelming majority of real boots actually run. It must never allocate, time, branch, or touch
 * the network beyond returning Jini's one shared tracker.
 *
 * @complexity O(1), zero allocation per call.
 *
 * Which port a composition root injects into `RouteDeps.observability`: historically an env-driven
 * `createObservabilityPort({ config: resolveObservabilityConfig({ env }) })` here; since provider
 * wave 2 the real root selects provider plugins (`provider-plugins.ts`).
 * `server/runtime/composition/app.ts`'s hermetic `createRouteDeps()`
 * deliberately never selects them — it always uses {@link createNoopObservabilityPort} directly, so
 * nothing configured on a developer's machine can ever make the hermetic
 * test composition try to reach a real collector (the same "hermetic root gets the safe double,
 * SQLite root gets the real configured adapter" split every other rule-of-two pair in `RouteDeps`
 * already follows — `ConsoleMailerAdapter` vs `SmtpMailerAdapter`, `InMemoryPublishHistoryStore`
 * vs `SqlitePublishHistoryStore`, etc.).
 *
 * The OTel SDK is loaded only inside its provider plugin, so a default boot pays nothing for it.
 */

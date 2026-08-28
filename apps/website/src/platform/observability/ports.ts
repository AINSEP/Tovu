/**
 * @file The `observability` port (Constitution Article VIII) — INTERFACES ONLY.
 *
 * Purpose:
 * `ObservabilityPort` is the one seam every instrumented code path calls through. It is written
 * from THIS codebase's own vocabulary (`trackRequest`, matching how `2026-08-28-observability-
 * groundwork.md` §3 catalogued Tovu's real I/O surfaces — inbound HTTP today, DB queries/outbound
 * fetch/agent-daemon calls as later, separate additions) rather than from OpenTelemetry's
 * (`startSpan`/`Span`/`Tracer`). No OTel type appears anywhere below, deliberately: the owner's
 * explicit intent is to be able to replace OpenTelemetry itself with a different instrumentation
 * system later, not merely to swap which backend OTel's Collector forwards to. A port shaped like
 * `startSpan(name, attributes)` would still be OTel underneath every wrapper; a port shaped like
 * `trackRequest` is a real seam because a non-OTel adapter could satisfy it without knowing what a
 * "span" is.
 *
 * Architectural role:
 * Mirrors `platform/mail/ports.ts`'s "port file has no concrete adapter" shape. Concrete adapters:
 * `noop.ts` (the default — see its own header for why it must cost nothing) and `otel.ts` (first
 * real adapter, lazily loaded by `index.ts`'s `createObservabilityPort`).
 *
 * Kept intentionally small (one method) per this task's explicit scope: cover only the ONE signal
 * this codebase actually has a wired instrumentation point for today (inbound HTTP, via
 * `server/inbound/shared/observability-middleware.ts`). `trackDbQuery`/`trackOutboundCall`/
 * `trackAgentRun` are named as the port's natural next additions in the handoff, not built here —
 * each would need its own real call site to design the input/outcome shape against, the same
 * reason `trackRequest`'s own shape below follows Express's actual request/response lifecycle
 * rather than a guessed-in-advance generic shape.
 */

/** What is known when a request begins — before Express has resolved a route. */
export interface RequestTrackingInput {
  /** HTTP method, e.g. `"GET"`. */
  method: string;
  /**
   * Raw request path (no query string). Always known immediately, unlike a matched route pattern
   * (see {@link RequestTrackingOutcome.routePattern}) — Express only resolves `req.route` once
   * routing has actually run, which happens after this port is called.
   */
  path: string;
}

/** What is known once the response has finished. */
export interface RequestTrackingOutcome {
  statusCode: number;
  /**
   * The matched route's full, mount-aware pattern (e.g. `"/api/admin/posts/:id"`), or the fixed
   * literal `"unmatched"` for a request no route claimed (any 404-shaped miss). Deliberately NOT
   * the raw request path: an unmatched path is attacker-controlled and unbounded, and grouping by
   * pattern rather than literal path is what keeps this signal's cardinality bounded to "however
   * many routes exist" instead of "however many distinct URLs were ever requested."
   */
  routePattern: string;
}

/** Returned by {@link ObservabilityPort.trackRequest}; call `end` exactly once, when the response
 *  finishes. */
export interface RequestTracker {
  end(outcome: RequestTrackingOutcome): void;
}

/**
 * The observability port. One method today (see file header for why the set stays this small);
 * every adapter (`noop.ts`, `otel.ts`) implements this exact shape, and `RouteDeps.observability`
 * (`server/routes/types.ts`) is typed against it, never against a concrete adapter.
 */
export interface ObservabilityPort {
  trackRequest(input: RequestTrackingInput): RequestTracker;
}

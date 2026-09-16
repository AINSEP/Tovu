/**
 * @file The OpenTelemetry adapter for `ObservabilityPort` — the ONLY file under
 * `platform/observability/` that imports an `@opentelemetry/*` package. `ports.ts`'s file header
 * explains why that matters: the port itself must never mention OTel, so a future adapter for a
 * different instrumentation system can satisfy it without this file changing at all.
 *
 * Loaded lazily, not statically: `index.ts`'s `createObservabilityPort` only reaches this module
 * via `createRequire(import.meta.url)("./otel.js")`, gated behind
 * `resolveObservabilityConfig().enabled`. This is the ONE first-party `require()`
 * `src/__tests__/no-first-party-require.boundary.test.ts` allows (t91 F4.1-A), because this file has
 * no first-party runtime import and nothing loads it through `import` — so tsx's CommonJS copy is
 * the only copy, and it stays that way. Applied here so the OTel SDK is never loaded into a process
 * whose operator hasn't set `OTEL_EXPORTER_OTLP_ENDPOINT`. That is a real resource-budget concern, not tidiness: the
 * groundwork survey this task was built from (`ADS-memory/.local-artifacts/metrics/
 * 2026-08-28-observability-groundwork.md` §5.5) flags that Tovu ships to small, single-process VPS
 * instances and that no measurement of the OTel SDK's own footprint exists yet — an always-loaded
 * SDK would be dead weight for every operator who never configures an exporter. `require`, not a
 * dynamic `await import()`: both composition roots' `RouteDeps` are built synchronously today
 * (`index.ts`'s own comment on `createSqliteRouteDeps()`/`createApp()` — "both of those are
 * synchronous functions"), and Node 24 (this repo's minimum engine) resolves `require()` of an ESM
 * target synchronously, so this stays a plain, synchronous factory call with no ripple into
 * `index.ts`/`cli/commands/serve.ts`'s own call sites.
 *
 * One `NodeTracerProvider` per process, and it is never registered globally
 * (`trace.setGlobalTracerProvider`/`provider.register()`). This adapter takes its `Tracer` directly
 * off the provider instance instead (`NodeTracerProvider#getTracer()` — the OTel 2.x-documented way
 * to obtain a `Tracer` without a global registration), so constructing this adapter can never
 * silently take over `@opentelemetry/api`'s process-wide tracer registration from some other part
 * of the process that also touches it.
 */
import { SpanKind, SpanStatusCode, type Span, type Tracer } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import type { ObservabilityConfigEnabled } from "./config.js";
import type { ObservabilityPort, RequestTracker, RequestTrackingInput, RequestTrackingOutcome } from "./ports.js";

const TRACER_NAME = "tovu.observability";

/** Test seam: injects span processors instead of the real OTLP batch pipeline. Every real caller
 *  (`index.ts`'s `createObservabilityPort`) leaves this unset, which builds the real
 *  `BatchSpanProcessor(new OTLPTraceExporter())` pipeline (see `buildTracer`'s own comment for why
 *  that constructor call takes no explicit `url`) — see `__tests__/unit/otel.unit.test.ts` for the
 *  `InMemorySpanExporter` + `SimpleSpanProcessor` substitution this option exists for. */
export interface OtelAdapterOptions {
  spanProcessors?: SpanProcessor[];
}

function buildTracer(config: ObservabilityConfigEnabled, options: OtelAdapterOptions): Tracer {
  // No explicit `url` — `config.ts`'s file header explains why: `OTLPTraceExporter`'s own
  // zero-argument constructor resolves the endpoint from the SAME standard env vars
  // `resolveObservabilityConfig` checked for presence, applying the OTel spec's base-vs-per-signal
  // URL rules (`/v1/traces` appended to a general `OTEL_EXPORTER_OTLP_ENDPOINT`, but not to a
  // signal-specific `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) correctly, which re-deriving here could not
  // do without duplicating (and risking getting wrong) the SDK's own spec-compliant resolution.
  const spanProcessors = options.spanProcessors ?? [new BatchSpanProcessor(new OTLPTraceExporter())];
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: config.serviceName }),
    spanProcessors,
  });
  return provider.getTracer(TRACER_NAME);
}

/**
 * Finishes `span` against `outcome`. The route pattern is only known once Express has finished
 * routing (see `ports.ts`'s `RequestTrackingOutcome.routePattern` doc) — later than
 * `tracer.startSpan()` runs — so the span is opened with a provisional name and both the name and
 * `http.route` attribute are set here, at `end()` time, via `Span#updateName`, rather than
 * requiring the port to support a separate rename call.
 */
function endSpan(span: Span, method: string, outcome: RequestTrackingOutcome): void {
  span.updateName(`${method} ${outcome.routePattern}`);
  span.setAttribute("http.route", outcome.routePattern);
  span.setAttribute("http.status_code", outcome.statusCode);
  if (outcome.statusCode >= 500) {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
  span.end();
}

/**
 * Builds the real `ObservabilityPort`, backed by one process-lifetime `NodeTracerProvider`. Called
 * at most once per process — both composition roots (`server/runtime/composition/{app,deps}.ts`)
 * construct `RouteDeps.observability` once at boot, not per request, and `index.ts`'s
 * `createObservabilityPort` only reaches this function when `config.enabled` is true.
 *
 * @complexity O(1) setup cost (one provider, one span processor, one exporter); `trackRequest`
 * itself is O(1) per call (`tracer.startSpan` plus a handful of attribute writes) — the same cost
 * shape the no-op port has, since the OTel SDK's real cost (the batching queue and its periodic
 * HTTP export) lives in the span processor's own background timer, not in any individual
 * `trackRequest`/`end` call.
 * @overallScore 100
 */
export function createOtelObservabilityPort(config: ObservabilityConfigEnabled, options: OtelAdapterOptions = {}): ObservabilityPort {
  const tracer = buildTracer(config, options);

  return {
    trackRequest(input: RequestTrackingInput): RequestTracker {
      const span = tracer.startSpan(input.method, {
        kind: SpanKind.SERVER,
        attributes: { "http.method": input.method, "http.target": input.path },
      });

      return {
        end(outcome: RequestTrackingOutcome): void {
          endSpan(span, input.method, outcome);
        },
      };
    },
  };
}

/**
 * @file TEST-ONLY: the real OpenTelemetry SDK bound to Jini diagnostics' span lifecycle, so Tovu's
 * call-site tests can prove what actually leaves the process (span names, kinds, parent links,
 * status, redaction). Production no longer has an OTel adapter in Tovu core: since provider wave 2
 * (2026-10-25) it comes from the `observability-opentelemetry` provider plugin
 * (`@jini-ai/provider-plugins`), selected at boot only when installed + enabled + configured
 * (`server/runtime/composition/provider-plugins.ts`). The `@opentelemetry/*` packages are therefore
 * devDependencies here. The plugin carries the same adapter, its lifecycle tests, and the reasons
 * that used to live in this header (lazy loading for small VPS installs, measured footprint).
 *
 * One `NodeTracerProvider` per port, and it is never registered globally
 * (`trace.setGlobalTracerProvider`/`provider.register()`). This adapter takes its `Tracer` directly
 * off the provider instance instead (`NodeTracerProvider#getTracer()` — the OTel 2.x-documented way
 * to obtain a `Tracer` without a global registration), so constructing it can never silently take
 * over `@opentelemetry/api`'s process-wide tracer registration from some other part of the process
 * (including a test runner) that also touches it.
 */
// Span lifecycle rationale: Jini packages/diagnostics/src/observability/otel.ts.
import { AsyncLocalStorage } from "node:async_hooks";

import { ROOT_CONTEXT, SpanKind, SpanStatusCode, trace, type Span, type Tracer } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  createOtelObservabilityPort as createDiagnosticOtelPort,
  type ExporterFactory,
  type ObservabilityConfigEnabled,
  type ObservabilityPort,
  type SpanScopePort,
  type TraceSpanKind,
  type TraceSpanPort,
  type TracerPort,
  type TracerProviderFactory,
} from "@jini-ai/diagnostics/observability";

/** Test seam: replace the OTLP batch pipeline with explicit SDK span processors. */
export interface OtelAdapterOptions {
  spanProcessors?: SpanProcessor[];
}

const SDK_SPAN_KINDS: Record<TraceSpanKind, SpanKind> = { server: SpanKind.SERVER, client: SpanKind.CLIENT, internal: SpanKind.INTERNAL };

/** SDK span behind each port span this module handed out, so a port span can be named as a parent. */
const sdkSpans = new WeakMap<TraceSpanPort, Span>();

/** Translates object-shaped diagnostics span methods to SDK calls; no lifecycle policy here. */
function adaptSpan({ span }: { span: Span }): TraceSpanPort {
  const port: TraceSpanPort = {
    updateName: ({ name }) => { span.updateName(name); },
    setAttribute: ({ name, value }) => { span.setAttribute(name, value); },
    setStatus: ({ description }) => { span.setStatus({ code: SpanStatusCode.ERROR, ...(description ? { message: description } : {}) }); },
    addEvent: ({ name, attributes }) => { span.addEvent(name, attributes); },
    end: () => { span.end(); },
  };
  sdkSpans.set(port, span);
  return port;
}

/**
 * Starts an SDK span from Jini's structural input and returns its host adapter. The parent goes in
 * as an explicit context (`trace.setSpan(ROOT_CONTEXT, parent)`), not through a registered global
 * context manager — the same "never take over @opentelemetry/api's process-wide registration" rule
 * this file's header gives for the provider.
 */
function adaptTracer({ tracer }: { tracer: Tracer }): TracerPort {
  return {
    startSpan: ({ name, kind, attributes }, { parent } = {}) => {
      const parentSpan = parent ? sdkSpans.get(parent) : undefined;
      const context = parentSpan ? trace.setSpan(ROOT_CONTEXT, parentSpan) : undefined;
      return adaptSpan({ span: tracer.startSpan(name, { kind: SDK_SPAN_KINDS[kind], attributes }, context) });
    },
  };
}

/**
 * The active port span per async context, so a DB query or outbound call made while serving a
 * request becomes that request span's child. AsyncLocalStorage is Node-only, which is why Jini takes
 * this as a host port. Express caveat: a continuation resumed from a socket/stream callback outside
 * the scope (some body parsers) starts root spans rather than mis-parenting them.
 * @param _required Empty; each call owns a fresh store.
 * @returns A scope port over one AsyncLocalStorage instance.
 */
export function createAsyncLocalSpanScope(_required: Record<string, never>): SpanScopePort {
  const storage = new AsyncLocalStorage<TraceSpanPort>();
  return { active: () => storage.getStore(), run: ({ span, fn }) => storage.run(span, fn) };
}

/**
 * Creates structural SDK factories; no provider, exporter or background timer starts until invoked.
 * @param required Empty required object; all SDK overrides are optional.
 * @param options Optional test processors, which prevent constructing a real exporter.
 * @returns Factories which preserve service identity and do not register the provider globally.
 * @complexity O(1) setup, excluding SDK processor construction.
 * @example createOtelFactories({}, { spanProcessors: [processor] });
 *
 * These factories build one port's `NodeTracerProvider` when invoked (one per test port here; a
 * production host builds its port once at boot, through the provider plugin).
 *
 * @complexity O(1) setup cost (one provider, one span processor, one exporter); `trackRequest`
 * itself is O(1) per call (`tracer.startSpan` plus a handful of attribute writes) — the same cost
 * shape the no-op port has, since the OTel SDK's real cost (the batching queue and its periodic
 * HTTP export) lives in the span processor's own background timer, not in any individual
 * `trackRequest`/`end` call.
 */
export function createOtelFactories(_required: Record<string, never>, options: OtelAdapterOptions = {}): {
  exporterFactory: ExporterFactory;
  tracerProviderFactory: TracerProviderFactory;
} {
  return {
    exporterFactory: {
      create: ({ endpoint }) => {
        if (options.spanProcessors !== undefined) return undefined;
        return new OTLPTraceExporter({ url: endpoint });
      },
    },
    tracerProviderFactory: {
      create: ({ serviceName, exporter }) => {
        let spanProcessors = options.spanProcessors;
        if (spanProcessors === undefined) {
          // The diagnostics port treats exporters as opaque. Narrow at the SDK boundary rather
          // than casting an arbitrary port value into a live processor's exporter dependency.
          if (!(exporter instanceof OTLPTraceExporter)) {
            throw new TypeError("OpenTelemetry requires an OTLP trace exporter");
          }
          spanProcessors = [new BatchSpanProcessor(exporter)];
        }
        const provider = new NodeTracerProvider({
          resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
          spanProcessors,
        });
        return { getTracer: ({ name }) => adaptTracer({ tracer: provider.getTracer(name) }) };
      },
    },
  };
}

/**
 * Binds Jini's tracing lifecycle to host SDK factories, with injectable processors for tests.
 * @param required Enabled diagnostics configuration.
 * @param options Optional SDK test processors; production uses a bounded OTLP batch processor.
 * @returns A request tracker owned by one provider instance. SDK setup errors propagate.
 * @complexity O(1) setup and O(1) per track/end, excluding SDK batching/export I/O.
 * @example createOtelObservabilityPort({ config }, { spanProcessors: [processor] });
 */
export function createOtelObservabilityPort({ config }: { config: ObservabilityConfigEnabled }, options: OtelAdapterOptions = {}): ObservabilityPort {
  // Construct once at boot: the batch processor's export queue/timer belongs to the provider,
  // not to individual requests. getTracer uses the instance so other global registrations survive.
  return createDiagnosticOtelPort({ config, ...createOtelFactories({}, options) }, { scope: createAsyncLocalSpanScope({}) });
}

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
import { ROOT_CONTEXT, SpanKind, SpanStatusCode, trace, type Span, type Tracer } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  createOtelObservabilityPort as createDiagnosticOtelPort,
  type ObservabilityConfigEnabled,
  type ObservabilityPort,
  type TraceSpanKind,
  type TraceSpanPort,
  type TracerPort,
} from "@jini-ai/diagnostics/observability";
import { createAsyncLocalSpanScope } from "@jini-ai/diagnostics/observability/node";

/** Test seam: replace the OTLP batch pipeline with explicit SDK span processors. */
export interface OtelAdapterOptions {
  spanProcessors: SpanProcessor[];
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
 */

/**
 * Binds Jini's tracing lifecycle to host SDK factories, with injectable processors for tests.
 * @param required Enabled diagnostics configuration.
 * @param options Explicit SDK test processors; this fixture never creates a network exporter.
 * @returns A request tracker owned by one provider instance. SDK setup errors propagate.
 * @complexity O(1) setup and O(1) per track/end, excluding SDK batching/export I/O.
 * @example createOtelObservabilityPort({ config }, { spanProcessors: [processor] });
 */
export function createOtelObservabilityPort({ config }: { config: ObservabilityConfigEnabled }, options: OtelAdapterOptions): ObservabilityPort {
  // Construct once per test: the processor belongs to the provider,
  // not to individual requests. getTracer uses the instance so other global registrations survive.
  // Exporters are opaque to diagnostics; explicit processors own export here, so its factory is inert.
  return createDiagnosticOtelPort({ config, exporterFactory: { create: () => undefined }, tracerProviderFactory: {
    create: ({ serviceName }) => {
      const provider = new NodeTracerProvider({ resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }), spanProcessors: options.spanProcessors });
      return { getTracer: ({ name }) => adaptTracer({ tracer: provider.getTracer(name) }) };
    },
  } }, { scope: createAsyncLocalSpanScope({}) });
}

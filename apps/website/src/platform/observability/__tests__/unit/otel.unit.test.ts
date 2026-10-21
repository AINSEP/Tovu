import assert from "node:assert/strict";
import test from "node:test";

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

import { createAsyncLocalSpanScope, createOtelFactories, createOtelObservabilityPort } from "../../otel.js";
import type { ObservabilityConfigEnabled } from "@jini-ai/diagnostics/observability";

/**
 * @file Proves the OTel adapter builds real spans through the port's own vocabulary
 * (`trackRequest`/`end`), never asserting against OTel-specific call shapes from the outside — the
 * whole point of `ports.ts`'s design (see its file header). Uses `InMemorySpanExporter` +
 * `SimpleSpanProcessor` (both from `@opentelemetry/sdk-trace-base`, OTel's own standard testing
 * pair — synchronous export on `span.end()`, no batching delay) via `otel.ts`'s `spanProcessors`
 * test seam, so this suite never makes a real network call.
 */

const TEST_CONFIG: ObservabilityConfigEnabled = {
  enabled: true,
  serviceName: "tovu-test",
  tracerName: "tovu.observability",
  endpoint: "http://collector.test/v1/traces",
};

function createPortUnderTest(): { port: ReturnType<typeof createOtelObservabilityPort>; exporter: InMemorySpanExporter } {
  const exporter = new InMemorySpanExporter();
  const port = createOtelObservabilityPort({ config: TEST_CONFIG }, { spanProcessors: [new SimpleSpanProcessor(exporter)] });
  return { port, exporter };
}

test("end() exports exactly one span per trackRequest() call", () => {
  const { port, exporter } = createPortUnderTest();
  const tracker = port.trackRequest({ method: "GET", path: "/welcome" });
  assert.equal(exporter.getFinishedSpans().length, 0, "the span must not be exported before end() is called");

  tracker.end({ statusCode: 200, routePattern: "/welcome" });

  assert.equal(exporter.getFinishedSpans().length, 1);
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.resource.attributes["service.name"], "tovu-test");
  assert.equal(span.instrumentationScope.name, "tovu.observability");
});

test("the exported span's name combines the method and the FINAL route pattern from end(), not the raw path known at trackRequest() time", () => {
  const { port, exporter } = createPortUnderTest();
  const tracker = port.trackRequest({ method: "GET", path: "/posts/507f191e810c19729de860ea" });
  tracker.end({ statusCode: 200, routePattern: "/api/admin/posts/:id" });

  const [span] = exporter.getFinishedSpans();
  assert.equal(span.name, "GET /api/admin/posts/:id");
});

test("attributes carry method, target, matched route, and status code; kind is SERVER", () => {
  const { port, exporter } = createPortUnderTest();
  const tracker = port.trackRequest({ method: "POST", path: "/api/admin/posts" });
  tracker.end({ statusCode: 201, routePattern: "/api/admin/posts" });

  const [span] = exporter.getFinishedSpans();
  assert.equal(span.kind, SpanKind.SERVER);
  assert.equal(span.attributes["http.method"], "POST");
  assert.equal(span.attributes["http.target"], "/api/admin/posts");
  assert.equal(span.attributes["http.route"], "/api/admin/posts");
  assert.equal(span.attributes["http.status_code"], 201);
});

test("a 5xx outcome sets the span status to ERROR", () => {
  const { port, exporter } = createPortUnderTest();
  const tracker = port.trackRequest({ method: "GET", path: "/boom" });
  tracker.end({ statusCode: 503, routePattern: "unmatched" });

  const [span] = exporter.getFinishedSpans();
  assert.equal(span.status.code, SpanStatusCode.ERROR);
});

test("a 2xx/4xx outcome leaves the span status UNSET — errors are reserved for 5xx, matching the port's contract (client errors are not server failures)", () => {
  const { port, exporter } = createPortUnderTest();
  const okTracker = port.trackRequest({ method: "GET", path: "/ok" });
  okTracker.end({ statusCode: 200, routePattern: "/ok" });
  const notFoundTracker = port.trackRequest({ method: "GET", path: "/missing" });
  notFoundTracker.end({ statusCode: 404, routePattern: "unmatched" });

  const [okSpan, notFoundSpan] = exporter.getFinishedSpans();
  assert.equal(okSpan.status.code, SpanStatusCode.UNSET);
  assert.equal(notFoundSpan.status.code, SpanStatusCode.UNSET);
});

test("multiple concurrent trackRequest() calls produce independently-attributed spans — one call's outcome never leaks into another's", () => {
  const { port, exporter } = createPortUnderTest();
  const first = port.trackRequest({ method: "GET", path: "/a" });
  const second = port.trackRequest({ method: "GET", path: "/b" });

  second.end({ statusCode: 500, routePattern: "/b" });
  first.end({ statusCode: 200, routePattern: "/a" });

  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 2);
  const spanA = spans.find((s) => s.name === "GET /a");
  const spanB = spans.find((s) => s.name === "GET /b");
  assert.equal(spanA?.status.code, SpanStatusCode.UNSET);
  assert.equal(spanB?.status.code, SpanStatusCode.ERROR);
});


test("SDK factories reject an exporter of the wrong kind before starting a provider", () => {
  const { tracerProviderFactory } = createOtelFactories({});
  for (const exporter of [undefined, {}]) {
    assert.throws(() => tracerProviderFactory.create({ serviceName: "test", exporter }), {
      name: "TypeError", message: "OpenTelemetry requires an OTLP trace exporter",
    });
  }
});

test("without test processors the SDK factories build a real OTLP exporter and accept it into the batch pipeline", async () => {
  const { exporterFactory, tracerProviderFactory } = createOtelFactories({});
  const exporter = exporterFactory.create({ endpoint: "http://127.0.0.1:9/v1/traces" });
  assert.ok(exporter instanceof OTLPTraceExporter);
  const tracer = tracerProviderFactory.create({ serviceName: "tovu-default", exporter }).getTracer({ name: "tovu.test" });
  const span = tracer.startSpan({ name: "unended", kind: "internal", attributes: {} });
  assert.equal(typeof span.end, "function", "a provider built on the OTLP batch processor hands out live spans");
  await exporter.shutdown();
});

test("explicit test processors suppress the network exporter entirely", () => {
  const { exporterFactory } = createOtelFactories({}, { spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())] });
  assert.equal(exporterFactory.create({ endpoint: "http://collector.test/v1/traces" }), undefined);
});

test("structural span methods preserve names, attributes, events and both error description shapes", () => {
  const exporter = new InMemorySpanExporter();
  const factories = createOtelFactories({}, { spanProcessors: [new SimpleSpanProcessor(exporter)] });
  assert.equal(factories.exporterFactory.create({ endpoint: TEST_CONFIG.endpoint }), undefined);
  const provider = factories.tracerProviderFactory.create({ serviceName: "adapter-service", exporter: undefined });
  const tracer = provider.getTracer({ name: "adapter-scope" });
  const parent = tracer.startSpan({ name: "original", kind: "server", attributes: { initial: "yes" } });
  parent.updateName({ name: "renamed" });
  parent.setAttribute({ name: "answer", value: 42 });
  parent.addEvent({ name: "with-details", attributes: { reason: "timeout" } });
  parent.addEvent({ name: "without-details", attributes: {} });
  parent.setStatus({ code: "error", description: "provider unavailable" });
  const child = tracer.startSpan({ name: "child", kind: "client", attributes: {} }, { parent });
  child.setStatus({ code: "error" });
  child.end({});
  parent.end({});
  const [childSpan, parentSpan] = exporter.getFinishedSpans();
  assert.equal(childSpan.parentSpanContext?.spanId, parentSpan.spanContext().spanId);
  assert.deepEqual(childSpan.status, { code: SpanStatusCode.ERROR });
  assert.equal(parentSpan.name, "renamed");
  assert.deepEqual(parentSpan.attributes, { initial: "yes", answer: 42 });
  assert.deepEqual(parentSpan.status, { code: SpanStatusCode.ERROR, message: "provider unavailable" });
  assert.deepEqual(parentSpan.events.map(({ name, attributes }) => ({ name, attributes })), [
    { name: "with-details", attributes: { reason: "timeout" } },
    { name: "without-details", attributes: {} },
  ]);
});

test("an unrecognized structural parent starts an SDK root span", () => {
  const exporter = new InMemorySpanExporter();
  const { tracerProviderFactory } = createOtelFactories({}, { spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const tracer = tracerProviderFactory.create({ serviceName: "test", exporter: undefined }).getTracer({ name: "test" });
  const foreign = {
    updateName() {}, setAttribute() {}, setStatus() {}, addEvent() {}, end() {},
  };
  tracer.startSpan({ name: "root", kind: "internal", attributes: {} }, { parent: foreign }).end({});
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.name, "root");
  assert.equal(span.kind, SpanKind.INTERNAL);
  assert.equal(span.parentSpanContext, undefined);
});

test("async scope releases the active span after rejected work", async () => {
  const scope = createAsyncLocalSpanScope({});
  const span = { updateName() {}, setAttribute() {}, setStatus() {}, addEvent() {}, end() {} };
  assert.equal(scope.active(), undefined);
  await assert.rejects(scope.run({ span, fn: async () => {
    await Promise.resolve();
    assert.equal(scope.active(), span);
    throw new Error("work failed");
  } }), { message: "work failed" });
  assert.equal(scope.active(), undefined);
});

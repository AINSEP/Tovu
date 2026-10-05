import assert from "node:assert/strict";

import { InMemorySpanExporter, SimpleSpanProcessor, type ReadableSpan } from "@opentelemetry/sdk-trace-base";

import { createOtelObservabilityPort } from "../../otel.js";
import type { ObservabilityConfigEnabled } from "@jini-ai/diagnostics/observability";

/**
 * @file The real OpenTelemetry SDK with an in-memory exporter (no network), for call-site tests that
 * must prove what actually leaves the process: span name, kind, status and redaction. One port per
 * test, so spans never leak across tests.
 */

const CONFIG: ObservabilityConfigEnabled = { enabled: true, serviceName: "tovu-test", tracerName: "tovu.observability", endpoint: "http://collector.test/v1/traces" };

/** A fresh enabled port whose spans land in `exporter`. */
export function createInMemoryOtel() {
  const exporter = new InMemorySpanExporter();
  const port = createOtelObservabilityPort({ config: CONFIG }, { spanProcessors: [new SimpleSpanProcessor(exporter)] });
  return { exporter, port };
}

/** Fails when any of `secrets` appears anywhere in the span's exported name, attributes, status or events. */
export function assertSpanOmits(span: ReadableSpan, secrets: readonly string[]): void {
  const exported = JSON.stringify({ name: span.name, attributes: span.attributes, status: span.status, events: span.events });
  for (const secret of secrets) assert.ok(!exported.includes(secret), `span exported ${JSON.stringify(secret)}: ${exported}`);
}

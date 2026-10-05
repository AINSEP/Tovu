import assert from "node:assert/strict";
import test from "node:test";

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { sql } from "kysely";

import { createOtelObservabilityPort } from "../../otel.js";
import { createObservabilityPort, instrumentStorageKernel, isNoopObservabilityPort } from "../../index.js";
import { openMemorySqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import type { ObservabilityConfigEnabled } from "@jini-ai/diagnostics/observability";

/**
 * @file The DB, outbound and agent-run signals through the REAL OpenTelemetry SDK (in-memory
 * exporter via `otel.ts`'s `spanProcessors` seam — no network) and, for the DB, the real SQLite
 * kernel and Kysely builder, so the query-node shapes the Jini decorator reads are Kysely's own.
 * Jini's suite pins the span vocabulary with fakes; this one proves the host glue: span kinds,
 * SDK parent links through the AsyncLocalStorage scope, and the exception event.
 */

const CONFIG: ObservabilityConfigEnabled = { enabled: true, serviceName: "tovu-test", tracerName: "tovu.observability", endpoint: "http://collector.test/v1/traces" };

function setup() {
  const exporter = new InMemorySpanExporter();
  const port = createOtelObservabilityPort({ config: CONFIG }, { spanProcessors: [new SimpleSpanProcessor(exporter)] });
  return { exporter, port };
}

test("a DB span started inside a request's run() is that request span's child in the SDK, with kind CLIENT", async () => {
  const { exporter, port } = setup();
  const request = port.trackRequest({ method: "GET", path: "/posts" });
  await request.run!(async () => {
    await Promise.resolve();
    port.trackDbQuery({ system: "sqlite" }).end({ operation: "select", table: "posts" });
  });
  request.end({ statusCode: 200, routePattern: "/posts" });
  const [db, req] = exporter.getFinishedSpans();
  assert.equal(db.name, "SELECT posts");
  assert.equal(db.kind, SpanKind.CLIENT);
  assert.equal(req.kind, SpanKind.SERVER);
  assert.equal(db.parentSpanContext?.spanId, req.spanContext().spanId);
  assert.equal(db.spanContext().traceId, req.spanContext().traceId);
});

test("an outbound failure exports ERROR status, error.type and an exception event, without the URL path or query", () => {
  const { exporter, port } = setup();
  port.trackOutboundCall({ method: "POST", url: "https://api.example.com/hooks/abc?token=s3cret" }).end({ error: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.kind, SpanKind.CLIENT);
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(span.attributes["error.type"], "ECONNREFUSED");
  assert.deepEqual(span.events.map((event) => [event.name, event.attributes?.["exception.type"]]), [["exception", "ECONNREFUSED"]]);
  assert.doesNotMatch(JSON.stringify(span.attributes), /hooks|s3cret/);
});

test("an agent run is an INTERNAL root span even when started inside a request", () => {
  const { exporter, port } = setup();
  const request = port.trackRequest({ method: "PUT", path: "/chats/1" });
  request.run!(() => port.trackAgentRun({ runId: "run-1" }, { conversationId: "c-1" }).end({ status: "failed" }));
  request.end({ statusCode: 200, routePattern: "/chats/:id" });
  const run = exporter.getFinishedSpans().find((span) => span.name === "invoke_agent");
  assert.ok(run);
  assert.equal(run.kind, SpanKind.INTERNAL);
  assert.equal(run.parentSpanContext, undefined);
  assert.equal(run.status.code, SpanStatusCode.ERROR);
  assert.equal(run.attributes["agent.run.id"], "run-1");
});

test("the real SQLite kernel, once instrumented, names spans from Kysely's own query nodes — never SQL text or values", async () => {
  const { exporter, port } = setup();
  const kernel = openMemorySqliteKernel<{ notes: { id: number; body: string } }>();
  try {
    instrumentStorageKernel({ kernel, observability: port });
    await kernel.execute(sql`CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)`);
    await kernel.run((db) => db.insertInto("notes").values({ id: 1, body: "private body text" }).execute());
    const rows = await kernel.run((db) => db.selectFrom("notes").selectAll().where("body", "=", "private body text").execute());
    await kernel.transaction(() => kernel.run((db) => db.updateTable("notes").set({ body: "x" }).execute()));
    assert.equal(rows.length, 1);
    const spans = exporter.getFinishedSpans();
    assert.deepEqual(spans.map((span) => span.name), ["CREATE", "INSERT notes", "SELECT notes", "UPDATE notes", "TRANSACTION"]);
    assert.equal(spans[3].parentSpanContext?.spanId, spans[4].spanContext().spanId);
    assert.equal(spans[1].attributes["db.system.name"], "sqlite");
    assert.doesNotMatch(JSON.stringify(spans.map((span) => span.attributes)), /private body text|INTEGER/);
  } finally {
    await kernel.close();
  }
});

test("disabled config returns Jini's no-op port, which the decorators recognize and skip", async () => {
  const port = createObservabilityPort({ config: { enabled: false } });
  assert.equal(isNoopObservabilityPort(port), true);
  const kernel = openMemorySqliteKernel<Record<string, never>>();
  try {
    const run = kernel.run;
    instrumentStorageKernel({ kernel, observability: port });
    assert.equal(kernel.run, run, "a disabled install keeps the kernel's own run, with no wrapper frame");
  } finally {
    await kernel.close();
  }
});

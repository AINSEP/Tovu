import assert from "node:assert/strict";
import test from "node:test";

import { SpanStatusCode } from "@opentelemetry/api";
import { createTransport } from "@sentry/node";
import { createSentryObservabilityPort } from "#src/platform/observability/sentry";
import { createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";
import { combineObservabilityPorts } from "@jini-ai/diagnostics/observability";
import { EXPECTED_OPERATIONS, SCENARIO_SECRET, createRecordingObservabilityPort, runToolCallScenario, type NormalizedOperation } from "./fixtures/tool-call-observability-scenario.js";

/**
 * @file The swap proof: one feature scenario (the real delegated-tool route over the real Tovu
 * executor stack) run against three adapters behind the same port — a fake, the real OpenTelemetry
 * SDK with an in-memory exporter, and the real Sentry SDK with a recording transport (a dummy DSN on
 * an `.invalid` host; nothing leaves the process). Each adapter's output is normalized back to the
 * port's vocabulary and must equal the same expected observations. The feature code never changes.
 */

const DUMMY_DSN = "https://public@sentry.example.invalid/1";

function otelOperations(spans: ReturnType<ReturnType<typeof createInMemoryOtel>["exporter"]["getFinishedSpans"]>): NormalizedOperation[] {
  return spans.filter((span) => span.name === "tool.call").map((span) => ({
    name: span.name, toolId: String(span.attributes["tool.id"]), outcome: String(span.attributes["operation.outcome"]),
    failed: span.status.code === SpanStatusCode.ERROR,
    ...(span.attributes["tool.error_kind"] ? { errorKind: String(span.attributes["tool.error_kind"]) } : {}),
    reported: span.events.filter((event) => event.name === "exception").map((event) => String(event.attributes?.["exception.type"])),
  }));
}

type Envelope = { header: Record<string, unknown>; items: { type: string; payload: Record<string, any> }[]; raw: string };

/** A Sentry transport that keeps every envelope in memory, parsed. */
function createRecordingTransport() {
  const envelopes: Envelope[] = [];
  const transport = (options: Parameters<typeof createTransport>[0]) => createTransport(options, async (request) => {
    const raw = typeof request.body === "string" ? request.body : Buffer.from(request.body).toString("utf8");
    const [header, ...rest] = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const items: Envelope["items"] = [];
    for (let i = 0; i + 1 < rest.length; i += 2) items.push({ type: rest[i].type, payload: rest[i + 1] });
    envelopes.push({ header, items, raw });
    return { statusCode: 200 };
  });
  return { envelopes, transport };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let waited = 0; !predicate() && waited < 3000; waited += 20) await new Promise((resolve) => setTimeout(resolve, 20));
}

function sentryOperations(envelopes: Envelope[]): NormalizedOperation[] {
  const items = envelopes.flatMap((envelope) => envelope.items);
  const errors = items.filter((item) => item.type === "event");
  return items.filter((item) => item.type === "transaction").map(({ payload }) => {
    const trace = payload.contexts.trace; const data = trace.data ?? {};
    return {
      name: payload.transaction, toolId: String(data["tool.id"]), outcome: String(data["operation.outcome"]), failed: trace.status !== "ok",
      ...(data["tool.error_kind"] ? { errorKind: String(data["tool.error_kind"]) } : {}),
      reported: errors.filter((event) => event.payload.contexts?.trace?.span_id === trace.span_id).map((event) => event.payload.exception.values[0].type),
    };
  });
}

test("fake port: the scenario's observations", async () => {
  const fake = createRecordingObservabilityPort();
  await runToolCallScenario({ observability: fake.port });
  assert.deepEqual(fake.normalized(), EXPECTED_OPERATIONS);
});

test("OpenTelemetry adapter (real SDK, in-memory exporter): same observations, no secret in any span", async () => {
  const { exporter, port } = createInMemoryOtel();
  await runToolCallScenario({ observability: port });
  const spans = exporter.getFinishedSpans();
  assert.deepEqual(otelOperations(spans), EXPECTED_OPERATIONS);
  assert.ok(!JSON.stringify(spans.map((s) => ({ a: s.attributes, e: s.events, st: s.status }))).includes(SCENARIO_SECRET));
});

test("Sentry adapter (real SDK, recording transport): same observations, events linked to their operation, no secret in any envelope", async () => {
  const { envelopes, transport } = createRecordingTransport();
  const port = createSentryObservabilityPort({ config: { enabled: true, dsn: DUMMY_DSN, tracesSampleRate: 1 } }, { transport });
  await runToolCallScenario({ observability: port });
  await waitFor(() => sentryOperations(envelopes).length === EXPECTED_OPERATIONS.length);
  assert.deepEqual(sentryOperations(envelopes), EXPECTED_OPERATIONS);
  for (const envelope of envelopes) assert.ok(!envelope.raw.includes(SCENARIO_SECRET), "secret reached a Sentry envelope");
  const [event] = envelopes.flatMap((e) => e.items).filter((item) => item.type === "event");
  assert.match(event?.payload.exception.values[0].value, /ERR-AAAA-1111-BBBB-2222/);
  assert.equal(event?.payload.tags.operation, "tool.call");
  assert.equal(event?.payload.user, undefined, "no user/IP collected");
});

test("both configured (fan-out): OpenTelemetry and Sentry each see the full scenario", async () => {
  const otel = createInMemoryOtel();
  const sentry = createRecordingTransport();
  const port = combineObservabilityPorts({ ports: [otel.port, createSentryObservabilityPort({ config: { enabled: true, dsn: DUMMY_DSN, tracesSampleRate: 1 } }, { transport: sentry.transport })] });
  await runToolCallScenario({ observability: port });
  await waitFor(() => sentryOperations(sentry.envelopes).length === EXPECTED_OPERATIONS.length);
  assert.deepEqual(otelOperations(otel.exporter.getFinishedSpans()), EXPECTED_OPERATIONS);
  assert.deepEqual(sentryOperations(sentry.envelopes), EXPECTED_OPERATIONS);
});

test("Sentry adapter redacts by itself: a raw secret-bearing error reported straight to the port never reaches an envelope", async () => {
  const { envelopes, transport } = createRecordingTransport();
  const port = createSentryObservabilityPort({ config: { enabled: true, dsn: DUMMY_DSN, tracesSampleRate: 0 } }, { transport });
  port.reportError({ error: new Error(`upstream rejected token ${SCENARIO_SECRET}`), context: { operation: "backup.run" } });
  await waitFor(() => envelopes.length === 1);
  assert.equal(envelopes.length, 1);
  assert.ok(!envelopes[0]!.raw.includes(SCENARIO_SECRET));
  assert.match(envelopes[0]!.items[0]!.payload.exception.values[0].value, /^upstream rejected token /);
});

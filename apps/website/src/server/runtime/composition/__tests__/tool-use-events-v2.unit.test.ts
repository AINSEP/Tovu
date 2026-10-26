import assert from "node:assert/strict";
import test from "node:test";
import { createTracker } from "@jini-ai/diagnostics/observability/node";
import type { ProductEvent } from "@jini-ai/analytics/product";
import { withToolUseEvents } from "../tool-use-events.js";

const attempt = { attemptId: "attempt-1", executionId: "exec-1", workspaceId: "ws", runId: "run-1", toolId: "posts_create", principalId: "owner-1", phase: "completed" as const, at: "2026-10-26T00:00:00Z" };

/** Audit insertion, rather than an attempted append, authorizes the product summary. */
test("tool product events follow committed audit insertion and preserve stable retry identity", async () => {
  const order: string[] = [];
  const events: ProductEvent[] = [];
  const tracker = createTracker({ productAnalytics: { capture: event => { order.push("capture"); events.push(event); }, identify: () => {} } });
  const sink = withToolUseEvents({ tracker, sink: { append: async () => {}, appendCommitted: async () => { order.push("insert"); return true; } } });
  await sink.append(attempt);
  await sink.append(attempt);
  assert.deepEqual(order, ["insert", "capture", "insert", "capture"]);
  assert.equal(events[0]!.properties!.eventId, events[1]!.properties!.eventId);
  assert.deepEqual(events[0]!.properties, { toolId: "posts_create", outcome: "completed", chatSurface: "admin", attemptId: "attempt-1", eventId: "assistant-tool:attempt-1" });
});

test("failed inserts, requested rows and public attempts cannot use operator consent", async () => {
  const events: ProductEvent[] = [];
  const tracker = createTracker({ productAnalytics: { capture: event => { events.push(event); }, identify: () => {} } });
  const failed = withToolUseEvents({ tracker, sink: { append: async () => {}, appendCommitted: async () => false } });
  assert.equal(await failed.appendCommitted(attempt), false);
  const committed = withToolUseEvents({ tracker, sink: { append: async () => {}, appendCommitted: async () => true } });
  await committed.append({ ...attempt, phase: "requested" });
  await committed.append({ ...attempt, principalId: "anonymous-visitor" });
  const unknown = { ...attempt, phase: "unknown-tool" as const, toolId: "invented name" };
  await committed.append(unknown);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.properties!.toolId, "unknown");
});

test("throwing audit sinks retain their error and never emit a product event", async () => {
  const events: ProductEvent[] = [];
  const failure = new Error("audit unavailable");
  const tracker = createTracker({ productAnalytics: { capture: event => { events.push(event); }, identify: () => {} } });
  const sink = withToolUseEvents({ tracker, sink: { append: async () => { throw failure; } } });
  await assert.rejects(sink.append(attempt), error => error === failure);
  assert.deepEqual(events, []);
});

import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
import { createRecordingAiTraceSink } from "@jini-ai/agent-runtime/ai-trace";

import { traceRunLifecycle } from "../run-lifecycle-tracing.js";

/** @file Assistant runs → AI trace, over the REAL daemon run lifecycle and a recording sink (no vendor). */

const lifecycle = () => createRunLifecycle({ eventLog: createInMemoryEventLog({}) }, { dropEventsOnEviction: true });
const success = { status: "succeeded" as const, code: 0, signal: null, resumable: false };

test("no AI-trace provider configured: the lifecycle is returned untouched", () => {
  const base = lifecycle();
  const { lifecycle: served, dispose } = traceRunLifecycle({ lifecycle: base, sink: undefined });
  assert.equal(served, base);
  dispose();
});

test("a configured sink records each run from start to its terminal outcome", async () => {
  const sink = createRecordingAiTraceSink();
  const { lifecycle: served, dispose } = traceRunLifecycle({ lifecycle: lifecycle(), sink });
  const { run } = await served.start({ contextRef: "chat-1" }, { agentId: "claude" });
  await served.emit({ runId: run.id, input: { event: "agent", data: { type: "usage", usage: { input_tokens: 3, output_tokens: 1 } } } });
  await served.finish({ runId: run.id, ...success });
  for (let i = 0; i < 20 && sink.events.at(-1)?.kind !== "run_finished"; i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sink.events.map((event) => event.kind), ["run_started", "model_turn", "run_finished"]);
  dispose();
});

test("a throwing sink is reported by error class only and never changes the run's result", async () => {
  const warnings: string[] = [];
  const sink = { record: () => { throw new TypeError("secret sk-live-123 in message"); } };
  const { lifecycle: served, dispose } = traceRunLifecycle({ lifecycle: lifecycle(), sink }, { warn: (message) => warnings.push(message) });
  const result = await served.start({ contextRef: "chat-2" });
  assert.equal(result.started, true);
  await assert.doesNotReject(served.finish({ runId: result.run.id, ...success }));
  for (let i = 0; i < 20 && warnings.length === 0; i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(warnings.length > 0);
  assert.ok(warnings.every((warning) => warning === "[agent-daemon] AI trace sink failed: TypeError"), warnings.join("\n"));
  dispose();
});

test("dispose releases open traces: a run ending afterwards records nothing more", async () => {
  const sink = createRecordingAiTraceSink();
  const { lifecycle: served, dispose } = traceRunLifecycle({ lifecycle: lifecycle(), sink });
  const { run } = await served.start({ contextRef: "chat-3" });
  for (let i = 0; i < 20 && sink.events.length === 0; i += 1) await new Promise((resolve) => setImmediate(resolve));
  dispose();
  await served.finish({ runId: run.id, ...success });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sink.events.map((event) => event.kind), ["run_started"]);
});

test("without a warn sink, a non-Error sink failure is reported to the console by its type", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const sink = { record: () => { throw "plain string"; } };
  const { lifecycle: served, dispose } = traceRunLifecycle({ lifecycle: lifecycle(), sink });
  const { run } = await served.start({ contextRef: "chat-4" });
  for (let i = 0; i < 20 && warn.mock.callCount() === 0; i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(warn.mock.calls[0]?.arguments[0], "[agent-daemon] AI trace sink failed: string");
  await served.finish({ runId: run.id, ...success });
  dispose();
});

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import type { ChatRunLedger } from "#src/assistant/index";
import { createAssistantRunFinalizer } from "../runtime/composition/modules/run-finalizer/entry.js";
import { type RunDaemonClient } from "../runtime/composition/modules/run-daemon-http-client.js";
import { recoveryLedgerFixture } from "./durable-ledger.fixture.js";
import {
  captureGlobalTimers, droppedStream, end, ended, liveStream, manualScheduler, missing, recordingLedger, runningMessage, text, until,
} from "./run-finalizer-characterization.fixture.js";

/**
 * @file Phase 0, C11-R: a port call that REJECTS while the process stays alive (run-finalizer
 * design 2026-11-16, section 5.3). Each rejection is caught on purpose by code that keeps
 * running, so timers and callbacks stay live. Process death is a different case and has its own
 * suite (`assistant-run-finalizer.halt-matrix.integration.test.ts`). The settle rejection (F2)
 * is C10 in the characterization suite. The two rows that carry the weight (launch, cancel)
 * are run with three ways of failing.
 */

const failures = [
  ["an Error", async (): Promise<never> => { throw new Error("port failed"); }],
  ["a non-Error value", async (): Promise<never> => { throw "port failed"; }],
  ["a rejected promise", (): Promise<never> => Promise.reject(new Error("port failed"))],
] as const;
const OLD = "run-x";
const watchInput = { principalId: "owner", conversationId: "chat", message: runningMessage("run-1") };

/** A dead attempt past its launch grace, over the generation-fenced ledger fake. */
function deadAttempt(t: TestContext, ports: { launch?: () => Promise<void>; cancel?: () => Promise<void>; checkpoint?: () => Promise<never> }) {
  t.mock.method(console, "info", () => undefined);
  const message = runningMessage(OLD, { content: "Saved", events: [{ kind: "text", text: "Saved" }] });
  const fixture = recoveryLedgerFixture({ message, now: () => 20_000 }, {});
  const seen = { opens: [] as string[], launches: 0, statuses: 0, diagnostics: [] as string[] };
  const ledger: ChatRunLedger = { ...fixture.ledger, checkpoint: async (input, optional) => {
    if (ports.checkpoint) return ports.checkpoint();
    seen.diagnostics.push(...input.events.flatMap((event) => event.kind === "status" && event.code ? [event.code] : []));
    return fixture.ledger.checkpoint(input, optional);
  } };
  const stream = liveStream();
  const daemon: RunDaemonClient = {
    runStatus: async ({ runId }) => { seen.statuses += 1; return runId === OLD ? 404 : 200; },
    openEvents: async ({ runId }) => { seen.opens.push(runId); return runId === OLD ? missing() : stream.response; },
    launch: async () => { seen.launches += 1; await ports.launch?.(); },
    cancel: async () => { await ports.cancel?.(); },
  };
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, now: () => 20_000, reconnectDelayMs: 0, scheduler: manualScheduler().scheduler, checkpointIntervalMs: 0 });
  const finish = async () => { stream.push(end(message.runId!)); await until(() => finalizer.activeCount() === 0, "the attempt's watch ends"); };
  return { message, seen, finalizer, finish };
}

for (const [style, fail] of failures) {
  test(`C11-R a launch rejected with ${style} saves one "unconfirmed" notice and still watches the attempt`, async (t) => {
    const h = deadAttempt(t, { launch: fail });
    assert.equal(await h.finalizer.recover({ messageId: "answer", trigger: "browser" }, {}), "continued");
    assert.deepEqual(h.seen.diagnostics.filter((code) => code === "run_launch_unconfirmed"), ["run_launch_unconfirmed"]);
    assert.equal(h.finalizer.activeCount(), 1);
    await until(() => h.seen.opens.length === 1, "the attempt's stream opens");
    assert.deepEqual(h.seen.opens, [h.message.runId]);
    await h.finish();
  });

  test(`C11-R a cancel of the dead attempt rejected with ${style} does not stop the continuation`, async (t) => {
    const h = deadAttempt(t, { cancel: fail });
    assert.equal(await h.finalizer.recover({ messageId: "answer", trigger: "browser" }, {}), "continued");
    assert.notEqual(h.message.runId, OLD);
    assert.equal(h.seen.launches, 1);
    await h.finish();
  });
}

test("C11-R a rejected hand-off checkpoint abandons the watch: the row stays running and recovery never runs", async (t) => {
  const error = t.mock.method(console, "error", () => undefined);
  const h = deadAttempt(t, { checkpoint: failures[0][1] });
  h.finalizer.watch({ principalId: "owner", conversationId: "chat", message: { ...h.message } });
  await until(() => h.finalizer.activeCount() === 0, "the watch ends");
  assert.equal(h.message.runStatus, "running");
  assert.equal(h.message.runId, OLD);
  assert.equal(h.seen.launches, 0);
  assert.equal(h.seen.statuses, 1); // the watch's own probe; recovery's probe never happened
  assert.equal(error.mock.callCount(), 1);
});

for (const [style, fail] of failures) {
  test(`C11-R a frame checkpoint rejected with ${style} is logged and retried no sooner than one second; the stream goes on`, async (t) => {
    const globalTimers = captureGlobalTimers(t);
    const error = t.mock.method(console, "error", () => undefined);
    const recording = recordingLedger();
    recording.hooks.onCheckpoint = (call) => call === 1 ? fail() : undefined;
    const stream = liveStream();
    const finalizer = createAssistantRunFinalizer({
      ledger: recording.ledger, now: () => 1_000, scheduler: manualScheduler().scheduler, checkpointIntervalMs: 0,
      daemon: { openEvents: async () => stream.response, runStatus: async () => 200 },
    });
    finalizer.watch(watchInput);
    stream.push(text("run-1", "unsaved"));
    await until(() => globalTimers.handles.length === 1, "the retry is armed");
    assert.equal(globalTimers.handles[0]!.delayMs, 1_000);
    assert.equal(error.mock.callCount(), 1);
    stream.push(end("run-1"));
    await until(() => finalizer.activeCount() === 0, "the run settles");
    assert.deepEqual(recording.calls.at(-1), { op: "settle", runId: "run-1", content: "unsaved", status: "succeeded" });
  });
}

for (const [port, daemon] of [
  ["openEvents", (opens: { count: number }): RunDaemonClient => ({
    openEvents: async () => ++opens.count === 1 ? failures[0][1]() : ended(end("run-1")), runStatus: async () => 200 })],
  ["runStatus", (opens: { count: number }): RunDaemonClient => ({
    openEvents: async () => ++opens.count === 1 ? droppedStream() : ended(end("run-1")), runStatus: () => failures[0][1]() })],
] as const) {
  test(`C11-R a rejected ${port} is uncertainty, not death: the watch reconnects and settles`, async () => {
    const recording = recordingLedger();
    const opens = { count: 0 };
    const finalizer = createAssistantRunFinalizer({
      ledger: recording.ledger, daemon: daemon(opens), reconnectDelayMs: 7,
      scheduler: manualScheduler({ auto: (entry) => entry.delayMs === 7 }).scheduler,
    });
    finalizer.watch(watchInput);
    await until(() => finalizer.activeCount() === 0, "the run settles");
    assert.equal(opens.count, 2);
    assert.deepEqual(recording.calls.map((call) => [call.op, call.status]), [["settle", "succeeded"]]);
  });
}

test("C11-R a release that throws is a warning; the watch is still forgotten", async (t) => {
  const warn = t.mock.method(console, "warn", () => undefined);
  const finalizer = createAssistantRunFinalizer({
    ledger: recordingLedger().ledger, scheduler: manualScheduler().scheduler,
    daemon: { openEvents: async () => ended(end("run-1")), runStatus: async () => 200, release: () => { throw new Error("pin store closed"); } },
  });
  finalizer.watch(watchInput);
  await until(() => finalizer.activeCount() === 0, "the watch is forgotten");
  assert.equal(warn.mock.callCount(), 1);
});

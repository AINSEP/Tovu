import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantRunFinalizer } from "../runtime/composition/modules/run-finalizer/entry.js";
import type { RunDaemonClient } from "../runtime/composition/modules/run-daemon-http-client.js";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import {
  end, flush, liveStream, manualScheduler, recordingLedger, runningMessage, text, unhandledRejections, until,
} from "./run-finalizer-characterization.fixture.js";

/**
 * @file What the run finalizer reports, and that reporting cannot change a run. The finalizer's
 * reporter is the console; the split (design 2026-11-16, Phase A) puts a log port between them,
 * so each line is pinned here with its exact text and arguments before the port is introduced.
 */

const RUN = "run-1";
const watchInput = () => ({ principalId: "owner", conversationId: "chat", message: runningMessage(RUN) });

test("a rejected checkpoint is logged once, with the run id in the line and the storage error as given", async (t) => {
  const errors = t.mock.method(console, "error", () => undefined);
  const storageError = new Error("storage temporarily unavailable");
  const recording = recordingLedger();
  recording.hooks.onCheckpoint = (call) => call === 1 ? Promise.reject(storageError) : undefined;
  const stream = liveStream();
  const daemon: RunDaemonClient = { openEvents: async () => stream.response, runStatus: async () => 200 };
  const finalizer = createAssistantRunFinalizer({ ledger: recording.ledger, daemon, scheduler: manualScheduler().scheduler });
  finalizer.watch(watchInput());
  stream.push(text(RUN, "partial"));
  await until(() => errors.mock.callCount() === 1, "the failed checkpoint is logged");
  await flush();
  assert.equal(errors.mock.callCount(), 1);
  assert.deepEqual(errors.mock.calls[0]!.arguments, ["[assistant-run-finalizer] checkpoint of run run-1 failed", storageError]);
  assert.equal(errors.mock.calls[0]!.arguments[1], storageError);
  stream.push(end(RUN));
  await until(() => finalizer.activeCount() === 0, "the watch ends");
  assert.deepEqual(recording.calls.at(-1), { op: "settle", runId: RUN, content: "partial", status: "succeeded" });
});

test("a watch that fails is logged once, with the run id in the line and the error as given", async (t) => {
  const errors = t.mock.method(console, "error", () => undefined);
  const settleError = new Error("database is locked");
  const recording = recordingLedger();
  recording.hooks.onSettle = () => Promise.reject(settleError);
  const daemon: RunDaemonClient = { openEvents: async () => new Response(end(RUN), { status: 200 }), runStatus: async () => 200 };
  const finalizer = createAssistantRunFinalizer({ ledger: recording.ledger, daemon, scheduler: manualScheduler().scheduler });
  finalizer.watch(watchInput());
  await finalizer.idle();
  assert.equal(finalizer.activeCount(), 0);
  assert.equal(errors.mock.callCount(), 1);
  assert.deepEqual(errors.mock.calls[0]!.arguments, ["[assistant-run-finalizer] watching run run-1 failed", settleError]);
  assert.equal(errors.mock.calls[0]!.arguments[1], settleError);
});

// ---- A reporter that fails (design section 4.4): the run's fate must not depend on it --------

const reporterFailures: { name: string; fail: () => unknown }[] = [
  { name: "throws an Error", fail: () => { throw new Error("reporter is down"); } },
  { name: "throws a value that is not an Error", fail: () => { throw "reporter is down"; } },
  { name: "returns a rejected promise", fail: () => Promise.reject(new Error("reporter is down")) },
];
const endedDaemon = (): RunDaemonClient => ({ openEvents: async () => new Response(end(RUN), { status: 200 }), runStatus: async () => 200 });

for (const failure of reporterFailures) {
  test(`a log that ${failure.name} when a watch fails still ends the watch: idle() resolves and nothing stays active`, async (t) => {
    const unhandled = unhandledRejections(t);
    const errors = t.mock.method(console, "error", failure.fail);
    const recording = recordingLedger();
    recording.hooks.onSettle = () => Promise.reject(new Error("database is locked"));
    const finalizer = createAssistantRunFinalizer({ ledger: recording.ledger, daemon: endedDaemon(), scheduler: manualScheduler().scheduler });
    finalizer.watch(watchInput());
    await finalizer.idle();
    await flush();
    assert.equal(finalizer.activeCount(), 0);
    assert.equal(errors.mock.callCount(), 1);
    assert.deepEqual(unhandled, []);
  });

  test(`a span whose setOutcome ${failure.name} still ends the watch, and the run is not reported as abandoned`, async (t) => {
    const unhandled = unhandledRejections(t);
    const errors = t.mock.method(console, "error", () => undefined);
    const outcomes: unknown[] = [];
    const span = { setOutcome: (outcome: unknown) => { outcomes.push(outcome); return failure.fail(); } };
    const tracker = { trace: async (input: { run: (given: typeof span) => unknown }) => input.run(span) } as unknown as Tracker;
    const recording = recordingLedger();
    const finalizer = createAssistantRunFinalizer({ ledger: recording.ledger, daemon: endedDaemon(), tracker, scheduler: manualScheduler().scheduler });
    finalizer.watch(watchInput());
    await finalizer.idle();
    await flush();
    assert.equal(finalizer.activeCount(), 0);
    assert.deepEqual(recording.calls, [{ op: "settle", runId: RUN, content: "", status: "succeeded" }]);
    assert.deepEqual(outcomes, [{ status: "succeeded" }]);
    assert.equal(errors.mock.callCount(), 0);
    assert.deepEqual(unhandled, []);
  });

  test(`a cleanup warning that ${failure.name} still forgets the watch`, async (t) => {
    const unhandled = unhandledRejections(t);
    const warnings = t.mock.method(console, "warn", failure.fail);
    const ended: string[] = [];
    const daemon: RunDaemonClient = { ...endedDaemon(), release: () => { throw new Error("pin store is closed"); } };
    const finalizer = createAssistantRunFinalizer({
      ledger: recordingLedger().ledger, daemon, scheduler: manualScheduler().scheduler,
      onAttemptEnded: async ({ runId }) => { ended.push(runId); },
    });
    finalizer.watch(watchInput());
    await finalizer.idle();
    await flush();
    assert.equal(finalizer.activeCount(), 0);
    assert.equal(warnings.mock.callCount(), 1);
    // A failed release skips the handler, as before the log port: both sit in one try block.
    assert.deepEqual(ended, []);
    assert.deepEqual(unhandled, []);
  });
}

import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantRunFinalizer } from "../runtime/composition/modules/assistant-run-finalizer.js";
import type { RunDaemonClient } from "../runtime/composition/modules/run-daemon-http-client.js";
import { end, flush, liveStream, manualScheduler, recordingLedger, runningMessage, text, until } from "./run-finalizer-characterization.fixture.js";

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

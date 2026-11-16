import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantRunFinalizer } from "../runtime/composition/modules/assistant-run-finalizer.js";
import { end, ended, manualScheduler, recordingLedger, runningMessage, until } from "./run-finalizer-characterization.fixture.js";

/**
 * @file Fix X1 (run-finalizer design 2026-11-16, section 4.4, defect F5): an events response the
 * finalizer will not read (404, or any other non-OK status) has its body cancelled. A body that
 * is neither read nor cancelled stays open, and a run can reconnect 30 times. The three
 * statements come from the tests of the finalizer copy that Jini publishes
 * (`packages/chat/src/server/run-finalizer/__tests__/finalizer-boundaries.test.ts`), which the
 * engine in this file is going to replace.
 */

const watchInput = { principalId: "owner", conversationId: "chat", message: runningMessage("run-1") };

/** A response of `status` whose body records each cancel and, when asked, fails it. */
function unusable(status: number, optional: { cancelFails?: boolean } = {}) {
  const seen = { cancels: 0 };
  const body = new ReadableStream<Uint8Array>({ cancel() {
    seen.cancels += 1;
    if (optional.cancelFails) throw new Error("socket already torn down");
  } });
  return { response: new Response(body, { status }), seen };
}

test("X1 a 404 events response has its body cancelled", async () => {
  const gone = unusable(404);
  const recording = recordingLedger();
  const finalizer = createAssistantRunFinalizer({
    ledger: recording.ledger, scheduler: manualScheduler().scheduler,
    daemon: { openEvents: async () => gone.response, runStatus: async () => 404 },
  });
  finalizer.watch(watchInput);
  await until(() => finalizer.activeCount() === 0, "the watch ends");
  assert.equal(gone.seen.cancels, 1);
  assert.deepEqual(recording.calls.at(-1), { op: "settle", runId: "run-1", content: "", status: "canceled" });
});

for (const cancelFails of [false, true]) {
  test(`X1 a 503 events response has its body cancelled${cancelFails ? ", and a cancel that fails changes nothing" : ""}`, async () => {
    const refused = unusable(503, { cancelFails });
    const recording = recordingLedger();
    let opens = 0;
    const finalizer = createAssistantRunFinalizer({
      ledger: recording.ledger, reconnectDelayMs: 7, scheduler: manualScheduler({ auto: (entry) => entry.delayMs === 7 }).scheduler,
      daemon: { openEvents: async () => ++opens === 1 ? refused.response : ended(end("run-1")), runStatus: async () => 200 },
    });
    finalizer.watch(watchInput);
    await until(() => finalizer.activeCount() === 0, "the watch ends");
    assert.equal(refused.seen.cancels, 1);
    // Treated as a dropped connection either way: one reconnect, then the normal settlement.
    assert.equal(opens, 2);
    assert.deepEqual(recording.calls, [{ op: "settle", runId: "run-1", content: "", status: "succeeded" }]);
  });
}

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import type { RunDaemonClient } from "../../run-daemon-http-client.js";
import { createCheckpointer, type CheckpointerPorts } from "../checkpointer.js";
import type { RunLogPort, RunTimerPort } from "../ports.js";
import { makeWatch } from "../watch-state.js";

/**
 * @file The checkpointer against fakes of its four ports (ledger, clock, timer, log). The cadence
 * and backoff rules are covered through the finalizer in
 * `server/__tests__/assistant-run-finalizer.checkpoint-backoff.unit.test.ts`; this file covers what
 * only a port fake can reach: a host log that fails.
 */

const RUN = "run-1";
const NOW = 50_000;
const unusedDaemon: RunDaemonClient = {
  openEvents: async () => { throw new Error("the checkpointer never opens a stream"); },
  runStatus: async () => { throw new Error("the checkpointer never probes"); },
};

/** The timer port with manual firing, so a retry is observed as an armed entry, not by waiting. */
function manualTimers() {
  const entries: { delayMs: number; run: () => void; state: "armed" | "fired" | "canceled" }[] = [];
  const timers: RunTimerPort = {
    schedule({ delayMs, run }) {
      const entry = { delayMs, run, state: "armed" as "armed" | "fired" | "canceled" };
      entries.push(entry);
      return () => { if (entry.state === "armed") entry.state = "canceled"; };
    },
  };
  const armed = () => entries.filter((entry) => entry.state === "armed");
  return { timers, armed, fire() { const [entry] = armed(); assert.ok(entry, "a timer is armed"); entry.state = "fired"; entry.run(); } };
}

/** A ledger whose first checkpoint rejects with `storageError`; later ones are saved. */
function failingOnceLedger(storageError: Error) {
  const contents: string[] = [];
  const ledger: CheckpointerPorts["ledger"] = {
    checkpoint: async ({ content }) => {
      contents.push(content);
      if (contents.length === 1) throw storageError;
      return true;
    },
  };
  return { ledger, contents };
}

async function turns(count = 8): Promise<void> {
  for (let turn = 0; turn < count; turn++) await new Promise<void>((done) => { setImmediate(done); });
}

/** Collects unhandled rejections for one test; the listener is removed when the test ends. */
function unhandledRejections(t: TestContext): unknown[] {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => { seen.push(reason); };
  process.on("unhandledRejection", listener);
  t.after(() => { process.off("unhandledRejection", listener); });
  return seen;
}

function quietWatch() {
  return makeWatch({
    principalId: "owner", conversationId: "chat", runId: RUN, daemon: unusedDaemon, attemptBase: [], now: NOW, resolutionTimeoutMs: 60_000,
    message: { id: "answer", role: "assistant", content: "", events: [], runId: RUN, runStatus: "running" },
  });
}

const failingLogs: { name: string; error: RunLogPort["error"] }[] = [
  { name: "throws an Error", error: () => { throw new Error("log sink is down"); } },
  { name: "throws a value that is not an Error", error: () => { throw "log sink is down"; } },
  { name: "returns a rejected promise", error: () => Promise.reject(new Error("log sink is down")) },
];

for (const failingLog of failingLogs) {
  test(`a log that ${failingLog.name} does not stop the backed-off retry of a failed checkpoint`, async (t) => {
    const unhandled = unhandledRejections(t);
    const storageError = new Error("storage temporarily unavailable");
    const { ledger, contents } = failingOnceLedger(storageError);
    const { timers, armed, fire } = manualTimers();
    const reported: Parameters<RunLogPort["error"]>[0][] = [];
    const log: RunLogPort = { error: (required) => { reported.push(required); return failingLog.error(required); } };
    const clock = { now: NOW };
    const checkpointer = createCheckpointer({ ledger, now: () => clock.now, checkpointTimers: timers, log, checkpointIntervalMs: 0 });
    const watch = quietWatch();

    watch.events.push({ kind: "text", text: "partial" });
    checkpointer.onFrame({ watch });
    await turns();

    assert.deepEqual(reported, [{ operation: "checkpoint", runId: RUN, error: storageError }]);
    assert.equal(reported[0]!.error, storageError);
    assert.deepEqual(contents, ["partial"]);
    // The retry is armed although the log failed: never sooner than one second, and exactly one.
    assert.deepEqual(armed().map((entry) => entry.delayMs), [1_000]);
    assert.equal(watch.checkpointRetryAt, NOW + 1_000);
    assert.equal(watch.checkpointPending, false);

    clock.now = NOW + 1_000;
    fire();
    await turns();

    assert.deepEqual(contents, ["partial", "partial"]);
    assert.equal(watch.checkpointedTextCharacters, "partial".length);
    assert.equal(armed().length, 0);
    assert.deepEqual(unhandled, []);
  });
}

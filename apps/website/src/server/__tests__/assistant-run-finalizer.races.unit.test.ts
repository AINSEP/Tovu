import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { EXHAUSTED_NOTICE } from "@jini-ai/chat/server/durable-runs";
import type { ChatRunLedger } from "#src/assistant/index";
import { createAssistantRunFinalizer } from "../runtime/composition/modules/run-finalizer/entry.js";
import { type RunDaemonClient } from "../runtime/composition/modules/run-daemon-http-client.js";
import { recoveryLedgerFixture } from "./durable-ledger.fixture.js";
import {
  captureGlobalTimers, deferred, end, ended, flush, liveStream, manualScheduler, recordingLedger, runningMessage, text, until,
  type Deferred,
} from "./run-finalizer-characterization.fixture.js";

/**
 * @file Phase 0 guard races (run-finalizer design 2026-11-16, section 7, "Guard races").
 * Several guards overlap on the common schedules, so each test drives a schedule whose outcome
 * only ONE guard protects: the `expectedRunId` check (G1), the engine's terminal checks (G2),
 * recovery's reload after a probe (C13a-c) and the cancel check in the CAS window (C13d).
 * C16 and C17 record suspected defect F4 (a continuation launched for, or running under, a
 * terminal row) exactly as it behaves today. C11-G3 (the ledger rejects a checkpoint that
 * finishes after settle) is already pinned on the real database by
 * `assistant-run-finalizer.restart.test.ts`, "a buffered completed run settles despite a
 * pending checkpoint".
 */

const OLD = "run-x";
const NOW = 20_000; // past the 10 s launch grace of an attempt that started at 0

/** Recovery over the generation-fenced ledger fake, with one holdable call per boundary. */
function raceHarness(t: TestContext, optional: { recoveryCount?: number; statusOf?: (runId: string) => number | null; launch?: () => Promise<void> } = {}) {
  t.mock.method(console, "info", () => undefined);
  const message = runningMessage(OLD, { content: "Saved", events: [{ kind: "text", text: "Saved" }] });
  const clock = { now: NOW };
  const fixture = recoveryLedgerFixture({ message, now: () => clock.now }, { recoveryCount: optional.recoveryCount });
  const base = fixture.ledger.durable!;
  const hold: { status?: Deferred<number | null>; loadAfterAdvance?: Deferred<void>; launch?: Deferred<void> } = {};
  const seen = { statuses: [] as string[], opens: [] as string[], launches: [] as string[], cancels: [] as string[],
    settles: [] as Array<{ runId: string; status: string; written: boolean }>, loadHeld: false };
  let holdNextLoad = false;
  const releaseStreams = deferred<void>();
  const ledger: ChatRunLedger = {
    ...fixture.ledger,
    durable: {
      ...base,
      advance: async (required, options) => {
        const advanced = await base.advance(required, options);
        if (advanced && hold.loadAfterAdvance) holdNextLoad = true;
        return advanced;
      },
      // Held BEFORE the read, so the released load sees whatever the test committed meanwhile.
      load: async (required, options) => {
        if (holdNextLoad) { holdNextLoad = false; seen.loadHeld = true; await hold.loadAfterAdvance!.promise; }
        return base.load(required, options);
      },
    },
    settle: async (input) => {
      const written = await fixture.ledger.settle(input);
      seen.settles.push({ runId: input.runId, status: input.status, written });
      return written;
    },
  };
  const daemon: RunDaemonClient = {
    runStatus: async ({ runId }) => { seen.statuses.push(runId); return hold.status ? hold.status.promise : (optional.statusOf ?? (() => 404))(runId); },
    // Every attached watch waits here until the test lets the attempts finish.
    openEvents: async ({ runId }) => { seen.opens.push(runId); await releaseStreams.promise; return ended(text(runId, " and more"), end(runId)); },
    launch: async ({ run }) => { seen.launches.push(run.runId); await hold.launch?.promise; await optional.launch?.(); },
    cancel: async ({ runId }) => { seen.cancels.push(runId); },
  };
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, now: () => clock.now, reconnectDelayMs: 0, scheduler: manualScheduler().scheduler, checkpointIntervalMs: 0 });
  const recover = (required: { expectedRunId?: string; trigger?: "browser" | "stream" } = {}) =>
    finalizer.recover({ messageId: "answer", trigger: required.trigger ?? "browser", ...(required.expectedRunId ? { expectedRunId: required.expectedRunId } : {}) }, {});
  const finishAttempts = async () => { releaseStreams.resolve(); await until(() => finalizer.activeCount() === 0, "every attached watch ends"); };
  return { message, clock, fixture, ledger, hold, seen, finalizer, recover, finishAttempts };
}

const settlement = (runId: string, status: "succeeded" | "failed") =>
  ({ conversationId: "chat", messageId: "answer", runId, status, content: "Saved", events: [], endedAt: NOW });

test("C11-G1 a stale watch's hand-off for an attempt that was already replaced is superseded, even when the replacement looks dead", async (t) => {
  const h = raceHarness(t, { launch: async () => { throw new Error("start response lost"); } });
  assert.equal(await h.recover(), "continued");
  assert.notEqual(h.message.runId, OLD);
  h.clock.now += 10_000; // the replacement is now past its own launch grace and still answers 404
  assert.equal(await h.recover({ expectedRunId: OLD, trigger: "stream" }), "superseded");
  assert.equal(h.seen.launches.length, 1);
  assert.equal(h.fixture.snapshot().recoveryCount, 1);
  await h.finishAttempts();
});

test("C13a a live probe answer that arrives after the row was settled reports terminal and starts no watch", async (t) => {
  const h = raceHarness(t);
  h.hold.status = deferred();
  const result = h.recover();
  await until(() => h.seen.statuses.length === 1, "the probe is in flight");
  await h.ledger.settle(settlement(OLD, "succeeded"));
  h.hold.status.resolve(200);
  assert.equal(await result, "terminal");
  assert.equal(h.finalizer.activeCount(), 0);
  assert.deepEqual(h.seen.opens, []);
});

test("C13b a live probe answer for an attempt replaced meanwhile is superseded and watches neither attempt", async (t) => {
  const h = raceHarness(t);
  h.hold.status = deferred();
  const result = h.recover();
  await until(() => h.seen.statuses.length === 1, "the probe is in flight");
  assert.equal(await h.ledger.durable!.advance({ run: h.fixture.snapshot(), nextRunId: "run-y", now: NOW, events: [] }, {}), true);
  h.hold.status.resolve(200);
  assert.equal(await result, "superseded");
  assert.deepEqual(h.seen.opens, []);
});

test("C13c a cancel recorded during a live probe finalizes the run as canceled instead of reattaching", async (t) => {
  const h = raceHarness(t);
  h.hold.status = deferred();
  const result = h.recover();
  await until(() => h.seen.statuses.length === 1, "the probe is in flight");
  await h.ledger.durable!.cancel({ runId: OLD, reason: "user" }, {});
  h.hold.status.resolve(200);
  assert.equal(await result, "finalized");
  assert.equal(h.message.runStatus, "canceled");
  assert.deepEqual(h.message.events?.at(-1), { kind: "status", label: "Stopped. Saved work is above." });
  assert.deepEqual(h.seen.opens, []);
});

test("C13d a cancel that lands between the attempt CAS and its reload stops the launch", async (t) => {
  const h = raceHarness(t);
  h.hold.loadAfterAdvance = deferred();
  const result = h.recover();
  await until(() => h.seen.loadHeld, "the post-CAS reload is held");
  await h.ledger.durable!.cancel({ runId: h.message.runId!, reason: "user" }, {});
  h.hold.loadAfterAdvance.resolve();
  assert.equal(await result, "finalized");
  assert.deepEqual(h.seen.launches, []);
  assert.equal(h.message.runStatus, "canceled");
});

test("C13e two recoveries of one dead attempt launch one continuation (integration baseline, three guards overlap)", async (t) => {
  const h = raceHarness(t);
  assert.deepEqual((await Promise.all([h.recover(), h.recover()])).sort(), ["continued", "superseded"]);
  assert.equal(h.seen.launches.length, 1);
  await h.finishAttempts();
});

test("C16 (pins F4, window 1) a row settled between the CAS and the reload is still launched, with no watch", async (t) => {
  const h = raceHarness(t);
  h.hold.loadAfterAdvance = deferred();
  const result = h.recover();
  await until(() => h.seen.loadHeld, "the post-CAS reload is held");
  assert.equal(await h.ledger.settle(settlement(h.message.runId!, "failed")), true);
  h.hold.loadAfterAdvance.resolve();
  // A terminal check before launch would change exactly these three assertions.
  assert.equal(await result, "continued");
  assert.equal(h.seen.launches.length, 1);
  assert.equal(h.finalizer.activeCount(), 0);
});

test("C17 (pins F4, window 2) the third continuation is finalized failed while its launch is in flight, then runs unsaved", async (t) => {
  const h = raceHarness(t, { recoveryCount: 2 });
  h.hold.launch = deferred();
  const launching = h.recover();
  await until(() => h.seen.launches.length === 1, "the third continuation's launch is in flight");
  const attempt = h.message.runId!;
  assert.equal(await h.recover(), "finalized");
  assert.equal(h.message.runStatus, "failed");
  assert.equal(h.message.events?.some((event) => event.kind === "status" && event.label === EXHAUSTED_NOTICE), true);
  h.hold.launch.resolve();
  assert.equal(await launching, "continued");
  assert.equal(h.finalizer.activeCount(), 1);
  await h.finishAttempts();
  assert.deepEqual(h.seen.settles.at(-1), { runId: attempt, status: "succeeded", written: false });
  assert.equal(h.message.runStatus, "failed");
});

// ---- C11-G2: the engine itself stops checkpointing once the outcome is known -------------------

test("C11-G2a a trailing checkpoint timer that fires after settlement started writes nothing", async (t) => {
  const globalTimers = captureGlobalTimers(t);
  const recording = recordingLedger();
  const clock = { now: 1_000 };
  const stream = liveStream();
  const finalizer = createAssistantRunFinalizer({
    ledger: recording.ledger, now: () => clock.now, scheduler: manualScheduler().scheduler,
    daemon: { openEvents: async () => stream.response, runStatus: async () => 200 },
  });
  finalizer.watch({ principalId: "owner", conversationId: "chat", message: runningMessage("run-1") });
  stream.push(text("run-1", "saved"));
  await until(() => recording.calls.length === 1, "the first frame is checkpointed");
  await flush();
  stream.push(text("run-1", " unsaved"));
  await until(() => globalTimers.handles.length === 1, "the trailing timer is armed");
  stream.push(end("run-1"));
  await until(() => finalizer.activeCount() === 0, "the run settles");
  const before = recording.calls.length;
  clock.now += 60_000;
  globalTimers.handles[0]!.run(); // a callback already queued when cleanup cleared the timer
  await flush();
  assert.deepEqual(recording.calls.slice(before), []);
  assert.equal(recording.calls.at(-1)!.op, "settle");
});

test("C11-G2b a checkpoint that rejects after settlement started arms no retry", async (t) => {
  const globalTimers = captureGlobalTimers(t);
  t.mock.method(console, "error", () => undefined);
  const recording = recordingLedger();
  const held = deferred<boolean>();
  recording.hooks.onCheckpoint = (call) => call === 1 ? held.promise : undefined;
  const finalizer = createAssistantRunFinalizer({
    ledger: recording.ledger, now: () => 1_000, scheduler: manualScheduler().scheduler,
    daemon: { openEvents: async () => ended(text("run-1", "unsaved"), end("run-1")), runStatus: async () => 200 },
  });
  finalizer.watch({ principalId: "owner", conversationId: "chat", message: runningMessage("run-1") });
  await until(() => finalizer.activeCount() === 0, "the run settles past its pending checkpoint");
  held.reject(new Error("database is locked"));
  await flush();
  assert.deepEqual(globalTimers.armed(), []);
  assert.equal(globalTimers.handles.length, 0);
});

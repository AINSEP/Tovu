import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createNoopObservabilityPort } from "@jini-ai/diagnostics/observability";
import type { ChatRunLedger } from "#src/assistant/index";
import { assistantRunFinalizerFor, createAssistantRunFinalizer, type AssistantRunFinalizer } from "../runtime/composition/modules/assistant-run-finalizer.js";
import { createHttpRunDaemonClient, type RunDaemonClient } from "../runtime/composition/modules/run-daemon-http-client.js";
import { recoveryLedgerFixture } from "./durable-ledger.fixture.js";
import {
  captureGlobalTimers, deferred, droppedStream, end, ended, flush, liveStream, manualScheduler, missing,
  recordingLedger, runningMessage, text, until,
} from "./run-finalizer-characterization.fixture.js";

/**
 * @file Phase 0 characterization of the assistant run finalizer (design 2026-11-16, section 7):
 * the timing of late and eager reads, the two timer sources, the deadline and reconnect edges,
 * and the effects at watch end. Each test pins ONE predicate of today's behaviour, and names in
 * its title the case id whose mutation it must fail on (`cloud-results/run-finalizer-a.md` holds
 * the mutation run). Nothing here states what the behaviour should be; C9 and C10 pin suspected
 * defects F1 and F2 as they are.
 */

const RUN = "run-1";
const watchInput = (runId = RUN) => ({ principalId: "owner", conversationId: "chat", message: runningMessage(runId) });
const DEADLINE_MS = 60_000;
const RECONNECT_MS = 7;

/** A daemon whose n-th events request and n-th status probe are scripted by the test. */
function scriptedDaemon(script: {
  open: (call: number, signal?: AbortSignal) => Response | Promise<Response>;
  status?: (call: number, signal?: AbortSignal) => number | null | Promise<number | null>;
}) {
  const counts = { opens: 0, statuses: 0, releases: 0 };
  const daemon: RunDaemonClient = {
    openEvents: async (_request, optional = {}) => script.open(++counts.opens, optional.signal),
    runStatus: async (_request, optional = {}) => (script.status ?? (() => 200))(++counts.statuses, optional.signal),
    release: () => { counts.releases += 1; },
  };
  return { daemon, counts };
}

// ---- Timing of reads -------------------------------------------------------------------------

test("C2 an attempt-ended handler installed after the shared finalizer was created still receives the run id", async () => {
  const { ledger } = recordingLedger();
  const { daemon } = scriptedDaemon({ open: () => ended(end(RUN)) });
  const first = assistantRunFinalizerFor({ ledger, daemon, scheduler: manualScheduler().scheduler });
  const ended_: string[] = [];
  const second = assistantRunFinalizerFor({ ledger, onAttemptEnded: async ({ runId }) => { ended_.push(runId); } });
  assert.equal(second, first);
  first.watch(watchInput());
  await until(() => first.activeCount() === 0, "the watch ends");
  assert.deepEqual(ended_, [RUN]);
});

test("C3 the HTTP client snapshots the previous daemon exactly once, before its constructor returns", async () => {
  let snapshots = 0;
  const client = createHttpRunDaemonClient({ observability: createNoopObservabilityPort({}) }, {
    previousDaemon: async () => { snapshots += 1; return null; },
    currentUrl: () => "http://127.0.0.1:9",
    fetch: (async () => new Response(null, { status: 200 })) as typeof fetch,
  });
  assert.equal(snapshots, 1);
  for (let request = 0; request < 3; request++) assert.equal(await client.runStatus({ runId: RUN, principalId: "owner" }), 200);
  assert.equal(snapshots, 1);
});

test("C4 the durable store is read once at construction; one that appears later is ignored", async () => {
  const recording = recordingLedger();
  let reads = 0;
  const later = recoveryLedgerFixture({ message: runningMessage(), now: () => 0 }, {}).ledger.durable;
  const ledger: ChatRunLedger = Object.defineProperty({ ...recording.ledger }, "durable", {
    get() { reads += 1; return reads === 1 ? undefined : later; },
  });
  const { daemon } = scriptedDaemon({ open: () => missing(), status: () => 404 });
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, scheduler: manualScheduler().scheduler });
  assert.equal(reads, 1);
  finalizer.watch(watchInput("run-1"));
  finalizer.watch(watchInput("run-2"));
  await until(() => finalizer.activeCount() === 0, "both watches end");
  assert.equal(reads, 1);
  // The no-recovery arm: a proven-missing run is settled canceled here, never handed to recovery.
  assert.deepEqual(recording.calls.filter((call) => call.op === "settle").map((call) => [call.runId, call.status]).sort(),
    [["run-1", "canceled"], ["run-2", "canceled"]]);
});

// ---- The two timer sources -------------------------------------------------------------------

/** One open stream, one saved frame, then one frame inside the checkpoint interval. */
async function quietRunWithSkippedFrame(t: TestContext) {
  const globalTimers = captureGlobalTimers(t);
  const timers = manualScheduler();
  const recording = recordingLedger();
  const stream = liveStream();
  const { daemon, counts } = scriptedDaemon({ open: () => stream.response });
  const finalizer = createAssistantRunFinalizer({
    ledger: recording.ledger, daemon, scheduler: timers.scheduler, now: () => 1_000, resolutionTimeoutMs: DEADLINE_MS,
  });
  finalizer.watch(watchInput());
  await until(() => counts.opens === 1 && timers.armed().length === 1, "the stream is open");
  const armedBefore = timers.armed().map((entry) => entry.delayMs);
  const finish = async () => {
    stream.push(end(RUN));
    await until(() => finalizer.activeCount() === 0, "the watch ends");
  };
  return { globalTimers, timers, recording, stream, armedBefore, finish };
}

test("C5c the resolution deadline is the scheduler's only timer for an open, silent stream", async (t) => {
  const run = await quietRunWithSkippedFrame(t);
  assert.deepEqual(run.armedBefore, [DEADLINE_MS]);
  assert.equal(run.globalTimers.handles.length, 0);
  await run.finish();
});

test("C5a the trailing checkpoint timer is a global timer, not a scheduler entry", async (t) => {
  const run = await quietRunWithSkippedFrame(t);
  run.stream.push(text(RUN, "saved"));
  await until(() => run.recording.calls.length === 1, "the first frame is checkpointed");
  await flush();
  assert.equal(run.globalTimers.armed().length, 0);
  run.stream.push(text(RUN, " skipped"));
  await until(() => run.globalTimers.armed().length === 1, "the trailing timer is armed");
  assert.deepEqual(run.timers.armed().map((entry) => entry.delayMs), run.armedBefore);
  assert.equal(run.globalTimers.armed()[0]!.delayMs, 1_000);
  await run.finish();
});

test("C5b the trailing checkpoint timer is unref'd exactly once, so it cannot hold the process open", async (t) => {
  const run = await quietRunWithSkippedFrame(t);
  run.stream.push(text(RUN, "saved"));
  await until(() => run.recording.calls.length === 1, "the first frame is checkpointed");
  run.stream.push(text(RUN, " skipped"));
  await until(() => run.globalTimers.handles.length === 1, "the trailing timer is armed");
  assert.equal(run.globalTimers.handles[0]!.unrefs, 1);
  await run.finish();
});

// ---- Deadline and reconnect edges ------------------------------------------------------------

/** A run whose stream drops at once and whose status stays unknown: only the bounds can end it. */
function droppingRun(optional: { maxReconnects?: number; status?: (call: number) => number | null; open?: (call: number) => Response; auto?: boolean } = {}) {
  const clock = { now: 1_000 };
  const timers = manualScheduler({ auto: (entry) => optional.auto === true && entry.delayMs === RECONNECT_MS });
  const recording = recordingLedger();
  const { daemon, counts } = scriptedDaemon({
    open: optional.open ?? (() => droppedStream()),
    status: (call) => (optional.status ?? (() => null))(call),
  });
  const finalizer = createAssistantRunFinalizer({
    ledger: recording.ledger, daemon, scheduler: timers.scheduler, now: () => clock.now,
    resolutionTimeoutMs: DEADLINE_MS, reconnectDelayMs: RECONNECT_MS, maxReconnects: optional.maxReconnects ?? 5,
  });
  /** Without durable recovery a `timeout` hand-off saves the row and leaves it unsettled. */
  const handedOffAsTimeout = () => recording.calls.length === 1 && recording.calls[0]!.op === "checkpoint" && finalizer.activeCount() === 0;
  return { clock, timers, recording, counts, finalizer, handedOffAsTimeout, deadline: 1_000 + DEADLINE_MS };
}

test("C6a a dropping stream is handed off when the clock reaches the deadline, not one millisecond earlier", async () => {
  // The deadline is fixed when the watch starts; each status probe then moves the clock.
  const early = droppingRun({ status: (call) => { early.clock.now = early.deadline - (call === 1 ? 1 : 0); return null; } });
  early.finalizer.watch(watchInput());
  await until(() => early.timers.armed().length === 1 && early.counts.statuses === 1 && early.timers.armed()[0]!.delayMs === 1, "the reconnect delay is armed");
  assert.deepEqual(early.recording.calls, []);
  early.timers.fireWhere((entry) => entry.delayMs === 1);
  await until(early.handedOffAsTimeout, "the early run is handed off on its second probe");
  assert.equal(early.counts.opens, 2);

  const onTime = droppingRun({ status: () => { onTime.clock.now = onTime.deadline; return null; } });
  onTime.finalizer.watch(watchInput());
  await until(() => onTime.counts.statuses === 1, "the on-time run is probed");
  await flush();
  assert.equal(onTime.counts.opens, 1);
  assert.equal(onTime.handedOffAsTimeout(), true);
});

test("C6b the reconnect budget hands off after exactly maxReconnects + 1 connections", async () => {
  const run = droppingRun({ maxReconnects: 2, auto: true });
  run.finalizer.watch(watchInput());
  await until(() => run.finalizer.activeCount() === 0, "the run ends");
  assert.equal(run.counts.opens, 3);
  assert.equal(run.handedOffAsTimeout(), true);
});

test("C6c fresh live proof at the reconnect limit restarts the count instead of passing it", async () => {
  const statuses: Array<number | null> = [null, 200, null, null];
  const run = droppingRun({
    maxReconnects: 1, auto: true, status: (call) => statuses[call - 1] ?? null,
    // A fifth connection would settle the run; the restarted count must hand off before it.
    open: (call) => call >= 5 ? ended(end(RUN)) : droppedStream(),
  });
  run.finalizer.watch(watchInput());
  await until(() => run.finalizer.activeCount() === 0, "the run ends");
  assert.equal(run.counts.opens, 4);
  assert.equal(run.handedOffAsTimeout(), true);
});

test("C6d a stalled stream is probed only at the deadline; live proof renews it, uncertainty hands off", async () => {
  const stream = liveStream();
  const statuses: Array<number | null> = [200, null];
  const run = droppingRun({ open: () => stream.response, status: (call) => { run.clock.now += 500; return statuses[call - 1] ?? null; } });
  run.finalizer.watch(watchInput());
  await until(() => run.timers.armed().length === 1, "the deadline is armed");
  await flush();
  assert.equal(run.counts.statuses, 0);
  run.timers.fireWhere((entry) => entry.delayMs === DEADLINE_MS);
  await until(() => run.counts.statuses === 1, "the deadline probe runs");
  await flush();
  // Renewed from the probe's clock: a full window again, on the same connection.
  assert.deepEqual(run.timers.armed().map((entry) => entry.delayMs), [DEADLINE_MS]);
  assert.equal(run.counts.opens, 1);
  assert.deepEqual(run.recording.calls, []);
  run.timers.fireWhere((entry) => entry.delayMs === DEADLINE_MS);
  await until(run.handedOffAsTimeout, "the uncertain probe hands the run off");
  assert.equal(run.counts.opens, 1);
});

test("C6e a status probe that never answers is cut off at statusTimeoutMs and its request is aborted", async () => {
  const STATUS_MS = 4_321;
  const timers = manualScheduler();
  const recording = recordingLedger();
  const signals: AbortSignal[] = [];
  const { daemon, counts } = scriptedDaemon({
    open: (call) => call === 1 ? droppedStream() : ended(end(RUN)),
    status: (_call, signal) => { signals.push(signal!); return new Promise<number | null>(() => undefined); },
  });
  const finalizer = createAssistantRunFinalizer({
    ledger: recording.ledger, daemon, scheduler: timers.scheduler, now: () => 1_000,
    resolutionTimeoutMs: DEADLINE_MS, statusTimeoutMs: STATUS_MS, reconnectDelayMs: RECONNECT_MS,
  });
  finalizer.watch(watchInput());
  await until(() => signals.length === 1, "the probe starts");
  await flush();
  assert.deepEqual(timers.armed().map((entry) => entry.delayMs), [STATUS_MS]);
  assert.equal(signals[0]!.aborted, false);
  timers.fireWhere((entry) => entry.delayMs === STATUS_MS);
  // An unanswered probe is uncertainty, not death: the watch reconnects.
  await until(() => timers.armed().some((entry) => entry.delayMs === RECONNECT_MS), "the reconnect delay is armed");
  assert.equal(signals[0]!.aborted, true);
  assert.deepEqual(recording.calls, []);
  timers.fireWhere((entry) => entry.delayMs === RECONNECT_MS);
  await until(() => finalizer.activeCount() === 0, "the second connection settles the run");
  assert.equal(counts.opens, 2);
});

// ---- Watch end -------------------------------------------------------------------------------

test("C7 at watch end the stream is aborted, then the pin released, then the handler called, then the watch forgotten", async (t) => {
  const order: string[] = [];
  const { ledger } = recordingLedger();
  const finalizers: AssistantRunFinalizer[] = [];
  const daemon: RunDaemonClient = {
    openEvents: async (_request, optional = {}) => {
      optional.signal?.addEventListener("abort", () => { order.push("stream aborted"); });
      return ended(end(RUN));
    },
    runStatus: async () => 200,
    release: () => { order.push("release"); },
  };
  finalizers.push(createAssistantRunFinalizer({
    ledger, daemon, scheduler: manualScheduler().scheduler,
    onAttemptEnded: async () => { order.push(`handler (watched: ${finalizers[0]!.activeCount()})`); },
  }));
  finalizers[0]!.watch(watchInput());
  await until(() => finalizers[0]!.activeCount() === 0, "the watch is forgotten");
  assert.deepEqual(order, ["stream aborted", "release", "handler (watched: 1)"]);

  const warn = t.mock.method(console, "warn", () => undefined);
  const failing = createAssistantRunFinalizer({
    ledger, daemon: { ...daemon, release: undefined }, scheduler: manualScheduler().scheduler,
    onAttemptEnded: async () => { throw new Error("recheck unavailable"); },
  });
  failing.watch(watchInput());
  await until(() => failing.activeCount() === 0, "a throwing handler still forgets the watch");
  assert.equal(warn.mock.callCount(), 1);
});

test("C8 an ended watch neither releases the pin nor removes a successor that shares its daemon client", async () => {
  const recording = recordingLedger();
  const held = deferred<boolean>();
  recording.hooks.onCheckpoint = (call) => call === 1 ? held.promise : undefined;
  const successor = liveStream();
  const { daemon, counts } = scriptedDaemon({ open: (call) => call === 1 ? missing() : successor.response, status: (call) => call === 1 ? 404 : 200 });
  const finalizer = createAssistantRunFinalizer({ ledger: recording.ledger, daemon, scheduler: manualScheduler().scheduler });
  finalizer.watch(watchInput());
  await until(() => recording.calls.length === 1, "the first watch stops and saves before its hand-off");
  finalizer.watch(watchInput());
  await until(() => counts.opens === 2, "the successor opens its own stream");
  held.resolve(true);
  await until(() => recording.calls.some((call) => call.op === "settle"), "the first watch finishes");
  await flush();
  assert.equal(counts.releases, 0);
  assert.equal(finalizer.activeCount(), 1);
  successor.push(end(RUN));
  await until(() => finalizer.activeCount() === 0, "the successor ends");
  assert.equal(counts.releases, 1);
});

test("C9 (pins F1) after a new attempt's first watch is replaced, its cancel goes to the previous daemon's client", async () => {
  const message = runningMessage("run-old");
  const base = recoveryLedgerFixture({ message, now: () => 20_000 }, {}).ledger;
  const held = deferred<void>();
  let checkpoints = 0;
  const ledger: ChatRunLedger = { ...base, checkpoint: async (input, optional) => {
    if (++checkpoints === 1) await held.promise;
    return base.checkpoint(input, optional);
  } };
  const cancels: string[] = [];
  const previous: RunDaemonClient = {
    openEvents: async () => missing(), runStatus: async () => 404,
    cancel: async ({ runId }) => { cancels.push(`previous daemon: ${runId}`); },
  };
  const successor = liveStream();
  const statuses = [404];
  let opens = 0;
  const current: RunDaemonClient = {
    openEvents: async () => ++opens === 1 ? missing() : successor.response,
    runStatus: async () => statuses.shift() ?? 200,
    launch: async () => undefined,
    cancel: async ({ runId }) => { cancels.push(`current daemon: ${runId}`); },
  };
  let attemptsEnded = 0;
  const finalizer = createAssistantRunFinalizer({
    ledger, daemon: current, recoveryDaemon: previous, now: () => 20_000, reconnectDelayMs: 0,
    scheduler: manualScheduler({ auto: (entry) => entry.delayMs === 0 }).scheduler,
    onAttemptEnded: async () => { attemptsEnded += 1; },
  });
  assert.equal(await finalizer.recover({ messageId: "answer", trigger: "browser" }, {}), "continued");
  const attempt = message.runId!;
  assert.notEqual(attempt, "run-old");
  await until(() => checkpoints === 1, "the new attempt's first watch stops for its hand-off");
  finalizer.watch({ principalId: "owner", conversationId: "chat", message: { ...message } });
  await until(() => opens === 2, "the successor watch is live");
  held.resolve();
  await until(() => attemptsEnded === 1, "the first watch cleans up under a live successor");
  await ledger.durable!.cancel({ runId: attempt, reason: "user" }, {});
  assert.equal(await finalizer.recover({ messageId: "answer", trigger: "browser" }, {}), "finalized");
  // F1: the attempt was launched on the current daemon, but the first watch's cleanup forgot that.
  assert.deepEqual(cancels, ["previous daemon: run-old", `previous daemon: ${attempt}`]);
  successor.push(end(attempt));
  await until(() => finalizer.activeCount() === 0, "the successor ends");
});

for (const [style, reject] of [
  ["an Error", async () => { throw new Error("database is locked"); }],
  ["a non-Error value", async () => { throw "database is locked"; }],
  ["a rejected promise", () => Promise.reject(new Error("database is locked"))],
] as const) {
  test(`C10 (pins F2) a settle rejected with ${style} leaves the row running and unwatched until a later watch settles it`, async (t) => {
    const message = runningMessage();
    const base = recoveryLedgerFixture({ message, now: () => 1_000 }, {}).ledger;
    let settles = 0;
    const ledger: ChatRunLedger = { ...base, durable: undefined, settle: async (input) => ++settles === 1 ? reject() : base.settle(input) };
    const { daemon } = scriptedDaemon({ open: () => ended(text(RUN, "Done"), end(RUN)) });
    const error = t.mock.method(console, "error", () => undefined);
    const finalizer = createAssistantRunFinalizer({ ledger, daemon, scheduler: manualScheduler().scheduler, checkpointIntervalMs: 0 });
    finalizer.watch({ principalId: "owner", conversationId: "chat", message: { ...message } });
    await until(() => finalizer.activeCount() === 0, "the failed watch ends");
    assert.equal(message.runStatus, "running");
    assert.equal(settles, 1);
    assert.equal(error.mock.callCount(), 1);
    finalizer.watch({ principalId: "owner", conversationId: "chat", message: { ...message } });
    await until(() => finalizer.activeCount() === 0, "the later watch ends");
    assert.equal(message.runStatus, "succeeded");
    assert.equal(message.content, "Done");
  });
}

// ---- Public surface (C15): edited only in the commits the design lists -----------------------

test("C15a the run-time exports of the finalizer module and of the daemon HTTP client module", async () => {
  const finalizerModule = await import("../runtime/composition/modules/assistant-run-finalizer.js");
  assert.deepEqual(Object.keys(finalizerModule).sort(), ["assistantRunFinalizerFor", "createAssistantRunFinalizer"]);
  const clientModule = await import("../runtime/composition/modules/run-daemon-http-client.js");
  assert.deepEqual(Object.keys(clientModule).sort(), ["createHttpRunDaemonClient"]);
});

test("C15b the finalizer object has exactly five methods", () => {
  const finalizer = createAssistantRunFinalizer({ ledger: recordingLedger().ledger, daemon: scriptedDaemon({ open: () => missing() }).daemon });
  assert.deepEqual(Object.keys(finalizer).sort(), ["activeCount", "idle", "reconcileInterrupted", "recover", "watch"]);
});

// C15c: the type contract, checked by `npm run typecheck:tests`.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const finalizerKeys: Same<keyof AssistantRunFinalizer, "activeCount" | "idle" | "reconcileInterrupted" | "recover" | "watch"> = true;
const daemonKeys: Same<keyof RunDaemonClient, "cancel" | "launch" | "openEvents" | "release" | "runStatus"> = true;
void finalizerKeys;
void daemonKeys;

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createChatRunLedger, createChatStoreFactory, type ChatRunLedger } from "#src/assistant/index";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import { createAssistantRunFinalizer, type RunDaemonClient } from "../runtime/composition/modules/assistant-run-finalizer.js";
import { deferred, end, ended, flush, liveStream, manualScheduler, missing, text, until, type Deferred } from "./run-finalizer-characterization.fixture.js";

/**
 * @file Phase 0, C11-H, C12, C14, C18: the API process DIES at a named step (run-finalizer design
 * 2026-11-16, sections 5.2 and 7). Death is not a rejected promise: after `halt()` no later line
 * of finalizer 1 runs. Its port calls never settle, a call in flight either never reached the
 * real store ("before") or completed there unobserved ("after"), its scheduler callbacks are
 * dropped and its open streams are closed from the daemon side. Finalizer 2 is then built on the
 * same real chat database and runs boot repair. The real database is used on purpose: the guards
 * that make a restart safe live in it.
 */

const T = 1_790_000_000_000;
const principal = { kind: "user" as const, workspaceId: "ws", userId: "admin" };
const never = <V>() => new Promise<V>(() => undefined);

/** Wraps the ports of the process that is going to die. */
function crashHarness(crash: { op: string; when: "before" | "after" } | undefined) {
  const state = { halted: false, callsAfterHalt: [] as string[] };
  const closers: Array<() => void> = [];
  const halt = () => { state.halted = true; for (const close of closers) close(); };
  function wrap<P extends object>(port: P, name: string): P {
    return new Proxy(port, { get(target, key, receiver) {
      const member: unknown = Reflect.get(target, key, receiver);
      if (typeof member !== "function") return member;
      const op = `${name}.${String(key)}`;
      return async (...args: unknown[]) => {
        if (state.halted) { state.callsAfterHalt.push(op); return never(); }
        if (crash?.op === op && crash.when === "before") { halt(); return never(); }
        const result: unknown = await Reflect.apply(member, target, args);
        if (crash?.op === op && crash.when === "after") halt();
        return state.halted ? never() : result;
      };
    } });
  }
  return { state, wrap, halt, onHalt: (close: () => void) => { closers.push(close); } };
}

async function acceptedRun(optional: { chats?: string[] } = {}) {
  const db = openChatDb(":memory:");
  const ledger = createChatRunLedger({ store: db });
  const history = createChatStoreFactory({ store: db })(principal);
  const runs = [];
  for (const [index, chat] of (optional.chats ?? ["chat"]).entries()) {
    await history.create({ id: chat });
    const suffix = optional.chats ? `-${index + 1}` : "";
    runs.push((await ledger.durable!.accept({ principalId: "admin", workspaceId: "ws", conversationId: chat, messageId: `answer${suffix}`, runId: `old${suffix}`, now: T,
      request: { agentId: "opencode", contextRef: JSON.stringify({ prompt: "Write it", conversationId: chat, assistantMessageId: `answer${suffix}` }) } }, {}))!);
  }
  const saved = async (chat = "chat") => (await history.messages({ conversationId: chat }))[0]!;
  return { db, ledger, history, runs, saved };
}

interface CrashPoint {
  readonly name: string;
  readonly crash?: { op: string; when: "before" | "after" };
  /** What process 1 is doing when it dies. */
  readonly drive: "frame" | "stream-end" | "recover" | "cancel";
  /** Whether the daemon outlived the API process. */
  readonly daemon: "alive" | "gone";
  readonly bootAt?: number;
  readonly atHalt: { content: string };
  readonly after: { status: string; launches: number; sameAttempt: boolean; contentStartsWith: string; watching?: number };
}

const points: CrashPoint[] = [
  { name: "S: before the terminal write commits, daemon still has the run", crash: { op: "ledger.settle", when: "before" }, drive: "stream-end", daemon: "alive",
    atHalt: { content: "Saved partial" }, after: { status: "succeeded", launches: 0, sameAttempt: true, contentStartsWith: "Saved partial and finished" } },
  { name: "S: before the terminal write commits, daemon gone too: one new attempt for a run that had finished (C12, pins F3)",
    crash: { op: "ledger.settle", when: "before" }, drive: "stream-end", daemon: "gone",
    atHalt: { content: "Saved partial" }, after: { status: "succeeded", launches: 1, sameAttempt: false, contentStartsWith: "Saved partial" } },
  { name: "S: after the terminal write commits", crash: { op: "ledger.settle", when: "after" }, drive: "stream-end", daemon: "gone",
    atHalt: { content: "Saved partial" }, after: { status: "succeeded", launches: 0, sameAttempt: true, contentStartsWith: "Saved partial" } },
  { name: "K: before a checkpoint commits", crash: { op: "ledger.checkpoint", when: "before" }, drive: "frame", daemon: "alive",
    atHalt: { content: "" }, after: { status: "succeeded", launches: 0, sameAttempt: true, contentStartsWith: "Saved partial and finished" } },
  { name: "K: after a checkpoint commits", crash: { op: "ledger.checkpoint", when: "after" }, drive: "frame", daemon: "alive",
    atHalt: { content: "Saved partial" }, after: { status: "succeeded", launches: 0, sameAttempt: true, contentStartsWith: "Saved partial and finished" } },
  { name: "D: after the attempt CAS, before launch; boot inside the launch grace waits and launches nothing",
    crash: { op: "durable.advance", when: "after" }, drive: "recover", daemon: "gone", bootAt: T + 25_000,
    atHalt: { content: "" }, after: { status: "running", launches: 0, sameAttempt: false, contentStartsWith: "", watching: 1 } },
  { name: "D: after launch, before attach", crash: { op: "daemon.launch", when: "after" }, drive: "recover", daemon: "alive",
    atHalt: { content: "" }, after: { status: "succeeded", launches: 0, sameAttempt: false, contentStartsWith: "Saved partial and finished" } },
  { name: "X: after the cancel was recorded, before recovery ran", drive: "cancel", daemon: "alive",
    atHalt: { content: "" }, after: { status: "canceled", launches: 0, sameAttempt: true, contentStartsWith: "" } },
];

/** Process 1: wrapped ports, driven up to the crash point. */
async function runUntilDeath(point: CrashPoint, store: Awaited<ReturnType<typeof acceptedRun>>) {
  const harness = crashHarness(point.crash);
  const stream = liveStream();
  const timers = manualScheduler();
  harness.onHalt(() => { timers.drop(); stream.close(); });
  const daemon = harness.wrap<RunDaemonClient>({
    openEvents: async () => stream.response,
    runStatus: async () => point.drive === "recover" ? 404 : 200,
    launch: async () => undefined, cancel: async () => undefined,
  }, "daemon");
  const ledger: ChatRunLedger = { ...harness.wrap(store.ledger, "ledger"), durable: harness.wrap(store.ledger.durable!, "durable") };
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, scheduler: timers.scheduler, now: () => T + 20_000, checkpointIntervalMs: 0, reconnectDelayMs: 50 });
  const run = store.runs[0]!;
  if (point.drive === "recover") void finalizer.recover({ messageId: "answer", trigger: "browser" }, {});
  if (point.drive === "cancel") { await store.ledger.durable!.cancel({ runId: run.runId, reason: "user" }, {}); harness.halt(); }
  if (point.drive === "frame" || point.drive === "stream-end") {
    finalizer.watch({ principalId: "admin", conversationId: "chat", message: run.message });
    stream.push(text(run.runId, "Saved partial"));
  }
  if (point.drive === "stream-end") {
    await until(() => !harness.state.halted, "process 1 is alive");
    for (let turn = 0; turn < 400 && (await store.saved()).content !== "Saved partial"; turn++) await flush(1);
    stream.push(end(run.runId));
  }
  await until(() => harness.state.halted, `process 1 dies at ${point.crash?.op ?? "the cancel"}`);
  return harness;
}

for (const point of points) {
  test(`C11-H ${point.name}`, async (t: TestContext) => {
    t.mock.method(console, "info", () => undefined);
    const store = await acceptedRun();
    try {
      const dead = await runUntilDeath(point, store);
      const atHalt = await store.saved();
      assert.equal(atHalt.content, point.atHalt.content);
      await flush(20); // everything process 1 still had queued runs into halted ports
      assert.deepEqual(await store.saved(), atHalt, `calls after death: ${dead.state.callsAfterHalt.join(", ")}`);

      const launches: string[] = [];
      const daemon: RunDaemonClient = {
        runStatus: async ({ runId }) => point.daemon === "alive" || launches.includes(runId) ? 200 : 404,
        openEvents: async ({ runId }) => point.daemon === "alive" || launches.includes(runId)
          ? ended(text(runId, "Saved partial and finished"), end(runId)) : missing(),
        launch: async ({ run }) => { launches.push(run.runId); }, cancel: async () => undefined,
      };
      const second = createAssistantRunFinalizer({
        ledger: store.ledger, daemon, scheduler: manualScheduler().scheduler, now: () => point.bootAt ?? T + 20_000,
        checkpointIntervalMs: 0, reconnectDelayMs: 50,
      });
      await second.reconcileInterrupted({}, {});
      await until(() => second.activeCount() === (point.after.watching ?? 0), "boot repair finishes");
      await flush(20);
      const messages = await store.history.messages({ conversationId: "chat" });
      assert.equal(messages.length, 1);
      const saved = messages[0]!;
      assert.equal(saved.id, "answer");
      assert.equal(saved.runStatus, point.after.status);
      assert.equal(launches.length, point.after.launches);
      assert.equal(saved.runId === "old", point.after.sameAttempt);
      assert.equal(saved.content.startsWith(point.after.contentStartsWith), true, saved.content);
      assert.equal(second.activeCount(), point.after.watching ?? 0);
    } finally { store.db.close(); }
  });
}

test("C14 boot repair handles one unfinished row at a time, in message-id order, and resolves after the last", async (t) => {
  t.mock.method(console, "info", () => undefined);
  const store = await acceptedRun({ chats: ["chat-1", "chat-2", "chat-3"] });
  try {
    const gates = new Map<string, Deferred<void>>(store.runs.map((run) => [run.runId, deferred<void>()]));
    const probes = { order: [] as string[], inFlight: 0, most: 0 };
    const daemon: RunDaemonClient = {
      runStatus: async ({ runId }) => {
        probes.order.push(runId);
        probes.most = Math.max(probes.most, ++probes.inFlight);
        await gates.get(runId)!.promise;
        probes.inFlight -= 1;
        return 200;
      },
      openEvents: async ({ runId }) => ended(end(runId)),
    };
    const finalizer = createAssistantRunFinalizer({ ledger: store.ledger, daemon, scheduler: manualScheduler().scheduler, now: () => T + 1_000 });
    let reconciled: number | undefined;
    void finalizer.reconcileInterrupted({}, {}).then((count) => { reconciled = count; });
    for (const [index, run] of store.runs.entries()) {
      await until(() => probes.order.length === index + 1, `row ${index + 1} is probed`);
      await flush(20);
      assert.deepEqual(probes.order, store.runs.slice(0, index + 1).map((each) => each.runId));
      assert.equal(reconciled, undefined);
      gates.get(run.runId)!.resolve();
    }
    await until(() => reconciled !== undefined, "boot repair resolves");
    assert.equal(reconciled, 3);
    assert.equal(probes.most, 1);
    await finalizer.idle();
  } finally { store.db.close(); }
});

test("C18 boot repair waits without bound for a continuation launch that never answers", async (t) => {
  t.mock.method(console, "info", () => undefined);
  const store = await acceptedRun();
  try {
    let launches = 0;
    const timers = manualScheduler();
    const finalizer = createAssistantRunFinalizer({
      ledger: store.ledger, scheduler: timers.scheduler, now: () => T + 20_000,
      daemon: { runStatus: async () => 404, openEvents: async () => missing(), cancel: async () => undefined,
        launch: () => { launches += 1; return never<void>(); } },
    });
    let settled = false;
    void finalizer.reconcileInterrupted({}, {}).then(() => { settled = true; });
    await until(() => launches === 1, "the continuation launch starts");
    for (let round = 0; round < 5; round++) { timers.fireAll(); await flush(20); }
    // Today no engine deadline covers the launch call, so chat routes wait as long as it does.
    assert.equal(settled, false);
    assert.equal(launches, 1);
  } finally { store.db.close(); }
});

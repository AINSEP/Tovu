import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import test from "node:test";

import { routineUserTurnId } from "@tovu/contracts/routines";

import { createAssistantChatsModule } from "../assistant-chats.js";
import { createRoutineRecoveryAdmission, ROUTINE_INTERRUPTED_REASON } from "../routine-recovery-admission.js";
import { createAssistantRunFinalizer } from "../run-finalizer/entry.js";

/**
 * @file Boot-repair admission. The invariant under test: a routine turn is recorded as stopped and is
 * NEVER handed to generic recovery (which would re-run an unattended job), decided only from the
 * trusted marker in the durable accepted request and only after owner/workspace/conversation/message
 * all match; every other turn keeps today's recovery behavior.
 */

const MARKER = { routineId: "r1", runId: "run1", catchUp: false, slotAt: null };
const durableRun = (patch: Record<string, unknown> = {}, routine: unknown = MARKER) => ({ runId: "attempt-1", messageId: "m1", conversationId: "routine-run1",
  principalId: "owner-1", workspaceId: "ws-1", request: { contextRef: JSON.stringify({ prompt: "p", ...(routine === "none" ? {} : { routine }) }) }, ...patch });
// A crash after acceptance but before the attempt id was saved leaves the stub without `runId`.
const turn = (patch: Record<string, unknown> = {}) => ({ principalId: "owner-1", conversationId: "routine-run1", message: { id: "m1", role: "assistant", content: "", runStatus: "running" }, ...patch }) as never;

// The routine handler persists the user turn under an id minted from this run and slot.
const userTurn = (marker: { runId: string; slotAt: number | null } = MARKER) => ({ id: routineUserTurnId({ marker }, {}), role: "user" });
type Turns = ReadonlyArray<{ id: string; role: string }>;

function admission(run: unknown, turns: Turns = [userTurn(), { id: "m1", role: "assistant" }]) {
  const cancels: Array<[unknown, unknown]> = [];
  const logs: string[] = [];
  const reads: unknown[] = [];
  const admit = createRoutineRecoveryAdmission({ store: { load: async () => run as never }, workspaceId: "ws-1",
    persistedTurns: async (required) => { reads.push(required); return turns; },
    cancel: async (required, optional) => { cancels.push([required, optional]); }, log: ({ event }) => { logs.push(event); } }, {});
  return { admit, cancels, logs, reads };
}

test("interrupted after quit is recorded, not re-run", async () => {
  const h = admission(durableRun());
  assert.equal(await h.admit({ turn: turn() }), "leave-owned");
  assert.deepEqual(h.cancels, [[{ principalId: "owner-1", workspaceId: "ws-1", conversationId: "routine-run1", messageId: "m1" }, { reason: ROUTINE_INTERRUPTED_REASON }]]);
});

test("a cancellation that fails still reserves the turn from generic recovery", async () => {
  const logs: string[] = [];
  const admit = createRoutineRecoveryAdmission({ store: { load: async () => durableRun() as never }, workspaceId: "ws-1",
    persistedTurns: async () => [userTurn()],
    cancel: async () => { throw new Error("db busy"); }, log: ({ event }) => { logs.push(event); } }, {});
  assert.equal(await admit({ turn: turn() }), "leave-owned");
  assert.deepEqual(logs, ["routine-interrupt-cancel-failed"]);
});

test("an ordinary chat turn (no marker) is recovered and nothing is cancelled", async () => {
  const h = admission(durableRun({}, "none"));
  assert.equal(await h.admit({ turn: turn({ conversationId: "routine-run1" }) }), "recover");
  assert.equal(h.cancels.length, 0);
  const missing = admission(null);
  assert.equal(await missing.admit({ turn: turn() }), "recover");
});

test("a forged or mismatched marker is not trusted: wrong owner, workspace, conversation, message or marker shape", async () => {
  for (const [name, run, t] of [
    ["owner", durableRun({ principalId: "someone-else" }), turn()],
    ["workspace", durableRun({ workspaceId: "ws-2" }), turn()],
    ["conversation", durableRun({ conversationId: "other-chat" }), turn({ conversationId: "other-chat" })],
    ["turn conversation", durableRun(), turn({ conversationId: "other-chat" })],
    ["message", durableRun({ messageId: "m2" }), turn()],
    ["marker's own run", durableRun({}, { ...MARKER, runId: "run2" }), turn()],
    ["extra key", durableRun({}, { ...MARKER, extra: 1 }), turn()],
    ["bad type", durableRun({}, { ...MARKER, catchUp: "yes" }), turn()],
    ["null principal", durableRun(), turn({ principalId: null })],
  ] as const) {
    const h = admission(run);
    assert.equal(await h.admit({ turn: t }), "recover", name);
    assert.equal(h.cancels.length, 0, name);
  }
});

test("the durable envelope alone is not enough: the persisted user turn must carry the same run and slot", async () => {
  const ok = admission(durableRun());
  assert.equal(await ok.admit({ turn: turn() }), "leave-owned");
  assert.deepEqual(ok.reads, [{ principalId: "owner-1", conversationId: "routine-run1" }]);
  for (const [name, turns] of [
    ["no persisted user turn", [{ id: "m1", role: "assistant" }]],
    ["user turn from another run", [userTurn({ runId: "run2", slotAt: null })]],
    ["user turn from another slot", [userTurn({ runId: "run1", slotAt: 5_000 })]],
    ["marker id on a non-user turn", [{ id: routineUserTurnId({ marker: MARKER }, {}), role: "assistant" }]],
    ["ordinary browser-minted user turn", [{ id: "u-123", role: "user" }]],
  ] as const) {
    const h = admission(durableRun(), turns);
    assert.equal(await h.admit({ turn: turn() }), "recover", name);
    assert.equal(h.cancels.length, 0, name);
  }
  const slotted = admission(durableRun({}, { ...MARKER, catchUp: true, slotAt: 5_000 }), [userTurn({ runId: "run1", slotAt: 5_000 })]);
  assert.equal(await slotted.admit({ turn: turn() }), "leave-owned");
});

/** A ledger that behaves like Jini's: consult admission first, recover only what is admitted. */
function ledgerWith(run: unknown, turns: unknown[]) {
  const seen = { recovered: [] as string[], cancelled: [] as unknown[] };
  const durable = { load: async () => run, head: async () => run, cancel: async (input: unknown) => { seen.cancelled.push(input); } };
  const ledger = { durable, reconcileInterrupted: async (_required: unknown, options: { admit?: (r: { turn: unknown }) => Promise<string>; recover?: (t: never) => Promise<boolean> }) => {
    for (const t of turns) {
      if (options.admit && (await options.admit({ turn: t })) === "leave-owned") continue;
      seen.recovered.push((t as { message: { id: string } }).message.id);
    }
    return seen.recovered.length;
  } };
  return { ledger, seen };
}
/** The owner-scoped chat store the module reads the persisted user turn from. */
function historyWith(turns: Turns = [userTurn()]) {
  const scopes: unknown[] = [];
  return { scopes, factory: (scope: unknown) => { scopes.push(scope); return { messages: async () => turns }; } };
}
const fakeApp = () => new Proxy({}, { get: () => () => fakeApp() }) as never;

test("web-only boot leaves a routine turn unrecovered", async (t) => {
  t.mock.method(console, "log", () => {});
  const { ledger, seen } = ledgerWith(durableRun(), [turn()]);
  const history = historyWith();
  // No routine host option at all: admission still protects the turn because it reads the durable marker.
  const handle = createAssistantChatsModule({ workspaceId: "ws-1", chatRunLedger: ledger, chatHistory: history.factory } as never, { recoverInterrupted: true, onBootWork: ({ work }) => { void work; } });
  const work: Promise<void>[] = [];
  createAssistantChatsModule({ workspaceId: "ws-1", chatRunLedger: ledger, chatHistory: history.factory } as never, { recoverInterrupted: true, onBootWork: ({ work: w }) => { work.push(w); } }).registerRoutes!({ errors: createRouteIncidentReporter().errors, app: fakeApp() });
  await work[0];
  void handle;
  assert.deepEqual(seen.recovered, []);
  assert.deepEqual(history.scopes, [{ kind: "user", workspaceId: "ws-1", userId: "owner-1" }]);
  assert.deepEqual(seen.cancelled, [{ runId: "attempt-1", reason: ROUTINE_INTERRUPTED_REASON }]);
});

test("ordinary repair with no routine is unchanged: the turn is recovered", async (t) => {
  t.mock.method(console, "log", () => {});
  const { ledger, seen } = ledgerWith(durableRun({}, "none"), [turn()]);
  const history = historyWith();
  const work: Promise<void>[] = [];
  createAssistantChatsModule({ workspaceId: "ws-1", chatRunLedger: ledger, chatHistory: history.factory } as never, { recoverInterrupted: true, onBootWork: ({ work: w }) => { work.push(w); } }).registerRoutes!({ errors: createRouteIncidentReporter().errors, app: fakeApp() });
  await work[0];
  assert.deepEqual(seen.recovered, ["m1"]);
  assert.deepEqual(seen.cancelled, []);
});

test("the finalizer forwards admit beside recover", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const admit = async () => "leave-owned" as const;
  const finalizer = createAssistantRunFinalizer({ ledger: { reconcileInterrupted: async (_r: unknown, o: Record<string, unknown>) => { captured.push(o); return 0; } } as never, admit }, {});
  await finalizer.reconcileInterrupted({}, {});
  assert.equal(captured[0]!.admit, admit);
  assert.equal(typeof captured[0]!.recover, "function");
  const plain = createAssistantRunFinalizer({ ledger: { reconcileInterrupted: async (_r: unknown, o: Record<string, unknown>) => { captured.push(o); return 0; } } as never }, {});
  await plain.reconcileInterrupted({}, {});
  assert.equal("admit" in captured[1]!, false);
});

test("only the current lease owner waits for the routine boot barrier; a passive boot never does", async (t) => {
  t.mock.method(console, "log", () => {});
  for (const [owner, expectWait] of [[true, true], [false, false]] as const) {
    const { ledger, seen } = ledgerWith(durableRun({}, "none"), [turn()]);
  const history = historyWith();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const work: Promise<void>[] = [];
    createAssistantChatsModule({ workspaceId: "ws-1", chatRunLedger: ledger, chatHistory: history.factory } as never, { recoverInterrupted: true,
      routineBoot: { isLeaseOwner: () => owner, whenInterrupted: () => barrier }, onBootWork: ({ work: w }) => { work.push(w); } }).registerRoutes!({ errors: createRouteIncidentReporter().errors, app: fakeApp() });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(seen.recovered.length === 0, expectWait, owner ? "owner waits for the barrier" : "passive boot repairs immediately");
    release();
    await work[0];
    assert.deepEqual(seen.recovered, ["m1"]);
  }
});

test("a corrupt durable envelope falls through to ordinary recovery without reading or cancelling a routine", async () => {
  for (const contextRef of ["{broken", "null"]) {
    const h = admission(durableRun({ request: { contextRef } }));
    assert.equal(await h.admit({ turn: turn() }), "recover", contextRef);
    assert.deepEqual(h.reads, [], contextRef);
    assert.deepEqual(h.cancels, [], contextRef);
  }
});

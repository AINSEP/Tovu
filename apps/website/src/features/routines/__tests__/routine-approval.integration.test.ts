import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmission, SurfaceEmitter, ToolExecutionContext } from "@jini-ai/core";
import { createInMemoryRoutineStore } from "@jini-ai/daemon";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { requireHumanConfirm } from "#src/contracts/core/human-confirm";
import { type HumanConfirmSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { createRoutineApprovalObserver, type ReadRunEvents } from "../routine-approval-observer.js";

/**
 * @file P3-T3.T end to end in one process: the REAL Jini surface exchange (leased emitter), the REAL
 * `requireHumanConfirm`, and an in-memory routine store. The observer only projects what the owner
 * said onto the run row; every answer still arrives through the exchange's own `deliver`, and the
 * fake tool's effect runs only after `requireHumanConfirm` returns confirmed.
 */

const OWNER = "owner";
const TRACKED = { routineRunId: "rr-1", agentRunId: "run-1", messageId: "m-1", principalId: OWNER, workspaceId: "ws-1" };
const flush = async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

function harness({ leased = true, tracked = true, toolId = "routine_delete", readRunEvents = async () => [], maxTracked }: {
  leased?: boolean; tracked?: boolean; toolId?: string; readRunEvents?: ReadRunEvents; maxTracked?: number;
} = {}) {
  let nextId = 0;
  const exchanges = createSurfaceExchangeStore({ scheduler: { schedule: () => () => {} }, clock: { nowMs: () => 0 },
    idGenerator: { newId: () => `card-${++nextId}` }, defaultChannel: "mcp-ui" });
  const delivered: unknown[] = [];
  const deliver = exchanges.deliver.bind(exchanges);
  exchanges.deliver = (required, optional) => { delivered.push(required); return deliver(required, optional); };
  const routines = createInMemoryRoutineStore({});
  routines.recordRun({ run: { id: "rr-1", routineId: "r1", status: "running", startedAt: 0, approvalState: "none", approvalRef: null, approvalSince: null } as never });
  const logged: unknown[] = [];
  const observer = createRoutineApprovalObserver({ persistence: routines, now: () => 1000, readRunEvents, policy: { workspaceId: "ws-1" } },
    { log: (entry) => { logged.push(entry); }, ...(maxTracked === undefined ? {} : { maxTracked }) });
  if (tracked) observer.track(TRACKED);
  const abort = new AbortController();
  const cards: SurfaceEmission[] = [];
  let retries = 0;
  const base = async (emission: SurfaceEmission) => { cards.push(emission); };
  const emit: SurfaceEmitter = leased ? Object.assign(base, { exchangeLifetime: { signal: abort.signal, runId: "run-1", toolId, principalId: OWNER,
    retry: async () => { retries += 1; } } }) : base;
  const grant = { revoked: false };
  const surfaces: HumanConfirmSurfaceDeps = { surfaceExchanges: exchanges, approvalReceiptsFor: ({ ctx }) => observer.bindingFor({ ctx }),
    assertChatDeleteAllowed: async () => { if (grant.revoked) throw new Error("Permanent deletes from chat were turned off."); } };
  const ctx = { executionId: "x-1", principal: { id: OWNER }, run: { id: "run-1" }, input: {}, signal: abort.signal } as ToolExecutionContext;
  const data = { rows: 3 };
  let effects = 0;
  const spec = { toolId, errorCode: "ROUTINE_DELETE", title: "Delete this?", details: [], confirmLabel: "Delete" } as never;
  /** The tool: ask through the existing card, and change data only on a confirmed answer. */
  const call = () => requireHumanConfirm({ ctx, surfaces, spec }, { emitSurface: emit }).then((outcome) => {
    if (outcome.confirmed) { effects += 1; data.rows -= 1; }
    return outcome;
  });
  const row = async () => (await routines.listRuns({ routineId: "r1" })).items[0]!;
  const lastExchangeId = () => `card-${nextId}`;
  return { exchanges, delivered, routines, observer, abort, cards, emit, grant, data, call, row, lastExchangeId, logged,
    effects: () => effects, retries: () => retries, answer: (decision: string, principalId = OWNER, exchangeId = lastExchangeId()) =>
      exchanges.deliver({ exchangeId, principalId, params: { surfaceExchangeId: exchangeId, decision } }) };
}

test("observer never invokes the tool or delivers an answer", async () => {
  const h = harness();
  let settled = false;
  void h.call().then(() => { settled = true; });
  await flush();
  assert.equal(h.cards.length, 1);
  assert.deepEqual(h.delivered, []);
  assert.equal(settled, false);
  assert.equal(h.effects(), 0);
  assert.equal(Object.keys(h.observer).some((key) => /deliver|answer|restore|execute/i.test(key)), false);
});

test("with zero tabs the run waits and shows waitingForApproval", async () => {
  const h = harness();
  void h.call();
  await flush();
  const run = await h.row();
  assert.deepEqual([run.approvalState, run.approvalRef, run.approvalSince], ["waiting", "card-1", 1000]);
  assert.equal(h.effects(), 0);
});

test("opening the conversation and approving runs the effect exactly once", async () => {
  const h = harness();
  const pending = h.call();
  await flush();
  assert.deepEqual(h.answer("confirm"), { ok: true });
  assert.deepEqual(await pending, { confirmed: true });
  assert.equal(h.answer("confirm").ok, false);
  await flush();
  assert.equal(h.effects(), 1);
  assert.equal((await h.row()).approvalState, "approved");
});

test("decline leaves data unchanged", async () => {
  const h = harness();
  const pending = h.call();
  await flush();
  h.answer("cancel");
  assert.deepEqual(await pending, { confirmed: false, reason: "declined" });
  await flush();
  assert.deepEqual([h.data.rows, h.effects(), (await h.row()).approvalState], [3, 0, "declined"]);
});

test("another owner cannot answer", async () => {
  const h = harness();
  const pending = h.call();
  await flush();
  assert.equal(h.answer("confirm", "intruder").ok, false);
  await flush();
  assert.deepEqual([(await h.row()).approvalState, h.effects()], ["waiting", 0]);
  h.answer("cancel");
  await pending;
});

test("an unrelated tool result does not clear waiting", async () => {
  const h = harness();
  void h.call();
  await flush();
  const base = { runId: "run-1", messageId: "m-1", principalId: OWNER, workspaceId: "ws-1" };
  await h.observer.observe({ ...base, events: [{ type: "tool_result", toolId: "pages_list", result: { confirmed: true } }, "yes, go ahead",
    { kind: "answered", confirmed: true }, { exchangeId: "card-1", kind: "answered" }] });
  await h.observer.observe({ ...base, principalId: "intruder", events: [{ exchangeId: "card-1", kind: "answered", confirmed: true }] });
  await h.observer.observe({ ...base, messageId: "m-other", events: [{ exchangeId: "card-1", kind: "answered", confirmed: true }] });
  h.observer.onReceipt({ receipt: { exchangeId: "card-1", kind: "answered", confirmed: true }, runId: "run-2", principalId: OWNER }, {});
  await flush();
  assert.deepEqual([(await h.row()).approvalState, (await h.row()).approvalRef], ["waiting", "card-1"]);
});

test("quit → interrupted", async () => {
  const h = harness();
  const pending = h.call();
  await flush();
  h.abort.abort();
  assert.deepEqual(await pending, { confirmed: false, reason: "abandoned" });
  await h.observer.untrack({ agentRunId: "run-1" });
  h.routines.patchRun({ id: "rr-1", patch: { status: "interrupted" } as never });
  await flush();
  assert.deepEqual([(await h.row()).approvalState, h.effects()], ["expired", 0]);
});

test("settlement expires a still-waiting approval through untrack", async () => {
  const h = harness();
  void h.call();
  await flush();
  await h.observer.untrack({ agentRunId: "run-1" });
  assert.equal((await h.row()).approvalState, "expired");
});

test("duplicate receipts are idempotent and a terminal answer wins over a replayed open", async () => {
  const h = harness();
  const pending = h.call();
  await flush();
  h.answer("confirm");
  await pending;
  const receipt = (kind: "open" | "answered") => h.observer.onReceipt({ receipt: kind === "open" ? { exchangeId: "card-1", kind } : { exchangeId: "card-1", kind, confirmed: false },
    runId: "run-1", principalId: OWNER }, {});
  receipt("answered"); receipt("open"); receipt("open");
  await flush();
  assert.deepEqual([(await h.row()).approvalState, h.effects()], ["approved", 1]);
});

test("overlapping exchanges: an older exchange's answer cannot clear the newer waiting ref", async () => {
  const h = harness();
  const first = h.call();
  await flush();
  const second = h.call();
  await flush();
  assert.equal((await h.row()).approvalRef, "card-2");
  h.answer("confirm", OWNER, "card-1");
  await first;
  await flush();
  assert.deepEqual([(await h.row()).approvalState, (await h.row()).approvalRef], ["waiting", "card-2"]);
  h.answer("cancel", OWNER, "card-2");
  await second;
  await flush();
  assert.equal((await h.row()).approvalState, "declined");
});

test("owner revocation after the affirmative receipt refuses the effect; the row still says the owner said yes", async () => {
  const h = harness({ toolId: "trash_empty" });
  const pending = h.call();
  await flush();
  h.grant.revoked = true;
  h.answer("confirm");
  await assert.rejects(pending, /turned off/);
  await flush();
  assert.deepEqual([h.effects(), h.data.rows, (await h.row()).approvalState], [0, 3, "approved"]);
});

test("a closed routine invocation is not restored or retried after a late answer", async () => {
  const h = harness();
  const pending = h.call();
  await flush();
  h.abort.abort();
  await pending;
  const tab: SurfaceEmitter = async () => {};
  const late = await h.exchanges.restore!({ exchangeId: "card-1", principalId: OWNER, emit: tab }, { params: { decision: "confirm" } });
  assert.equal(late.ok, false);
  assert.deepEqual([h.retries(), h.effects()], [0, 0]);
});

test("a nonroutine invocation keeps normal restoration (retry runs)", async () => {
  const h = harness({ tracked: false });
  const pending = h.call();
  await flush();
  h.abort.abort();
  await pending;
  await h.exchanges.restore!({ exchangeId: "card-1", principalId: OWNER, emit: async () => {} }, {});
  assert.equal(h.retries(), 1);
  assert.equal((await h.row()).approvalState, "none");
});

test("an unleased exchange is never projected", async () => {
  const h = harness({ leased: false });
  const pending = h.call();
  await flush();
  h.answer("confirm");
  await pending;
  await flush();
  assert.deepEqual([(await h.row()).approvalState, h.effects()], ["none", 1]);
});

test("a projection failure is logged on the observer side and never reaches the exchange", async () => {
  const h = harness();
  h.routines.setApproval = async () => { throw new Error("disk full"); };
  const pending = h.call();
  await flush();
  h.answer("confirm");
  assert.deepEqual(await pending, { confirmed: true });
  await flush();
  assert.equal(h.effects(), 1);
  assert.ok(h.logged.length >= 1);
});

test("the replay cursor advances over all events but only bound approval receipts update the stored row", async () => {
  const reads: unknown[] = [];
  const h = harness({
    readRunEvents: async input => {
      reads.push(input);
      assert.deepEqual(input, { runId: "run-1", cursor: 7 });
      return [{ kind: "tool-result" }, { kind: "open", exchangeId: "card-replayed" }];
    },
  });
  const run = { runId: "run-1", messageId: "m-1", principalId: OWNER, workspaceId: "ws-1" };
  assert.equal((await h.row()).approvalState, "none");
  assert.deepEqual(await h.observer.observe({ ...run, runId: "unknown", cursor: 7 }), { cursor: 7 });
  assert.deepEqual(reads, []);
  assert.deepEqual(await h.observer.observe({ ...run, cursor: 7 }), { cursor: 9 });
  assert.deepEqual(reads, [{ runId: "run-1", cursor: 7 }]);
  const waiting = await h.row();
  assert.deepEqual([waiting.approvalState, waiting.approvalRef, waiting.approvalSince], ["waiting", "card-replayed", 1000]);

  const events = [{ kind: "answered", exchangeId: "card-replayed", confirmed: true }];
  assert.deepEqual(await h.observer.observe({ ...run, workspaceId: "other-site", events, cursor: 9 }), { cursor: 10 });
  assert.equal((await h.row()).approvalState, "waiting");
  assert.deepEqual(await h.observer.observe({ ...run, events, cursor: 9 }), { cursor: 10 });
  assert.equal((await h.row()).approvalState, "approved");
  assert.deepEqual(reads, [{ runId: "run-1", cursor: 7 }]);
});

test("a foreign registration cannot displace the local waiting run from a full observer", async () => {
  const h = harness({ maxTracked: 1 });
  const run = { runId: "run-1", messageId: "m-1", principalId: OWNER, workspaceId: "ws-1" };
  await h.observer.observe({ ...run, events: [{ kind: "open", exchangeId: "local-card" }] });
  assert.equal((await h.row()).approvalRef, "local-card");

  h.observer.track({ ...TRACKED, workspaceId: "other-site", agentRunId: "other-run", messageId: "other-turn" });
  const binding = (id: string) => h.observer.bindingFor({ ctx: { run: { id }, principal: { id: OWNER } } });
  assert.equal(binding("other-run"), undefined);
  assert.equal(binding("run-1")?.restorable, false);

  await h.observer.observe({ ...run, events: [{ kind: "answered", exchangeId: "local-card", confirmed: false }] });
  assert.equal((await h.row()).approvalState, "declined");
});

test("evicting the oldest tracked run expires its pending approval and ignores a subsequent open", async () => {
  const h = harness({ maxTracked: 1 });
  const run = { runId: "run-1", messageId: "m-1", principalId: OWNER, workspaceId: "ws-1" };
  await h.observer.observe({ ...run, events: [{ kind: "open", exchangeId: "old-card" }] });
  const waiting = await h.row();
  assert.deepEqual([waiting.approvalState, waiting.approvalRef], ["waiting", "old-card"]);
  h.observer.track({ ...TRACKED, routineRunId: "rr-2", agentRunId: "run-2", messageId: "m-2" });

  assert.deepEqual(await h.observer.observe({ ...run, events: [{ kind: "open", exchangeId: "late" }] }), { cursor: 0 });
  await flush();
  assert.equal((await h.row()).approvalState, "expired");
  assert.equal(h.observer.bindingFor({ ctx: { run: { id: "run-2" }, principal: { id: OWNER } } })?.restorable, false);
});

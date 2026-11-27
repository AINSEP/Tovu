import assert from "node:assert/strict";
import test from "node:test";

import type { RoutineRun } from "@jini-ai/daemon";
import { CODEX_ROUTINE_REFUSAL, chooseRoutineAgent, collapseSummary, createRoutineRunHandler, type RoutineRunHandlerRequired } from "../routine-run-handler.js";

/**
 * @file The routine run handler against fakes: the acceptance seam, chat history, the agent list and
 * the owner resolver. Each test asserts what crossed the seam (who, which ids, which agent) because
 * the handler's whole job is deciding that and delegating; it never executes anything itself.
 */

const OWNER = { principalId: "owner-1", workspaceId: "ws-1" };
const CLAUDE = { id: "claude", name: "Claude Code", available: true, authStatus: "ok", models: [{ id: "sonnet", label: "Sonnet" }] };
const CODEX = { id: "codex", name: "Codex", available: true, authStatus: "ok", models: [{ id: "gpt", label: "GPT" }] };

const routine = (patch: Record<string, unknown> = {}) => ({ id: "r1", name: "Morning digest", prompt: "Summarise the week", schedule: { kind: "hourly", minute: 0 },
  target: { mode: "create_each_run" }, skillId: null, agentId: null, context: {}, enabled: true, nextRunAt: null, lastRun: null, createdAt: 0, updatedAt: 0,
  revision: 1, creatorId: "owner-1", model: null, ...patch }) as never;

function harness(options: { agents?: unknown[]; owner?: typeof OWNER | null; allowCodex?: boolean; settle?: { status: "completed" | "failed" | "canceled"; text: string }; nullWrite?: boolean; accept?: null } = {}) {
  const calls = { agentsList: 0, owners: 0, stores: [] as unknown[], created: [] as unknown[], appended: [] as Array<{ message: Record<string, unknown> }>, deleted: [] as string[],
    accepted: [] as Array<{ required: Record<string, unknown>; optional: Record<string, unknown> }>, watched: [] as unknown[], updates: [] as unknown[] };
  const store = {
    create: async (input: unknown) => { calls.created.push(input); return input; },
    appendMessage: async (input: { message: Record<string, unknown> }) => { calls.appended.push(input); return options.nullWrite ? null : input.message; },
    delete: async ({ id }: { id: string }) => { calls.deleted.push(id); },
  };
  const deps: RoutineRunHandlerRequired = {
    owners: { resolveCurrentOwner: async () => { calls.owners += 1; return options.owner === undefined ? OWNER : options.owner; } },
    agents: { list: async () => { calls.agentsList += 1; return (options.agents ?? [CLAUDE]) as never; } },
    chatHistory: ((scope: unknown) => { calls.stores.push(scope); return store; }) as never,
    runStarter: {
      acceptOwnerChatRun: async (required, optional = {}) => { calls.accepted.push({ required, optional }); return options.accept === null ? null : { runId: "agent-run-1" }; },
      watchSettlement: async (required) => { calls.watched.push(required); return options.settle ?? { status: "completed", text: "All good" }; },
    },
    updateRun: (update) => { calls.updates.push(update); },
    now: () => 1_000, newId: (() => { let n = 0; return () => `id-${++n}`; })(),
    localeTime: ({ at }) => `T${at}`, catchUpText: ({ localTime }) => `Tovu was closed or asleep at ${localTime}.`,
    agentPolicy: options.allowCodex ? { allowCodex: true } : {},
  };
  const handler = createRoutineRunHandler(deps, {});
  const row = (): RoutineRun => ({ id: "run1", routineId: "r1", trigger: "scheduled", status: "running", projectId: "", conversationId: "", agentRunId: "", startedAt: 0, completedAt: null, summary: null, error: null, errorCode: null });
  return { handler, calls, row, deps };
}

const depsOf = (h: { deps: RoutineRunHandlerRequired }): RoutineRunHandlerRequired => h.deps;

const fire = (patch: Record<string, unknown> = {}, extra: { catchUp?: boolean; slotAt?: number | null } = {}) => ({ routine: routine(patch), trigger: "scheduled" as const, startedAt: 5, runId: "run1", ...extra });

test("one principal throughout", async () => {
  const h = harness({ owner: OWNER });
  const handle = await h.handler(fire());
  await handle.prepare!(h.row());
  await handle.start!();
  const completion = await handle.completion;
  assert.deepEqual(h.calls.stores, [{ kind: "user", workspaceId: "ws-1", userId: "owner-1" }]);
  assert.equal(h.calls.accepted[0]!.required.principalId, "owner-1");
  assert.equal(h.calls.accepted[0]!.required.workspaceId, "ws-1");
  assert.deepEqual((h.calls.watched[0] as { principalId: string }).principalId, "owner-1");
  assert.deepEqual(h.calls.accepted[0]!.optional.routine, { routineId: "r1", runId: "run1", catchUp: false, slotAt: null });
  assert.deepEqual(completion, { status: "succeeded", summary: "All good" });
});

test("the owner is re-resolved at fire time; a creator who is no longer an owner starts nothing", async () => {
  const h = harness({ owner: null });
  const handle = await h.handler(fire());
  const { prepare } = handle;
  assert.ok(prepare);
  await assert.rejects(async () => prepare(h.row()), /no longer manages this site/);
  assert.equal(h.calls.accepted.length, 0);
  assert.equal(h.calls.created.length, 0);
});

test("the result links the real conversation id", async () => {
  const h = harness();
  const handle = await h.handler(fire());
  const run = h.row();
  await handle.prepare!(run);
  await handle.start!();
  assert.equal(handle.conversationId, "routine-run1");
  assert.equal(run.conversationId, "routine-run1");
  assert.equal((h.calls.created[0] as { id: string }).id, "routine-run1");
  assert.equal(h.calls.accepted[0]!.required.conversationId, "routine-run1");
  assert.equal(h.calls.accepted[0]!.required.messageId, handle.assistantMessageId);
  assert.equal(run.assistantMessageId, handle.assistantMessageId);
  assert.equal(handle.agentRunId, "agent-run-1");
  const [user, stub] = h.calls.appended.map((entry) => entry.message);
  assert.equal(user!.role, "user");
  assert.deepEqual({ id: stub!.id, role: stub!.role, runStatus: stub!.runStatus }, { id: handle.assistantMessageId, role: "assistant", runStatus: "queued" });
});

test("claim loser starts nothing", async () => {
  const h = harness();
  const handle = await h.handler(fire());
  handle.discardUnstarted!();
  assert.deepEqual(await handle.completion, { status: "canceled" });
  assert.deepEqual({ agents: h.calls.agentsList, owners: h.calls.owners, stores: h.calls.stores.length, created: h.calls.created.length, accepted: h.calls.accepted.length, updates: h.calls.updates.length }, { agents: 0, owners: 0, stores: 0, created: 0, accepted: 0, updates: 0 });
});

test("unavailable agent or model fails with a plain reason and no substitute", async () => {
  const gone = harness({ agents: [{ ...CLAUDE, available: false }, CODEX] });
  const handle = await gone.handler(fire({ agentId: "claude" }));
  const { prepare } = handle;
  assert.ok(prepare);
  await assert.rejects(async () => prepare(gone.row()), /Claude Code" isn't available right now/);
  assert.equal(gone.calls.accepted.length, 0);
  assert.equal(gone.calls.created.length, 0);
  const noModel = harness();
  const noModelHandle = await noModel.handler(fire({ agentId: "claude", model: "opus" }));
  const { prepare: noModelPrepare } = noModelHandle;
  assert.ok(noModelPrepare);
  await assert.rejects(async () => noModelPrepare(noModel.row()), /model "opus" isn't available for Claude Code/);
  const signedOut = harness({ agents: [{ ...CLAUDE, authStatus: "missing" }] });
  const signedOutHandle = await signedOut.handler(fire({ agentId: "claude" }));
  const { prepare: signedOutPrepare } = signedOutHandle;
  assert.ok(signedOutPrepare);
  await assert.rejects(async () => signedOutPrepare(signedOut.row()), /isn't signed in/);
  const nobody = harness({ agents: [] });
  const nobodyHandle = await nobody.handler(fire());
  const { prepare: nobodyPrepare } = nobodyHandle;
  assert.ok(nobodyPrepare);
  await assert.rejects(async () => nobodyPrepare(nobody.row()), /No local assistant agent is ready/);
});

test("Claude adapter fake: the pinned agent and model cross the acceptance seam and are recorded", async () => {
  const h = harness();
  const handle = await h.handler(fire({ agentId: "claude", model: "sonnet" }));
  const run = h.row();
  await handle.prepare!(run);
  await handle.start!();
  assert.equal(h.calls.accepted[0]!.optional.agentId, "claude");
  assert.equal((h.calls.accepted[0]!.required.context as { model?: string }).model, "sonnet");
  assert.deepEqual([run.agentId, run.model], ["claude", "sonnet"]);
  assert.deepEqual(h.calls.updates[0], { id: "run1", patch: { agentId: "claude", model: "sonnet", conversationId: "routine-run1", assistantMessageId: handle.assistantMessageId } });
});

test("Codex is refused by default, explicitly or as the only agent, and allowed only with the test override", async () => {
  const refused = harness({ agents: [CODEX] });
  const refusedHandle = await refused.handler(fire({ agentId: "codex" }));
  const { prepare: refusedPrepare } = refusedHandle;
  assert.ok(refusedPrepare);
  await assert.rejects(async () => refusedPrepare(refused.row()), new Error(CODEX_ROUTINE_REFUSAL));
  assert.equal(CODEX_ROUTINE_REFUSAL, "Codex can't run routines yet. Choose another agent.");
  const onlyCodex = harness({ agents: [CODEX] });
  const onlyCodexHandle = await onlyCodex.handler(fire());
  const { prepare: onlyCodexPrepare } = onlyCodexHandle;
  assert.ok(onlyCodexPrepare);
  await assert.rejects(async () => onlyCodexPrepare(onlyCodex.row()), /No local assistant agent is ready/);
  const allowed = harness({ agents: [CODEX], allowCodex: true });
  const handle = await allowed.handler(fire({ agentId: "codex" }));
  await handle.prepare!(allowed.row());
  await handle.start!();
  assert.equal(allowed.calls.accepted[0]!.optional.agentId, "codex");
});

test("catch-up text reaches both the durable user turn and the accepted prompt", async () => {
  const h = harness();
  const handle = await h.handler(fire({}, { catchUp: true, slotAt: 777 }));
  await handle.prepare!(h.row());
  await handle.start!();
  const expected = "Tovu was closed or asleep at T777.\n\nSummarise the week";
  assert.equal(h.calls.appended[0]!.message.content, expected);
  assert.equal((h.calls.accepted[0]!.required.context as { prompt: string }).prompt, expected);
  assert.deepEqual(h.calls.accepted[0]!.optional.routine, { routineId: "r1", runId: "run1", catchUp: true, slotAt: 777 });
});

test("a null write refuses before launch, and the failed prepare's conversation is removed by discard", async () => {
  const h = harness({ nullWrite: true });
  const handle = await h.handler(fire());
  const { prepare } = handle;
  assert.ok(prepare);
  await assert.rejects(async () => prepare(h.row()), /could not be saved/);
  assert.equal(h.calls.accepted.length, 0);
  handle.discard!();
  await handle.completion;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls.deleted, ["routine-run1"]);
});

test("routine run uses acceptOwnerChatRun", async () => {
  const h = harness();
  const handle = await h.handler(fire());
  await handle.prepare!(h.row());
  await handle.start!();
  await handle.completion;
  // The only launch path is the common acceptance seam: exactly one accept, carrying the trusted marker.
  assert.equal(h.calls.accepted.length, 1);
  assert.equal(h.calls.accepted[0]!.optional.routine !== undefined, true);
  assert.equal("routine" in (h.calls.accepted[0]!.required.context as object), false, "the marker travels only in the trusted optional field");
});

test("settlement maps failed and canceled and caps the summary", async () => {
  const failed = harness({ settle: { status: "failed", text: "boom" } });
  const handle = await failed.handler(fire());
  await handle.prepare!(failed.row()); await handle.start!();
  assert.deepEqual(await handle.completion, { status: "failed", summary: "boom", error: "The assistant could not finish this routine run." });
  assert.equal(collapseSummary({ text: `a ${"b".repeat(400)}\n\nc` }).length, 280);
  assert.equal(collapseSummary({ text: "x  \n y" }), "x y");
});

test("an accepted run that the seam refuses throws a plain startup error instead of creating a second attempt", async () => {
  const h = harness({ accept: null });
  const handle = await h.handler(fire());
  await handle.prepare!(h.row());
  const { start } = handle;
  assert.ok(start);
  await assert.rejects(async () => start(), /could not start this routine run/);
  assert.equal(h.calls.accepted.length, 1);
});

test("chooseRoutineAgent picks the configured default and skips ineligible agents", () => {
  const picked = chooseRoutineAgent({ agentId: null, model: null, agents: [{ ...CLAUDE, id: "a", available: false }, CLAUDE, { ...CLAUDE, id: "b" }] as never }, { policy: { defaultAgentId: "b" } });
  assert.deepEqual(picked, { agentId: "b", model: null });
});

test("an accepted run is tracked for approval projection and untracked when it settles", async () => {
  const h = harness({ owner: OWNER });
  const tracked: unknown[] = [];
  const untracked: unknown[] = [];
  const handler = createRoutineRunHandler({ ...depsOf(h), approvals: { track: (run) => { tracked.push(run); }, untrack: (input) => { untracked.push(input); } } }, {});
  const handle = await handler(fire());
  await handle.prepare!(h.row());
  assert.deepEqual(tracked, []);
  await handle.start!();
  assert.deepEqual(tracked, [{ routineRunId: "run1", agentRunId: "agent-run-1", messageId: handle.assistantMessageId, principalId: "owner-1", workspaceId: "ws-1" }]);
  await handle.completion;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(untracked, [{ agentRunId: "agent-run-1" }]);
});

test("a refused acceptance is never tracked", async () => {
  const h = harness({ owner: OWNER, accept: null });
  const tracked: unknown[] = [];
  const handler = createRoutineRunHandler({ ...depsOf(h), approvals: { track: (run) => { tracked.push(run); }, untrack: () => {} } }, {});
  const handle = await handler(fire());
  await handle.prepare!(h.row());
  const { start } = handle;
  assert.ok(start);
  await assert.rejects(async () => start(), /could not start this routine run/);
  assert.deepEqual(tracked, []);
});

test("an accepted run whose settlement cannot be read completes with the safe failure message", async () => {
  const h = harness();
  const failure = new Error("internal settlement store offline");
  h.deps.runStarter.watchSettlement = async () => { throw failure; };
  const handle = await h.handler(fire());
  await handle.prepare!(h.row());
  await handle.start!();

  assert.equal(handle.agentRunId, "agent-run-1");
  assert.deepEqual(await handle.completion, {
    status: "failed", error: "Tovu could not read the result of this routine run.",
  });
});

test("a canceled assistant run settles as canceled and retains its partial summary", async () => {
  const h = harness({ settle: { status: "canceled", text: "Stopped\n by owner" } });
  const handle = await h.handler(fire());
  await handle.prepare!(h.row());
  await handle.start!();

  assert.deepEqual(await handle.completion, { status: "canceled", summary: "Stopped by owner" });
});

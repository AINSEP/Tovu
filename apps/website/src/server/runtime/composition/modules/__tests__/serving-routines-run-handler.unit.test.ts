import assert from "node:assert/strict";
import test from "node:test";

import { listAssistantAgents } from "#src/assistant/agents";
import { ownerChatRunHandler, routineCatchUpText } from "../serving-routines.js";

/**
 * @file P3-T2.T production wiring: the serving bindings install the real owner-chat run handler only
 * when the serving deps carry a durable run store, keep the not-ready fallback otherwise, and resolve
 * the routine's creator through the existing owner access (never a stored role).
 */
const routeDeps = { workspaceId: "ws-1" } as never;
const acceptanceDeps = (durable: unknown) => ({ chatRunLedger: { durable }, tracker: { capture: () => {} }, observability: {}, chatHistory: () => ({}) }) as never;

test("no acceptance deps keeps the not-ready fallback", () => {
  assert.deepEqual(ownerChatRunHandler({ routeDeps, access: async () => true }, {}), {});
});

test("no durable run store keeps the not-ready fallback", () => {
  assert.deepEqual(ownerChatRunHandler({ routeDeps, access: async () => true }, { acceptanceDeps: acceptanceDeps(undefined) }), {});
});

test("an explicit test runStarter wins over the production handler", () => {
  assert.deepEqual(ownerChatRunHandler({ routeDeps, access: async () => true }, { acceptanceDeps: acceptanceDeps({}), runStarter: (async () => ({})) as never }), {});
});

test("a durable store installs the real handler, and a creator who is no longer an owner starts nothing", async () => {
  const asked: unknown[] = [];
  const wiring = ownerChatRunHandler({ routeDeps, access: async ({ actor }) => { asked.push(actor); return false; } }, { acceptanceDeps: acceptanceDeps({}) });
  assert.ok(wiring.createRunHandler);
  const handler = wiring.createRunHandler({ approvals: {
    track: () => assert.fail("a refused routine must not track approval"),
    untrack: async () => assert.fail("a refused routine must not untrack approval"),
  }, updateRun: () => assert.fail("a refused routine must not update the run") });
  const handle = await handler({ routine: { id: "r1", name: "Digest", prompt: "hi", creatorId: "owner-1", agentId: null, model: null,
    schedule: { kind: "hourly", minute: 0 }, target: { mode: "create_each_run" }, skillId: null, context: {}, enabled: true,
    nextRunAt: 0, lastRun: null, createdAt: 0, updatedAt: 0 }, trigger: "scheduled", startedAt: 0, runId: "run1" });
  const { prepare } = handle;
  assert.ok(prepare);
  await assert.rejects(async () => prepare({ id: "run1", routineId: "r1", status: "queued",
    trigger: "scheduled", projectId: "", conversationId: handle.conversationId, agentRunId: "", startedAt: 0,
    completedAt: null, summary: null, error: null, errorCode: null }), /no longer manages this site/);
  assert.deepEqual(asked, [{ principalId: "owner-1", workspaceId: "ws-1" }]);
});

test("the catch-up copy matches the handler's contract", () => {
  assert.equal(routineCatchUpText({ localTime: "9:00" }), "Tovu was closed or asleep at 9:00.");
});

test("a late run for a creator who still owns the site is prepared with an installed agent and the catch-up copy in local time", async () => {
  const slotAt = Date.UTC(2026, 0, 5, 9, 30);
  const asked: unknown[] = [];
  const stores: unknown[] = [];
  const messages: Array<{ id: string; role: string; content: string }> = [];
  const patches: unknown[] = [];
  const deps = { chatRunLedger: { durable: {} }, tracker: { capture: () => {} }, observability: {},
    chatHistory: (scope: unknown) => { stores.push(scope); return {
      create: async () => ({}),
      appendMessage: async ({ message }: { message: { id: string; role: string; content: string } }) => { messages.push(message); return message; },
    }; } } as never;
  const wiring = ownerChatRunHandler({ routeDeps, access: async ({ actor }) => { asked.push(actor); return true; } }, { acceptanceDeps: deps });
  assert.ok(wiring.createRunHandler);
  const handler = wiring.createRunHandler({ approvals: { track: () => {}, untrack: async () => {} }, updateRun: ({ patch }) => { patches.push(patch); } });
  const handle = await handler({ routine: { id: "r1", name: "Digest", prompt: "Summarise the week.", creatorId: "owner-1", agentId: null, model: null,
    schedule: { kind: "hourly", minute: 0 }, target: { mode: "create_each_run" }, skillId: null, context: {}, enabled: true,
    nextRunAt: 0, lastRun: null, createdAt: 0, updatedAt: 0 }, trigger: "scheduled", startedAt: 0, runId: "run1", catchUp: true, slotAt });
  const run = { id: "run1", routineId: "r1", status: "queued" as const, trigger: "scheduled" as const, projectId: "", conversationId: handle.conversationId,
    agentRunId: "", startedAt: 0, completedAt: null, summary: null, error: null, errorCode: null } as Parameters<NonNullable<typeof handle.prepare>>[0];
  await handle.prepare!(run);
  assert.deepEqual(asked, [{ principalId: "owner-1", workspaceId: "ws-1" }]);
  assert.deepEqual(stores, [{ kind: "user", workspaceId: "ws-1", userId: "owner-1" }], "the conversation is the still-current owner's");
  const installed = (await listAssistantAgents()).map((agent) => agent.id);
  assert.equal(installed.includes(String(run.agentId)), true, `chose ${String(run.agentId)} from ${installed.join(", ")}`);
  assert.equal((patches[0] as { agentId?: unknown }).agentId, run.agentId);
  assert.equal(messages[0]?.role, "user");
  assert.equal(messages[0]?.content, `Tovu was closed or asleep at ${new Date(slotAt).toLocaleString()}.\n\nSummarise the week.`);
});

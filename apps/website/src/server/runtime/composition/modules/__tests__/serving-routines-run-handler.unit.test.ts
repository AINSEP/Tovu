import assert from "node:assert/strict";
import test from "node:test";

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
  assert.equal(typeof wiring.createRunHandler, "function");
  const handler = wiring.createRunHandler!({ approvals: { track: () => {}, untrack: () => {} }, updateRun: () => {} });
  const handle = await handler({ routine: { id: "r1", name: "Digest", prompt: "hi", creatorId: "owner-1", agentId: null, model: null } as never, trigger: "scheduled", startedAt: 0, runId: "run1" } as never);
  await assert.rejects(handle.prepare!({ id: "run1" } as never), /no longer manages this site/);
  assert.deepEqual(asked, [{ principalId: "owner-1", workspaceId: "ws-1" }]);
});

test("the catch-up copy matches the handler's contract", () => {
  assert.equal(routineCatchUpText({ localTime: "9:00" }), "Tovu was closed or asleep at 9:00.");
});

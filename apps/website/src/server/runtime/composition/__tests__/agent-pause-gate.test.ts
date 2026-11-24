/**
 * @file The assistant switch's resume hold (owner decision 11-23, H4): while the admin assistant is
 * off, agent-created work is held; turning it back on does NOT resume that work by itself, only an
 * approved resume card does. Pinned on SQLite and PGlite because the hold must survive a restart
 * (the switch is an env var, so "turning it back on" IS a restart).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createAgentPauseGate, sqlAgentPauseHoldStore, type AgentPauseHoldStore } from "../agent-pause-gate.js";
import type { HumanConfirmOutcome } from "../../../../contracts/core/human-confirm.js";

const clock = { nowIso: () => "2026-11-24T00:00:00.000Z" };
const gateOn = (store: AgentPauseHoldStore, assistantEnabled: boolean) =>
  createAgentPauseGate({ store, workspaceId: "w", assistantEnabled: () => assistantEnabled, clock });
const answering = (outcome: HumanConfirmOutcome) => {
  const calls: number[] = [];
  return { calls, confirm: async () => { calls.push(1); return outcome; } };
};

for (const adapter of eachDialect({ tables: ["agent_pause_holds"], make: db => sqlAgentPauseHoldStore({ kernel: db as KyselyKernel<unknown> }) })) {
  test(`[${adapter.name}] switch off holds agent work; back on stays held until an approved resume`, async () => {
    const store = adapter.make();
    assert.equal(await gateOn(store, false).isAgentWorkAllowed(), false);
    assert.equal(await store.heldSince({ workspaceId: "w" }), clock.nowIso(), "the hold is persisted, not in memory");

    const restarted = gateOn(store, true);
    assert.equal(await restarted.isAgentWorkAllowed(), false, "turning the assistant back on resumes nothing silently");

    const declined = answering({ confirmed: false, reason: "declined" });
    assert.deepEqual(await restarted.resume({ confirm: declined.confirm }), { resumed: false, reason: "declined" });
    assert.equal(await restarted.isAgentWorkAllowed(), false, "a declined card leaves the work paused");

    const approved = answering({ confirmed: true });
    assert.deepEqual(await restarted.resume({ confirm: approved.confirm }), { resumed: true });
    assert.equal(approved.calls.length, 1);
    assert.equal(await gateOn(store, true).isAgentWorkAllowed(), true, "an approved resume survives a restart");
  });

  test(`[${adapter.name}] resume is refused while the switch is still off, without showing a card`, async () => {
    const store = adapter.make();
    const off = gateOn(store, false);
    await off.isAgentWorkAllowed();
    const card = answering({ confirmed: true });
    assert.deepEqual(await off.resume({ confirm: card.confirm }), { resumed: false, reason: "assistant-off" });
    assert.equal(card.calls.length, 0);
    assert.equal(await gateOn(store, true).isAgentWorkAllowed(), false);
  });

  test(`[${adapter.name}] an assistant that was never off holds nothing and has nothing to resume`, async () => {
    const store = adapter.make();
    const on = gateOn(store, true);
    assert.equal(await on.isAgentWorkAllowed(), true);
    const card = answering({ confirmed: true });
    assert.deepEqual(await on.resume({ confirm: card.confirm }), { resumed: false, reason: "not-held" });
    assert.equal(card.calls.length, 0);
    assert.equal(await store.heldSince({ workspaceId: "w" }), null);
  });
}

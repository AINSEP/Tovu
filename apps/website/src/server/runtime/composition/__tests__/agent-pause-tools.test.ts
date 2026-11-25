import assert from "node:assert/strict";
import { test } from "node:test";

import type { HumanConfirmOutcome } from "@jini-ai/daemon/surface-exchanges/human-confirm";
import { buildAgentPauseRegistrations, RESUME_AGENT_WORK_TOOL_ID } from "../agent-pause-tools.js";
import { createAgentPauseGate, createMemoryAgentPauseHoldStore } from "../agent-pause-gate.js";

/**
 * @file H4: `resume_agent_work` releases the agent-pause hold only through the approval card. No
 * confirm (declined, abandoned) leaves agent-created work held; a confirm resumes it. The gate is
 * the production `createAgentPauseGate`; only the card's human answer is stubbed.
 */

const WS = "ws-resume";

async function rig(answer: HumanConfirmOutcome) {
  const store = createMemoryAgentPauseHoldStore();
  await store.hold({ workspaceId: WS, sinceIso: "2026-11-21T00:00:00.000Z" });
  const gate = createAgentPauseGate({ store, workspaceId: WS, assistantEnabled: () => true, clock: { nowIso: () => "2026-11-22T00:00:00.000Z" } });
  const asked: string[] = [];
  const deps = { workspaceId: WS, agentPauseGate: gate, authorize: async () => ({ allowed: true }) };
  const [registration] = buildAgentPauseRegistrations({ deps, surfaces: {} as never }, {
    askHuman: async ({ spec }) => { asked.push(spec.toolId); return answer; },
  });
  const run = () => registration.handler({ input: {}, principal: { id: "owner-1" }, signal: new AbortController().signal } as never, { emitSurface: () => {} } as never);
  return { gate, asked, run, registration };
}

test("resume_agent_work: a declined card keeps agent work held", async () => {
  const { gate, asked, run, registration } = await rig({ confirmed: false, reason: "declined" } as HumanConfirmOutcome);
  assert.equal(registration.descriptor.id, RESUME_AGENT_WORK_TOOL_ID);
  assert.deepEqual(await run(), { resumed: false, reason: "declined" });
  assert.deepEqual(asked, [RESUME_AGENT_WORK_TOOL_ID], "the human was asked through the card");
  assert.equal(await gate.isAgentWorkAllowed(), false);
});

test("resume_agent_work: a confirmed card releases the hold", async () => {
  const { gate, run } = await rig({ confirmed: true });
  assert.equal(await gate.isAgentWorkAllowed(), false);
  assert.deepEqual(await run(), { resumed: true });
  assert.equal(await gate.isAgentWorkAllowed(), true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";

import type { HumanConfirmOutcome } from "@jini-ai/daemon/surface-exchanges/human-confirm";
import { buildAgentPauseRegistrations, RESUME_AGENT_WORK_TOOL_ID, type AgentPauseToolDeps } from "../agent-pause-tools.js";
import { createAgentPauseGate, createMemoryAgentPauseHoldStore } from "../agent-pause-gate.js";
import { portFake } from "#src/server/__tests__/helpers/port-fake";

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
  const deps = { workspaceId: WS, agentPauseGate: gate, authorize: async () => ({ allowed: true, reason: "test" }) };
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

for (const scenario of [
  { name: "denied principal", allowed: false, message: "resume_agent_work: this caller may not use the admin assistant." },
  { name: "authorized principal without a gate", allowed: true, message: "resume_agent_work: this site has no agent-pause gate composed; nothing is held." },
] as const) {
  test(`resume_agent_work refuses a ${scenario.name} before asking for approval`, async () => {
    const checks: unknown[] = [];
    const actions: string[] = [];
    const deps: AgentPauseToolDeps = { workspaceId: "editors", authorize: async input => {
      checks.push(input);
      return { allowed: scenario.allowed, reason: scenario.allowed ? "matched" : "denied" };
    }, agentPauseGate: scenario.allowed ? undefined : { resume: async () => {
      actions.push("resume");
      return { resumed: true };
    } } };
    const [tool] = buildAgentPauseRegistrations({ deps, surfaces: portFake<AssistantSurfaceDeps>({}) }, {
      askHuman: async () => { actions.push("approval"); return { confirmed: true }; },
    });
    assert.ok(tool);
    const context: ToolExecutionContext = { executionId: "exec-5", principal: { id: "editor-3" },
      run: { id: "run-1" }, input: {}, signal: new AbortController().signal };
    await assert.rejects(tool.handler(context), { message: scenario.message });
    assert.deepEqual(checks, [{ principalId: "editor-3", workspaceId: "editors", permission: "admin.assistant.use" }]);
    assert.deepEqual(actions, []);
  });
}

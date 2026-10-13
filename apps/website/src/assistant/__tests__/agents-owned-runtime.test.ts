/** Tovu's host projection composes real Jini state with fake detection effects. */
import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_DEFS, createNativeAgentRuntime, type DetectedAgent } from "@jini-ai/agent-runtime";
import { createAssistantAgentInventory } from "../agents.js";

/** Keeps PATH absent; the injected probe supplies data without launching any native CLI. */
function inventoryFor(model: string) {
  const runtime = createNativeAgentRuntime({ env: { PATH: "/missing", HOME: "/missing" } });
  let probes = 0;
  const inventory = createAssistantAgentInventory({ runtime,
    detector: (input, options = {}) => runtime.detectAgents(input, { ...options,
      probeAgent: async ({ def }) => {
        probes++;
        return { ...def, available: true, path: "/fake/cli", models: [{ id: model, label: model }], modelsSource: "live" } as DetectedAgent;
      },
    }),
  });
  return { inventory, runtime, calls: () => probes };
}

test("owned inventories share settings/chat results within one host while two hosts stay isolated", async () => {
  const a = inventoryFor("model-a"); const b = inventoryFor("model-b");
  try {
    await a.inventory.listDetectedAssistantAgents();
    await b.inventory.listDetectedAssistantAgents();
    const aAgents = await a.inventory.listAssistantAgents({}, { waitForProbe: true });
    const bAgents = await b.inventory.listAssistantAgents({}, { waitForProbe: true });
    assert.deepEqual(aAgents.find(agent => agent.id === "kimi")?.models, [{ id: "model-a", label: "model-a" }]);
    assert.deepEqual(bAgents.find(agent => agent.id === "kimi")?.models, [{ id: "model-b", label: "model-b" }]);
    assert.deepEqual((await a.inventory.listDetectedAssistantAgents()).find(agent => agent.id === "kimi")?.models,
      aAgents.find(agent => agent.id === "kimi")?.models);
    assert.equal(a.calls(), AGENT_DEFS.length);
    assert.equal(b.calls(), AGENT_DEFS.length);
    assert.notEqual(a.runtime.state, b.runtime.state);
    await a.inventory.rescanAssistantAgents({}, { waitForProbe: true });
    assert.equal(a.calls(), AGENT_DEFS.length * 2);
    assert.equal(b.calls(), AGENT_DEFS.length);
    a.runtime.state.capabilities.set("kimi", { host: true });
    b.runtime.state.capabilities.set("kimi", { host: false });
    await a.inventory.dispose({});
    assert.equal(a.runtime.state.detections.size, 0);
    assert.equal(a.runtime.state.capabilities.size, 0);
    assert.deepEqual(b.runtime.state.capabilities.get("kimi"), { host: false });
  } finally { await Promise.all([a.inventory.dispose({}), b.inventory.dispose({})]); }
});

test("inventory disposal drains a queued background scan before clearing its runtime", async () => {
  const runtime = createNativeAgentRuntime({ env: { PATH: "/missing", HOME: "/missing" } });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const inventory = createAssistantAgentInventory({ runtime, detector: async () => {
    started(); await gate;
    runtime.state.capabilities.set("late-write", { host: true });
    return [];
  } });
  await inventory.listDetectedAssistantAgents();
  const disposal = inventory.dispose({});
  await ready;
  release();
  await disposal;
  assert.equal(runtime.state.capabilities.size, 0);
  await assert.rejects(runtime.detectAgents({}), { name: "InvalidStateError", message: "Agent runtime is disposed" });
});

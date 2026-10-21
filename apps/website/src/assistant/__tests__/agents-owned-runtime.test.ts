/** Tovu's host projection composes real Jini state with fake detection effects. */
import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_DEFS, createNativeAgentRuntime, type DetectedAgent } from "@jini-ai/agent-runtime";
import { createAssistantAgentInventory, type AssistantAgentDefs } from "../agents.js";

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

test("an injected def registry's failureHints bridge is projected only for the def that declares it", async () => {
  const runtime = createNativeAgentRuntime({ env: { PATH: "/missing", HOME: "/missing" } });
  const hints = [{ category: "auth" as const, patterns: ["Incorrect API key"], hint: "Replace the key and retry." }];
  const [first, second] = AGENT_DEFS;
  assert.ok(first && second, "the runtime ships at least two defs");
  const defs: AssistantAgentDefs = [{ ...first, failureHints: hints }, second];
  const inventory = createAssistantAgentInventory({ runtime, defs,
    detector: async () => defs.map(def => ({ ...def, available: false, models: def.fallbackModels, modelsSource: "fallback" }) as DetectedAgent) });
  try {
    const agents = await inventory.listAssistantAgents({}, { waitForProbe: true });
    assert.deepEqual(agents.map(agent => agent.id), [first.id, second.id], "only the injected registry is projected");
    assert.deepEqual(agents[0]?.failureHints, hints);
    assert.equal(Object.hasOwn(agents[1] ?? {}, "failureHints"), false, "a def without hints carries no failureHints key");
  } finally { await inventory.dispose({}); }
});

test("a non-waiting Rescan returns the retained inventory immediately while the forced scan is pending", async () => {
  const runtime = createNativeAgentRuntime({ env: { PATH: "/missing", HOME: "/missing" } });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let scans = 0;
  const inventory = createAssistantAgentInventory({ runtime, detector: async () => {
    scans++;
    if (scans === 1) return [];
    await gate;
    const [def] = AGENT_DEFS;
    assert.ok(def);
    return [{ ...def, available: false, models: def.fallbackModels, modelsSource: "fallback" } as DetectedAgent];
  } });
  try {
    await inventory.listAssistantAgents({}, { waitForProbe: true });
    const during = await inventory.rescanAssistantAgents({});
    assert.equal(inventory.assistantAgentDiscoveryPending({}), true, "the forced scan is still in flight");
    assert.deepEqual(during, [], "the retained (first-scan) inventory is returned without waiting");
    release();
    const after = await inventory.listAssistantAgents({}, { waitForProbe: true });
    assert.deepEqual(after.map(agent => agent.id), [AGENT_DEFS[0]?.id], "the forced scan's result replaces the retained one once settled");
    assert.equal(scans, 2, "Rescan forced exactly one additional scan");
  } finally { release(); await inventory.dispose({}); }
});

test("with no detector and no test prober, the inventory delegates to the runtime's own detector", async () => {
  // PATH points nowhere, so the runtime's real detection resolves every def as absent without spawning.
  const runtime = createNativeAgentRuntime({ env: { PATH: "/missing", HOME: "/missing" } });
  const inventory = createAssistantAgentInventory({ runtime });
  try {
    const agents = await inventory.listAssistantAgents({}, { waitForProbe: true });
    assert.ok(agents.length > 0);
    for (const agent of agents) {
      assert.equal(agent.available, false, `${agent.id} must be unavailable with an empty PATH`);
      assert.equal(agent.discoveryPending, false);
      assert.match(agent.diagnostic ?? "", /\S/, `${agent.id} must explain why it is unavailable`);
    }
    assert.ok(runtime.state.detections.size > 0, "the runtime's own detector recorded its detections");
  } finally { await inventory.dispose({}); }
});

import { assistantCliPermissions } from "#src/contracts/headless/assistant-subagents-policy";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";

import { buildAssistantSubagentsOverlay, buildBaseSystemOverlay } from "../assistant-system-overlay.js";
import { PREFER_SUBAGENTS_GUIDANCE, buildAssistantRuntimeGuidance } from "../assistant-runtime-guidance.js";
import { captureDaemonRun, daemonInitializer, evaluateDaemonExpression } from "./helpers/daemon-source.js";

/**
 * @file Wiring proof for the per-person runtime preferences: evaluates the daemon's real
 * `onStarted` and `assistantPromptAugmenter` source (see `helpers/daemon-source.ts` for why the
 * entry script is read rather than imported) and checks that the fresh `core.interface` read at
 * launch reaches the synchronous system overlay of that same run, and only that run.
 */

type Overlay = { systemOverlay(input: { agentId: string; turnIndex: number }): string };

async function launchOverlay({ enabled, agentId, preferSubagents }: { enabled: boolean; agentId: string; preferSubagents: unknown }) {
  const assistantRuntimeGuidanceContext = new AsyncLocalStorage();
  const assistantSubagentsContext = new AsyncLocalStorage<boolean>();
  const augmenter = evaluateDaemonExpression<Overlay>(daemonInitializer("assistantPromptAugmenter"), {
    buildBaseSystemOverlay, buildAssistantSubagentsOverlay, buildAssistantRuntimeGuidance, assistantRuntimeGuidanceContext,
    assistantSubagentsContext, assistantNativeToolsContext: new AsyncLocalStorage<boolean>(),
    bashProhibitionEnabled: false, customInstructionsCache: { readOverlay: () => null },
  });
  const reads: unknown[] = [];
  let overlay = "";
  let launchedAgentId = "";
  await captureDaemonRun({ prompt: "Port this theme" }, { request: { agentId }, bindings: {
    routeDeps: {
      ownerPrincipalId: Promise.resolve("daemon-test-principal"), siteBinding: { dir: "/site" }, workspaceId: "ws",
      toolAttemptAuditSink: { append: async () => {} }, settingsRepo: {}, siteTitleReady: Promise.resolve(),
      getEffective: async (_deps: unknown, input: { key: string }) => { reads.push(input); return { value: preferSubagents, sourceLayer: "user", defVersion: 1 }; },
    },
    assistantRuntimeGuidanceContext, assistantSubagentsContext,
    readAssistantCliPermissions: async () => assistantCliPermissions({ enabled }),
    agentExecutor: { run: async (required: { agentId: string }) => {
      launchedAgentId = required.agentId;
      await Promise.resolve();
      overlay = augmenter.systemOverlay({ agentId, turnIndex: 0 });
      throw new Error("captured launch without starting a process");
    } },
  }, lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => ({ kind: "ok" }) } })
    .catch(error => assert.match(error.message, /captured launch/));
  assert.equal(launchedAgentId, agentId);
  return { overlay, reads };
}

test("the launch reads preferSubagents fresh for the launching person", async () => {
  const { reads } = await launchOverlay({ enabled: true, agentId: "claude", preferSubagents: true });
  assert.deepEqual(reads, [{ namespace: "core.interface", key: "preferSubagents", scopeContext: { workspaceId: "ws", principalId: "daemon-test-principal" } }]);
});

test("ON + Claude Code + Task/Agent allowed: the run's overlay carries the delegation guidance", async () => {
  const { overlay } = await launchOverlay({ enabled: true, agentId: "claude", preferSubagents: true });
  assert.ok(overlay.includes(PREFER_SUBAGENTS_GUIDANCE));
});

test("OFF, a denied Task/Agent, or a runtime without native subagents: no delegation guidance", async () => {
  for (const input of [
    { enabled: true, agentId: "claude", preferSubagents: false },
    { enabled: false, agentId: "claude", preferSubagents: true },
    { enabled: true, agentId: "codex", preferSubagents: true },
  ]) {
    const { overlay } = await launchOverlay(input);
    assert.ok(overlay.length > 0, JSON.stringify(input));
    assert.equal(overlay.includes(PREFER_SUBAGENTS_GUIDANCE), false, JSON.stringify(input));
  }
});

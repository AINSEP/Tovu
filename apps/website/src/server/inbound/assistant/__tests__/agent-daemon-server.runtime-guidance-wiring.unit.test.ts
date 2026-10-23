import { assistantCliPermissions } from "#src/contracts/headless/assistant-subagents-policy";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";

import { buildAssistantSubagentsOverlay, buildBaseSystemOverlay } from "../assistant-system-overlay.js";
import { CLAUDE_IN_CHROME_ALLOWED_TOOLS, CLAUDE_IN_CHROME_GUIDANCE, PREFER_SUBAGENTS_GUIDANCE, SHORT_REPLY_GUIDANCE, DETAILED_REPLY_GUIDANCE, buildAssistantRuntimeGuidance } from "../assistant-runtime-guidance.js";
import { agentCapabilities, getAgentDef } from "@jini-ai/agent-runtime";
import type { AgentExecutorRunInput } from "@jini-ai/daemon";
import { captureDaemonRun, daemonInitializer, evaluateDaemonExpression } from "./helpers/daemon-source.js";

/**
 * @file Wiring proof for the per-person runtime preferences: evaluates the daemon's real
 * `onStarted` and `assistantPromptAugmenter` source (see `helpers/daemon-source.ts` for why the
 * entry script is read rather than imported) and checks that the fresh `core.interface` read at
 * launch reaches the synchronous system overlay of that same run, and only that run.
 */

type Overlay = { systemOverlay(input: { agentId: string; turnIndex: number }): string };

async function launchOverlay({ enabled, agentId, preferSubagents, useClaudeInChrome = false, replyLength = "normal", owner = "daemon-test-principal", chromeProbed = true }: { enabled: boolean; agentId: string; preferSubagents: unknown; useClaudeInChrome?: boolean; replyLength?: unknown; owner?: string; chromeProbed?: boolean }) {
  const stored: Record<string, unknown> = { preferSubagents, useClaudeInChrome, replyLength };
  const assistantRuntimeGuidanceContext = new AsyncLocalStorage();
  const assistantSubagentsContext = new AsyncLocalStorage<boolean>();
  const augmenter = evaluateDaemonExpression<Overlay>(daemonInitializer("assistantPromptAugmenter"), {
    buildBaseSystemOverlay, buildAssistantSubagentsOverlay, buildAssistantRuntimeGuidance, assistantRuntimeGuidanceContext,
    assistantSubagentsContext, assistantNativeToolsContext: new AsyncLocalStorage<boolean>(),
    bashProhibitionEnabled: false, customInstructionsCache: { readOverlay: () => null },
  });
  const reads: unknown[] = [];
  let overlay = "";
  let launched: AgentExecutorRunInput | undefined;
  let launchedAgentId = "";
  await captureDaemonRun({ prompt: "Port this theme" }, { request: { agentId }, bindings: {
    routeDeps: {
      ownerPrincipalId: Promise.resolve(owner), siteBinding: { dir: "/site" }, workspaceId: "ws",
      toolAttemptAuditSink: { append: async () => {} }, settingsRepo: {}, siteTitleReady: Promise.resolve(),
      getEffective: async (_deps: unknown, input: { key: string }) => { reads.push(input); return { value: stored[input.key], sourceLayer: "user", defVersion: 1 }; },
    },
    assistantRuntimeGuidanceContext, assistantSubagentsContext, probeAssistantChrome: async () => chromeProbed,
    readAssistantCliPermissions: async () => assistantCliPermissions({ enabled }),
    agentExecutor: { run: async (required: AgentExecutorRunInput, optional: Partial<AgentExecutorRunInput> = {}) => {
      launchedAgentId = required.agentId;
      launched = { ...required, ...optional };
      await Promise.resolve();
      overlay = augmenter.systemOverlay({ agentId, turnIndex: 0 });
      throw new Error("captured launch without starting a process");
    } },
  }, lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => ({ kind: "ok" }) } })
    .catch(error => assert.match(error.message, /captured launch/));
  assert.equal(launchedAgentId, agentId);
  return { overlay, reads, launched: launched! };
}

test("the launch reads preferSubagents fresh for the launching person", async () => {
  const { reads } = await launchOverlay({ enabled: true, agentId: "claude", preferSubagents: true });
  const scopeContext = { workspaceId: "ws", principalId: "daemon-test-principal" };
  assert.deepEqual(reads, [
    { namespace: "core.interface", key: "preferSubagents", scopeContext },
    { namespace: "core.interface", key: "useClaudeInChrome", scopeContext },
    { namespace: "core.interface", key: "replyLength", scopeContext },
  ]);
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

test("Chrome OFF (default) on Claude Code: explicit --no-chrome, no Chrome tools allowed, no Chrome guidance", async () => {
  const { overlay, launched } = await launchOverlay({ enabled: true, agentId: "claude", preferSubagents: true });
  assert.equal(launched.chromeIntegration, false);
  assert.equal(launched.allowedTools, undefined);
  assert.equal(overlay.includes(CLAUDE_IN_CHROME_GUIDANCE), false);
});

test("Chrome ON for the owner: --chrome, the whole server allowed, guidance present, every deny kept", async () => {
  for (const enabled of [true, false]) {
    const { overlay, launched } = await launchOverlay({ enabled, agentId: "claude", preferSubagents: true, useClaudeInChrome: true });
    assert.equal(launched.chromeIntegration, true);
    assert.deepEqual(launched.allowedTools, CLAUDE_IN_CHROME_ALLOWED_TOOLS);
    assert.ok(overlay.includes(CLAUDE_IN_CHROME_GUIDANCE));
    // Locked runs keep Bash and the rest disabled; no deny names the Chrome server.
    assert.equal(launched.disallowedTools?.includes("Bash"), !enabled);
    assert.equal(launched.disallowedTools?.some(tool => tool.startsWith("mcp__")), false);
    agentCapabilities.set("claude", { chrome: true });
    try {
      const args = getAgentDef({ id: "claude" })!.buildArgs({ prompt: launched.prompt, imagePaths: [] }, { extraAllowedDirs: [], options: launched });
      assert.equal(args.at(-1), "--chrome");
      const allowed = args.indexOf("--allowedTools");
      assert.deepEqual(args.slice(allowed + 1, allowed + 3), ["mcp__claude-in-chrome", "mcp__claude-in-chrome__*"]);
    } finally { agentCapabilities.delete("claude"); }
  }
});

test("Chrome ON stays off for a non-owner, and is omitted for a runtime without Chrome support", async () => {
  const nonOwner = await launchOverlay({ enabled: false, agentId: "claude", preferSubagents: true, useClaudeInChrome: true, owner: "someone-else" });
  assert.equal(nonOwner.launched.chromeIntegration, false);
  assert.equal(nonOwner.overlay.includes(CLAUDE_IN_CHROME_GUIDANCE), false);
  const codex = await launchOverlay({ enabled: true, agentId: "codex", preferSubagents: true, useClaudeInChrome: true });
  assert.equal("chromeIntegration" in codex.launched, false);
  assert.equal(codex.launched.allowedTools, undefined);
});

test("Chrome ON for the owner on a CLI whose --help lacks --chrome: no flag, no Chrome tools, no Chrome guidance", async () => {
  const { overlay, launched } = await launchOverlay({ enabled: true, agentId: "claude", preferSubagents: true, useClaudeInChrome: true, chromeProbed: false });
  assert.equal("chromeIntegration" in launched, false);
  assert.equal(launched.allowedTools, undefined);
  assert.equal(overlay.includes(CLAUDE_IN_CHROME_GUIDANCE), false);
  const args = getAgentDef({ id: "claude" })!.buildArgs({ prompt: launched.prompt, imagePaths: [] }, { extraAllowedDirs: [], options: launched });
  assert.equal(args.some(arg => arg === "--chrome" || arg === "--no-chrome" || arg.startsWith("mcp__claude-in-chrome")), false);
});

test("reply length reaches each run's actual overlay without leaking into the next run", async () => {
  for (const agentId of ["claude", "codex"]) {
    const input = { enabled: false, agentId, preferSubagents: false };
    const normal = (await launchOverlay(input)).overlay;
    assert.equal((await launchOverlay({ ...input, replyLength: "short" })).overlay, `${normal}${SHORT_REPLY_GUIDANCE} `);
    assert.equal((await launchOverlay({ ...input, replyLength: "detailed" })).overlay, `${normal}${DETAILED_REPLY_GUIDANCE} `);
    assert.equal((await launchOverlay({ ...input, replyLength: "normal" })).overlay, normal);
    assert.equal((await launchOverlay({ ...input, replyLength: "invalid" })).overlay, normal);
  }
});

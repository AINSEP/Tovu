import assert from "node:assert/strict";
import test from "node:test";

import { InMemorySettingsRepo, getEffective } from "@jini-ai/core/settings";

import {
  CLAUDE_IN_CHROME_ALLOWED_TOOLS,
  CLAUDE_IN_CHROME_GUIDANCE,
  PREFER_SUBAGENTS_GUIDANCE,
  buildClaudeInChromeRunOptions,
  resolveClaudeInChromeEffective,
  buildAssistantRuntimeGuidance,
  buildPreferSubagentsGuidance,
  resolveAssistantRuntimeLaunch,
  resolvePreferSubagentsEffective,
} from "../assistant-runtime-guidance.js";

test("the delegation guidance is the owner's exact text", () => {
  assert.equal(PREFER_SUBAGENTS_GUIDANCE,
    "Delegate multi-step or output-heavy work (building or porting a theme, screenshot/visual checks, large reads or many-file edits) " +
    "to a subagent and keep only its summary in the main chat. Do small single calls directly; do not spawn a subagent for a one-step task.");
});

test("delegation is effective only when the setting, the runtime and the run's capability all allow it", () => {
  for (const preferSubagents of [true, false]) for (const runtimeSupportsSubagents of [true, false]) for (const subagentsEnabled of [true, false]) {
    assert.equal(resolvePreferSubagentsEffective({ preferSubagents, runtimeSupportsSubagents, subagentsEnabled }),
      preferSubagents && runtimeSupportsSubagents && subagentsEnabled);
  }
});

test("guidance text: the exact sentence when effective, empty otherwise", () => {
  assert.equal(buildPreferSubagentsGuidance({ effective: true }), PREFER_SUBAGENTS_GUIDANCE);
  assert.equal(buildPreferSubagentsGuidance({ effective: false }), "");
});

test("the overlay block appends a trailing space per sentence and is empty when nothing applies", () => {
  assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents: true, claudeInChrome: false } }), `${PREFER_SUBAGENTS_GUIDANCE} `);
  assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents: false, claudeInChrome: true } }), `${CLAUDE_IN_CHROME_GUIDANCE} `);
  assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents: true, claudeInChrome: true } }), `${PREFER_SUBAGENTS_GUIDANCE} ${CLAUDE_IN_CHROME_GUIDANCE} `);
  assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents: false, claudeInChrome: false } }), "");
  assert.equal(buildAssistantRuntimeGuidance({ input: undefined }), "");
});

test("the Claude in Chrome guidance is the owner's exact text", () => {
  assert.equal(CLAUDE_IN_CHROME_GUIDANCE,
    "Claude in Chrome is available: prefer it for checking pages the owner is logged into; otherwise use the existing screenshot/Playwright tools.");
});

test("Claude in Chrome is effective only for the owner, with the setting ON, on a supporting runtime", () => {
  for (const useClaudeInChrome of [true, false]) for (const runtimeSupportsChrome of [true, false]) for (const isOwner of [true, false]) {
    assert.equal(resolveClaudeInChromeEffective({ useClaudeInChrome, runtimeSupportsChrome, isOwner }), useClaudeInChrome && runtimeSupportsChrome && isOwner);
  }
});

test("run options: --chrome + the whole server allowed when effective, explicit OFF otherwise, nothing for other runtimes", () => {
  assert.deepEqual(CLAUDE_IN_CHROME_ALLOWED_TOOLS, ["mcp__claude-in-chrome", "mcp__claude-in-chrome__*"]);
  assert.ok(Object.isFrozen(CLAUDE_IN_CHROME_ALLOWED_TOOLS));
  assert.deepEqual(buildClaudeInChromeRunOptions({ runtimeSupportsChrome: true, effective: true }), { chromeIntegration: true, allowedTools: CLAUDE_IN_CHROME_ALLOWED_TOOLS });
  assert.deepEqual(buildClaudeInChromeRunOptions({ runtimeSupportsChrome: true, effective: false }), { chromeIntegration: false });
  assert.deepEqual(buildClaudeInChromeRunOptions({ runtimeSupportsChrome: false, effective: false }), {});
});

function deps(values: Record<string, unknown>) {
  return {
    settingsRepo: new InMemorySettingsRepo(),
    getEffective: (async (_d: unknown, input: { key: string }) => (input.key in values ? { value: values[input.key], sourceLayer: "user", defVersion: 1 } : null)) as unknown as typeof getEffective,
    settingsReady: Promise.resolve(),
    workspaceId: "ws",
  };
}

const base = { principalId: "p", agentId: "claude", subagentsEnabled: true, isOwner: true };

test("launch: defaults on Claude Code — delegation guidance on, Chrome explicitly off", async () => {
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ ...base, deps: deps({}) }),
    { guidance: { preferSubagents: true, claudeInChrome: false }, runOptions: { chromeIntegration: false } });
});

test("launch: a runtime without native subagents, a denied Task/Agent or an OFF setting disables delegation", async () => {
  assert.deepEqual((await resolveAssistantRuntimeLaunch({ ...base, deps: deps({}), agentId: "codex" })),
    { guidance: { preferSubagents: false, claudeInChrome: false }, runOptions: {} });
  assert.equal((await resolveAssistantRuntimeLaunch({ ...base, deps: deps({}), subagentsEnabled: false })).guidance.preferSubagents, false);
  assert.equal((await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ preferSubagents: false }) })).guidance.preferSubagents, false);
});

test("launch: Chrome ON for the owner on Claude Code passes --chrome and allows the server", async () => {
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ useClaudeInChrome: true }) }),
    { guidance: { preferSubagents: true, claudeInChrome: true }, runOptions: { chromeIntegration: true, allowedTools: CLAUDE_IN_CHROME_ALLOWED_TOOLS } });
});

test("launch: Chrome ON stays off for a non-owner and is omitted for a runtime without support", async () => {
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ useClaudeInChrome: true }), isOwner: false }),
    { guidance: { preferSubagents: true, claudeInChrome: false }, runOptions: { chromeIntegration: false } });
  assert.deepEqual((await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ useClaudeInChrome: true }), agentId: "codex" })).runOptions, {});
});

test("launch: the host's own def lookup decides runtime support", async () => {
  const seen: string[] = [];
  const getDef = ({ id }: { id: string }) => { seen.push(id); return id === "host-cli" ? { supportsSubagents: true, supportsChromeIntegration: true } : null; };
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ useClaudeInChrome: true }), agentId: "host-cli" }, { getDef }),
    { guidance: { preferSubagents: true, claudeInChrome: true }, runOptions: { chromeIntegration: true, allowedTools: CLAUDE_IN_CHROME_ALLOWED_TOOLS } });
  assert.deepEqual(seen, ["host-cli", "host-cli"]);
});

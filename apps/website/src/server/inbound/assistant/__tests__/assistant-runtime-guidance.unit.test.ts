import assert from "node:assert/strict";
import test from "node:test";

import { InMemorySettingsRepo, getEffective } from "@jini-ai/core/settings";

import {
  PREFER_SUBAGENTS_GUIDANCE,
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
  assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents: true } }), `${PREFER_SUBAGENTS_GUIDANCE} `);
  assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents: false } }), "");
  assert.equal(buildAssistantRuntimeGuidance({ input: undefined }), "");
});

function deps(values: Record<string, unknown>) {
  return {
    settingsRepo: new InMemorySettingsRepo(),
    getEffective: (async (_d: unknown, input: { key: string }) => (input.key in values ? { value: values[input.key], sourceLayer: "user", defVersion: 1 } : null)) as unknown as typeof getEffective,
    settingsReady: Promise.resolve(),
    workspaceId: "ws",
  };
}

test("launch: the default preference plus Claude Code's native subagent tool enables the guidance", async () => {
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ deps: deps({}), principalId: "p", agentId: "claude", subagentsEnabled: true }),
    { guidance: { preferSubagents: true } });
});

test("launch: a runtime without native subagents, a denied Task/Agent or an OFF setting disables it", async () => {
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ deps: deps({}), principalId: "p", agentId: "codex", subagentsEnabled: true }),
    { guidance: { preferSubagents: false } });
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ deps: deps({}), principalId: "p", agentId: "claude", subagentsEnabled: false }),
    { guidance: { preferSubagents: false } });
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ deps: deps({ preferSubagents: false }), principalId: "p", agentId: "claude", subagentsEnabled: true }),
    { guidance: { preferSubagents: false } });
});

test("launch: the host's own def lookup decides runtime support", async () => {
  const seen: string[] = [];
  const getDef = ({ id }: { id: string }) => { seen.push(id); return id === "host-cli" ? { supportsSubagents: true } : null; };
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ deps: deps({}), principalId: "p", agentId: "host-cli", subagentsEnabled: true }, { getDef }),
    { guidance: { preferSubagents: true } });
  assert.deepEqual(seen, ["host-cli"]);
});

import assert from "node:assert/strict";
import test from "node:test";

import { InMemorySettingsRepo, getEffective } from "@jini-ai/core/settings";

import { DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, readAssistantRuntimePreferences, type AssistantRuntimePreferenceDeps } from "../runtime-preferences.js";

/** A getEffective fake that records each coordinate and answers from a key → value table. */
function fakeDeps(values: Record<string, unknown>, overrides: Partial<AssistantRuntimePreferenceDeps> = {}) {
  const reads: unknown[] = [];
  const deps: AssistantRuntimePreferenceDeps = {
    settingsRepo: new InMemorySettingsRepo(),
    getEffective: (async (_deps: unknown, input: { key: string }) => {
      reads.push(input);
      return input.key in values ? { value: values[input.key], sourceLayer: "user", defVersion: 1 } : null;
    }) as unknown as typeof getEffective,
    settingsReady: Promise.resolve(),
    workspaceId: "ws-1",
    ...overrides,
  };
  return { deps, reads };
}

test("defaults: subagent delegation ON, Claude in Chrome ON", () => {
  assert.deepEqual(DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, { preferSubagents: true, useClaudeInChrome: true });
  assert.ok(Object.isFrozen(DEFAULT_ASSISTANT_RUNTIME_PREFERENCES));
});

test("reads the person's stored value from core.interface at their scope", async () => {
  const { deps, reads } = fakeDeps({ preferSubagents: false, useClaudeInChrome: true });
  assert.deepEqual(await readAssistantRuntimePreferences({ deps, principalId: "alice" }), { preferSubagents: false, useClaudeInChrome: true });
  assert.deepEqual(reads, [
    { namespace: "core.interface", key: "preferSubagents", scopeContext: { workspaceId: "ws-1", principalId: "alice" } },
    { namespace: "core.interface", key: "useClaudeInChrome", scopeContext: { workspaceId: "ws-1", principalId: "alice" } },
  ]);
});

test("an absent or non-boolean value reads the default", async () => {
  assert.deepEqual(await readAssistantRuntimePreferences({ deps: fakeDeps({ useClaudeInChrome: false }).deps, principalId: "a" }), { preferSubagents: true, useClaudeInChrome: false });
  assert.deepEqual(await readAssistantRuntimePreferences({ deps: fakeDeps({}).deps, principalId: "a" }), { preferSubagents: true, useClaudeInChrome: true });
  assert.deepEqual(await readAssistantRuntimePreferences({ deps: fakeDeps({ preferSubagents: "yes", useClaudeInChrome: "yes" }).deps, principalId: "a" }), { preferSubagents: true, useClaudeInChrome: true });
});

test("a failed read or a failed definition boot falls back to the defaults instead of blocking the launch", async () => {
  const throwing = fakeDeps({}, { getEffective: (async () => { throw new Error("db down"); }) as unknown as typeof getEffective }).deps;
  assert.deepEqual(await readAssistantRuntimePreferences({ deps: throwing, principalId: "a" }), { preferSubagents: true, useClaudeInChrome: true });
  const notReady = fakeDeps({ preferSubagents: false, useClaudeInChrome: true }, { settingsReady: Promise.reject(new Error("boot failed")) }).deps;
  assert.deepEqual(await readAssistantRuntimePreferences({ deps: notReady, principalId: "a" }), { preferSubagents: true, useClaudeInChrome: true });
});

test("waits for the definitions before reading", async () => {
  let release!: () => void;
  const settingsReady = new Promise<void>(resolve => { release = resolve; });
  const { deps, reads } = fakeDeps({ preferSubagents: false }, { settingsReady });
  const pending = readAssistantRuntimePreferences({ deps, principalId: "a" });
  await Promise.resolve();
  assert.equal(reads.length, 0);
  release();
  assert.deepEqual(await pending, { preferSubagents: false, useClaudeInChrome: true });
});

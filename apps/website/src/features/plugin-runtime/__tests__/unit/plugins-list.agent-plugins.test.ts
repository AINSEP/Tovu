import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext } from "@jini-ai/core";

import { InMemoryChangeSetRepo } from "../../../../contracts/core/commands/index.js";
import { createSurfaceExchangeStore } from "../../../../contracts/core/tool-surface-exchanges.js";
import { InMemoryPluginActivationRepo } from "../../repo.memory.js";
import { buildPluginsRegistrations, type PluginsToolDeps } from "../../tool-registrations.js";

/**
 * @file RED test for row 31 (S14): `plugins_list`'s own file header has claimed since 2026-08-23
 * that the handler also reports installed Agent Plugins via an `agentPlugins` field
 * (`toAgentPluginListRow`/`listAgentPluginsForResponse`), but neither helper was ever built — the
 * handler still returns `{ plugins }` only. This pins the promised shape directly against the
 * handler, bypassing the assistant-level `content_read.plugin` derivation entirely (same domain-level
 * approach `tool-registrations.plugins.test.ts`'s own `enableWithDecision` uses).
 */

const WORKSPACE_ID = "ws-tools";
const PRINCIPAL_ID = "principal-under-test";

function fakeDeps(): PluginsToolDeps {
  return {
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => "2026-09-24T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: { enqueue: async () => {} },
    pluginActivationRepo: new InMemoryPluginActivationRepo(),
    discoverPlugins: async () => [],
    onPluginEnabled: async () => {},
    onPluginDisabled: () => {},
    removePlugin: async () => ({ ok: true as const, version: null }),
    externalMcpServerRepo: {} as never,
    siteAssistantSecretSealer: {} as never,
    siteAssistantSecretKeyring: {} as never,
  } as unknown as PluginsToolDeps;
}

function executionContext(): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input: undefined, signal: new AbortController().signal };
}

test("plugins_list reports agentPlugins: [] with an empty Agent Plugins dir, and still reports plugins", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-agent-plugins-"));
  const priorDir = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = tmpDir;
  try {
    const surfaceExchanges = createSurfaceExchangeStore();
    const registration = buildPluginsRegistrations(fakeDeps(), { surfaceExchanges }).find((r) => r.descriptor.id === "plugins_list");
    assert.ok(registration, "expected 'plugins_list' to be wired inside buildPluginsRegistrations");

    const result = (await registration.handler(executionContext())) as { plugins: unknown[]; agentPlugins: unknown[] };
    assert.deepEqual(result.plugins, []);
    assert.deepEqual(result.agentPlugins, []);
  } finally {
    if (priorDir === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = priorDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

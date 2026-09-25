import assert from "node:assert/strict";
import { mock, test } from "node:test";

import type { ToolExecutionContext } from "@jini-ai/core";

/**
 * @file S14 review: `plugins_list`'s `agentPlugins` rows carry exactly the four promised fields —
 * never `packageRoot`, `files` or a skill's `skillPath` (absolute host paths) — and a failing Agent
 * Plugin read degrades to `agentPlugins: []` instead of failing the whole call. The sibling
 * `plugins-list.agent-plugins.test.ts` only covers an empty directory, which neither guard touches.
 * `listInstalledPlugins` is swapped via `mock.module()` (real exports spread through) before
 * `tool-registrations.js` is imported, the idiom `tool-registrations.plugins-set-enabled-busy.test.ts`
 * uses.
 */

const real = await import("#src/features/agent-plugins/resolve-agent-plugin-refs");

let listBehavior: typeof real.listInstalledPlugins = real.listInstalledPlugins;

mock.module("#src/features/agent-plugins/resolve-agent-plugin-refs", {
  namedExports: { ...real, listInstalledPlugins: (dir: string) => listBehavior(dir) },
});

const { buildPluginsRegistrations } = await import("#src/features/plugin-runtime/tool-registrations");
const { InMemoryPluginActivationRepo } = await import("#src/features/plugin-runtime/repo.memory");
const { InMemoryChangeSetRepo } = await import("#src/contracts/core/commands/index");
const { createSurfaceExchangeStore } = await import("#src/contracts/core/tool-surface-exchanges");

type Deps = Parameters<typeof buildPluginsRegistrations>[0];

function fakeDeps(): Deps {
  return {
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: "ws-tools",
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
  } as unknown as Deps;
}

async function callPluginsList(): Promise<{ plugins: unknown[]; agentPlugins: unknown[] }> {
  const registration = buildPluginsRegistrations(fakeDeps(), { surfaceExchanges: createSurfaceExchangeStore() }).find(
    (r) => r.descriptor.id === "plugins_list",
  );
  assert.ok(registration);
  const ctx = { executionId: "exec-1", principal: { id: "p1" }, run: { id: "run-1" }, input: undefined, signal: new AbortController().signal };
  return (await registration.handler(ctx as unknown as ToolExecutionContext)) as { plugins: unknown[]; agentPlugins: unknown[] };
}

test("an installed Agent Plugin's row is exactly pluginId/version/archiveDigest/skill names — no absolute paths", async () => {
  listBehavior = async () => [
    {
      pluginId: "ui-ux-design",
      archiveDigest: "a".repeat(64),
      packageRoot: "/abs/host/path/packages/sha256/aaaa",
      files: ["/abs/host/path/packages/sha256/aaaa/plugin.json"],
      skills: [{ name: "web-compliance", skillPath: "/abs/host/path/skills/web-compliance/SKILL.md" }],
    },
  ];
  const result = await callPluginsList();
  assert.deepEqual(result.agentPlugins, [
    { pluginId: "ui-ux-design", version: null, archiveDigest: "a".repeat(64), skills: ["web-compliance"] },
  ]);
  assert.equal(JSON.stringify(result).includes("/abs/host/path"), false);
});

test("a failing Agent Plugin read degrades to agentPlugins: [] and still reports plugins", async () => {
  listBehavior = async () => {
    throw new Error("EACCES: permission denied, scandir '/abs/host/path'");
  };
  const result = await callPluginsList();
  assert.deepEqual(result.plugins, []);
  assert.deepEqual(result.agentPlugins, []);
});

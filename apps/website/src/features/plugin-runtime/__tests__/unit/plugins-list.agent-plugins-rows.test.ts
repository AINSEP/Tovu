import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveAgentPluginLayout } from "../../../../features/agent-plugins/layout.js";
import { test } from "node:test";

import type { ToolExecutionContext } from "@jini-ai/core";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file S14 review: `plugins_list`'s `agentPlugins` rows carry only the promised public fields and export contracts —
 * never `packageRoot`, `files` or a skill's `skillPath` (absolute host paths) — and a failing Agent
 * Plugin read degrades to `agentPlugins: []` instead of failing the whole call. The sibling
 * `plugins-list.agent-plugins.test.ts` only covers an empty directory, which neither guard touches.
 * `listInstalledPlugins` is injected through its existing owner contract, so the real registration
 * can assert row projection and read failure without replacing modules.
 */

const real = await import("../../../agent-plugins/lifecycle.js");
let listBehavior: typeof real.listInstalledPlugins = real.listInstalledPlugins;

const { buildPluginsRegistrations } = await import("#src/__tests__/support/plugin-tool-host");
const { InMemoryPluginActivationRepo } = await import("@jini-ai/plugins/host");
const { InMemoryChangeSetRepo } = await import("#src/contracts/core/commands/index");
const { createSurfaceExchangeStore } = await import("@jini-ai/daemon/surface-exchanges");

type Deps = Parameters<typeof buildPluginsRegistrations>[0];

function fakeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: "ws-tools",
    clock: { nowIso: () => "2026-09-24T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: { enqueue: async () => {} },
    pluginActivationRepo: new InMemoryPluginActivationRepo(),
    discoverPlugins: async () => [],
    listInstalledAgentPlugins: (dir: Parameters<typeof listBehavior>[0]) => listBehavior(dir),
    onPluginEnabled: async () => {},
    onPluginDisabled: () => {},
    removePlugin: async () => ({ ok: true as const, version: null }),
    externalMcpServerRepo: {} as never,
    siteAssistantSecretSealer: {} as never,
    siteAssistantSecretKeyring: {} as never,
    ...overrides,
  } as unknown as Deps;
}

async function callPluginsList(deps = fakeDeps()): Promise<{ plugins: unknown[]; agentPlugins: unknown[] }> {
  const registration = buildPluginsRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) }).find(
    (r) => r.descriptor.id === "plugins_list",
  );
  assert.ok(registration);
  const ctx = { executionId: "exec-1", principal: { id: "p1" }, run: { id: "run-1" }, input: undefined, signal: new AbortController().signal };
  return (await registration.handler(ctx as unknown as ToolExecutionContext)) as { plugins: unknown[]; agentPlugins: unknown[] };
}

const RUNTIME_ROW = {
  id: "word-count", name: "Word Count", version: "1.0.0", source: "site", tier: "tier-3",
  status: "valid", enabled: true, quarantine: null, errors: [],
  // 2026-10-04 (36b97dfdb): every row carries conflicts[], empty when no name is contested.
  conflicts: [],
};

function runtimeDeps(): Deps {
  return fakeDeps({
    discoverPlugins: async () => [{
      id: "word-count", name: "Word Count", version: "1.0.0", source: "site", tier: "tier-3",
      status: "valid", errors: [], sourceDir: "/abs/host/path/runtime/word-count",
    }],
    pluginActivationRepo: new InMemoryPluginActivationRepo({ initialRows: [{
      pluginId: "word-count", workspaceId: "ws-tools", version: "1.0.0", enabled: true,
      updatedAt: "2026-09-24T00:00:00.000Z",
    }] }),
  });
}

test("an installed Agent Plugin's row carries identity/skill names/exports — no absolute paths", async () => {
  const directories: string[] = [];
  listBehavior = async (dir) => {
    directories.push(dir);
    return [
      {
        pluginId: "ui-ux-design",
        archiveDigest: "a".repeat(64),
        packageRoot: "/abs/host/path/packages/sha256/aaaa",
        files: ["/abs/host/path/packages/sha256/aaaa/plugin.json"],
        skills: [{ name: "web-compliance", skillPath: "/abs/host/path/skills/web-compliance/SKILL.md" }],
      },
    ];
  };
  const result = await callPluginsList(runtimeDeps());
  // Layout B: listInstalledPlugins walks the WORKSPACE root (<ws>/<pluginId>/package/sha256/*), not
  // the retired flat <ws>/packages/sha256 store (spec 2026-09-10-agent-plugin-memory.md).
  assert.deepEqual(directories, [resolveAgentPluginLayout().forWorkspace("ws-tools").root]);
  assert.equal(directories[0], path.join(resolveAgentPluginLayout().root, "ws", "ws-tools"));
  assert.deepEqual(result.plugins, [RUNTIME_ROW]);
  assert.deepEqual(result.agentPlugins, [
    { pluginId: "ui-ux-design", version: null, archiveDigest: "a".repeat(64), skills: ["web-compliance"], exports: [] },
  ]);
  assert.equal(JSON.stringify(result).includes("/abs/host/path"), false);
});

test("a failing Agent Plugin read degrades to agentPlugins: [] and still reports plugins", async () => {
  listBehavior = async () => {
    throw new Error("EACCES: permission denied, scandir '/abs/host/path'");
  };
  const result = await callPluginsList(runtimeDeps());
  assert.deepEqual(result.plugins, [RUNTIME_ROW]);
  assert.deepEqual(result.agentPlugins, []);
});

test("T1: plugins_list attaches export contracts, availability and ready snippets to the owning plugin row", async () => {
  listBehavior = async () => [{ pluginId: "demo", archiveDigest: "b".repeat(64), packageRoot: "/private/package", files: [], skills: [] }];
  const { harness, owner, definition } = await import("../../../agent-plugins/__tests__/fixtures/plugin-exports.js");
  const runtime = harness({ packages: [{ ...owner, exports: { button: { ...definition, props: { type: "object", properties: {}, additionalProperties: false } } } }] }).runtime;
  const result = await callPluginsList(fakeDeps({ workspaceId: "ws-embeds", pluginExports: runtime }));
  const row = result.agentPlugins[0] as { exports: { availability: string; snippet: string; consent: string }[] };
  assert.equal(row.exports[0]!.availability, "ready");
  assert.equal(row.exports[0]!.consent, "functional");
  assert.match(row.exports[0]!.snippet, /data-embed-config/);
  assert.doesNotMatch(JSON.stringify(result), /private\/package|not-exposed|button.html/);
});

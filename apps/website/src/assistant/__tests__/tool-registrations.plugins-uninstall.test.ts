import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryChangeSetRepo } from "../../contracts/core/commands/index.js";
import type { PluginDiscoveryRecord } from "../../features/plugin-runtime/discovery.js";
import { pluginAgentToolCatalog, type AgentToolDefinition as PluginsAgentToolDefinition } from "../../features/plugin-runtime/agent-tools.js";
import { InMemoryPluginActivationRepo } from "../../features/plugin-runtime/repo.memory.js";
import { buildPluginsRegistrations, type PluginsToolDeps } from "../../features/plugin-runtime/tool-registrations.js";

/**
 * @file `plugins_uninstall` — the RED/GREEN proof for `ADS-memory/reports/2026-09-07-
 * assistant-tool-coverage-audit.md`'s Gap #4: the real admin route
 * (`DELETE .../plugins/:pluginId`, `routes/admin/plugins/uninstall.ts`, Milestone 2, 2026-08-20)
 * exists and is wired, but `plugin-runtime/agent-tools.ts`'s own catalog header FALSELY claimed
 * "features/plugin-runtime has no admin ROUTE for [uninstall] at all" — the exact reason the tool
 * was never built. Before this dispatch, `pluginAgentToolCatalog` held only `plugins_list`/
 * `plugins_set_enabled` (2 entries); this suite pins the 3rd.
 *
 * Sibling of `tool-registrations.plugins.test.ts`, which this domain's OTHER two tools already have
 * full coverage in — kept as its own file rather than appended there, since it exercises a materially
 * different mechanism (`uninstallPlugin`, not `executeCommand`).
 */

const WORKSPACE_ID = "ws-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-07T00:00:00.000Z";

const BUILT_IN: PluginDiscoveryRecord = {
  id: "word-count",
  name: "Word Count",
  version: "1.0.0",
  source: "built-in",
  tier: "tier-3",
  status: "valid",
  errors: [],
};

const SITE_PLUGIN: PluginDiscoveryRecord = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  source: "site",
  tier: "tier-3",
  status: "valid",
  errors: [],
};

function fakeRouteDeps(options: { allow?: boolean; discovery?: PluginDiscoveryRecord[] } = {}) {
  const allow = options.allow ?? true;
  const discovery = options.discovery ?? [BUILT_IN, SITE_PLUGIN];
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const uninstallCalls: string[] = [];
  const pluginActivationRepo = new InMemoryPluginActivationRepo();

  const deps: PluginsToolDeps = {
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => "id-1" },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: { enqueue: async () => undefined },
    pluginActivationRepo,
    discoverPlugins: async () => discovery,
    onPluginEnabled: async () => undefined,
    onPluginDisabled: () => undefined,
    onPluginUninstalled: async (pluginId: string) => {
      uninstallCalls.push(pluginId);
    },
  };

  return { deps, authorizeCalls, uninstallCalls, pluginActivationRepo };
}

function registrations(deps: PluginsToolDeps): Map<string, ToolRegistration> {
  return new Map(buildPluginsRegistrations(deps).map((r) => [r.descriptor.id, r]));
}

function wired(deps: PluginsToolDeps, id: string): ToolRegistration {
  const found = registrations(deps).get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

function catalogEntry(toolId: string): PluginsAgentToolDefinition {
  const entry = pluginAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

// ---------------------------------------------------------------------------
// 1. The catalog now has 3 entries, and all 3 are wired
// ---------------------------------------------------------------------------

test("plugins_uninstall is wired alongside plugins_list/plugins_set_enabled — 3 wired tools, catalog has exactly 3 entries", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...registrations(deps).keys()].sort(), ["plugins_list", "plugins_set_enabled", "plugins_uninstall"]);
  assert.equal(pluginAgentToolCatalog.length, 3, "no unwired plugins entry — the whole catalog is wired");
});

test("plugins_uninstall's own catalog description states it is not reversible", () => {
  assert.match(catalogEntry("plugins_uninstall").description, /not reversible|NOT reversible|permanently/i);
});

test("agent-tools.ts's header no longer claims uninstall has no admin route — the stale comment is fixed", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../../features/plugin-runtime/agent-tools.ts", import.meta.url), "utf8");
  assert.doesNotMatch(
    source,
    /There is no install\/uninstall\/upload tool\. `features\/plugin-runtime` has no admin ROUTE for\s*\n\s*\* +either operation at all/,
    "the false 'no uninstall route exists' claim must not still be asserted as current fact",
  );
});

// ---------------------------------------------------------------------------
// 2. Authorization (ADR-021 §2) — same permission as plugins_set_enabled, no new grant
// ---------------------------------------------------------------------------

test("plugins_uninstall requires admin.plugins.enable — the SAME permission plugins_set_enabled uses, no new grant introduced", () => {
  assert.equal(catalogEntry("plugins_uninstall").authorization.permission, "admin.plugins.enable");
  assert.equal(catalogEntry("plugins_uninstall").authorization.permission, catalogEntry("plugins_set_enabled").authorization.permission);
});

test("plugins_uninstall: calls authorize() with admin.plugins.enable and the run's principal before touching anything", async () => {
  const { deps, authorizeCalls, pluginActivationRepo } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled: false, updatedAt: NOW });

  await wired(deps, "plugins_uninstall").handler(executionContext({ pluginId: SITE_PLUGIN.id }));

  assert.ok(authorizeCalls.length >= 1);
  assert.equal(authorizeCalls[0]!.principalId, PRINCIPAL_ID);
  assert.equal(authorizeCalls[0]!.permission, "admin.plugins.enable");
  assert.equal(authorizeCalls[0]!.workspaceId, WORKSPACE_ID);
});

test("plugins_uninstall: a denied principal is rejected and nothing is removed", async () => {
  const { deps, uninstallCalls } = fakeRouteDeps({ allow: false, discovery: [SITE_PLUGIN] });
  await assert.rejects(() => wired(deps, "plugins_uninstall").handler(executionContext({ pluginId: SITE_PLUGIN.id })));
  assert.deepEqual(uninstallCalls, []);
});

// ---------------------------------------------------------------------------
// 3. Business rules — mirrors uninstall.ts's own two preconditions exactly
// ---------------------------------------------------------------------------

test("plugins_uninstall: refuses a built-in plugin — nothing to remove", async () => {
  const { deps, uninstallCalls } = fakeRouteDeps();
  await assert.rejects(() => wired(deps, "plugins_uninstall").handler(executionContext({ pluginId: BUILT_IN.id })), /built-in/);
  assert.deepEqual(uninstallCalls, []);
});

test("plugins_uninstall: refuses a plugin still enabled in a workspace", async () => {
  const { deps, uninstallCalls, pluginActivationRepo } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled: true, updatedAt: NOW });

  await assert.rejects(() => wired(deps, "plugins_uninstall").handler(executionContext({ pluginId: SITE_PLUGIN.id })), /enabled/);
  assert.deepEqual(uninstallCalls, [], "the filesystem mechanism must never be reached while still enabled somewhere");
});

test("plugins_uninstall: refuses an unknown plugin id", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(() => wired(deps, "plugins_uninstall").handler(executionContext({ pluginId: "does-not-exist" })), /was not found/);
});

// ---------------------------------------------------------------------------
// 4. Happy path — files removed, activation rows cleared in every workspace
// ---------------------------------------------------------------------------

test("plugins_uninstall: removes the on-disk artifact and clears activation rows in every workspace that has one", async () => {
  const { deps, uninstallCalls, pluginActivationRepo } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled: false, updatedAt: NOW });
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: "other-ws", version: "1.0.0", enabled: false, updatedAt: NOW });

  const out = (await wired(deps, "plugins_uninstall").handler(executionContext({ pluginId: SITE_PLUGIN.id }))) as {
    pluginId: string;
    clearedWorkspaceIds: string[];
  };

  assert.deepEqual(uninstallCalls, [SITE_PLUGIN.id]);
  assert.equal(out.pluginId, SITE_PLUGIN.id);
  assert.deepEqual([...out.clearedWorkspaceIds].sort(), ["other-ws", WORKSPACE_ID].sort());

  const remaining = await pluginActivationRepo.listAll();
  assert.equal(remaining.filter((a) => a.pluginId === SITE_PLUGIN.id).length, 0, "every activation row for this plugin must be gone");
});

test("plugins_uninstall: a plugin never activated anywhere uninstalls cleanly with an empty clearedWorkspaceIds", async () => {
  const { deps, uninstallCalls } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  const out = (await wired(deps, "plugins_uninstall").handler(executionContext({ pluginId: SITE_PLUGIN.id }))) as { clearedWorkspaceIds: string[] };
  assert.deepEqual(uninstallCalls, [SITE_PLUGIN.id]);
  assert.deepEqual(out.clearedWorkspaceIds, []);
});

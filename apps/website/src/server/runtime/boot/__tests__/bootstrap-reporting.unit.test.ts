import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { TovuSeedBundledAgentPluginsResult } from "#src/features/agent-plugins/lifecycle";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";

const lifecycle = await import("#src/features/agent-plugins/lifecycle");
const tokens = await import("#src/features/agent-plugins/import-access-token");
const renames = await import("#src/features/agent-plugins/apply-tool-renames");
const faces = await import("#src/features/agent-plugins/provider-plugin-link");
const catalog = await import("#src/features/agent-plugins/bundled-catalog");
const grants = await import("#src/features/agent-plugins/grant-signed-in-defaults");
const soonLock = await import("#src/features/agent-plugins/soon-lock");
const calls: string[] = [];
let report: TovuSeedBundledAgentPluginsResult = { sourceRoot: "bundled", outcomes: [], retirements: [] };
// Boot-warning inputs (plugins plan v2 §3.4): mutated per case, read by bootstrap at call time.
const selection = new Map<string, string>();
let activations: { schemaVersion: 1; plugins: Record<string, { enabled: boolean }> } = { schemaVersion: 1, plugins: {} };
let activationsFailure: Error | undefined;
let installed: { pluginId: string }[] = [];
mock.module("#src/features/agent-plugins/lifecycle", { namedExports: { ...lifecycle,
  seedBundledAgentPlugins: async () => { calls.push("seed"); return report; },
  listInstalledPlugins: async () => installed,
  explicitRootAgentPluginActivations: { ...lifecycle.explicitRootAgentPluginActivations,
    readAgentPluginActivations: async () => { if (activationsFailure) throw activationsFailure; return activations; } },
} });
mock.module("#src/features/agent-plugins/bundled-catalog", { namedExports: { ...catalog, SELECTED_AGENT_PLUGIN_PACKAGES: selection } });
mock.module("#src/features/agent-plugins/import-access-token", { namedExports: { ...tokens,
  importAgentPluginAccessTokensFromEnv: async () => { calls.push("tokens"); },
} });
mock.module("#src/features/agent-plugins/apply-tool-renames", { namedExports: { ...renames,
  applyAgentPluginToolRenames: async () => { calls.push("renames"); },
} });
mock.module("#src/features/agent-plugins/provider-plugin-link", { namedExports: { ...faces,
  syncProviderFaces: async () => { calls.push("faces"); },
} });
mock.module("#src/features/agent-plugins/soon-lock", { namedExports: { ...soonLock,
  lockSoonAgentPlugins: async () => { calls.push("soon-lock"); return []; },
} });
mock.module("#src/features/agent-plugins/grant-signed-in-defaults", { namedExports: { ...grants,
  grantDeclaredToolsAtBoot: async ({ deps: input }: Parameters<typeof grants.grantDeclaredToolsAtBoot>[0]) => {
    assert.equal(input.applyAccess, bundledDeps.mcp.applyAccess);
    assert.equal(input.workspaceId, bundledDeps.workspaceId);
    assert.equal(input.agentPluginLayout, bundledDeps.agentPluginLayout);
    calls.push("grants");
  },
} });
const { buildBootModules, bundledAgentPluginBootWarnings } = await import("../bootstrap.js");
// Only the bundled prepare step runs; its collaborators are replaced above.
const unusedMcpPort = async () => assert.fail("boot reporting must not access real connections");
const mcp: NewsletterRouteDeps["mcp"] = {
  repo: { findByServerId: unusedMcpPort, updateIfVersion: unusedMcpPort, deleteByServerId: unusedMcpPort, updateAccessIfCurrent: unusedMcpPort },
  applyAccess: unusedMcpPort, saveServer: unusedMcpPort,
  classifyError: () => assert.fail("boot reporting must not classify connection errors"),
  notifyRosterChanged: unusedMcpPort,
};
const bundledDeps = { mcp, workspaceId: "test-workspace", agentPluginLayout: { forWorkspace: (_required: { workspaceId: string }) => ({ root: "/workspace" }) } };
const deps = bundledDeps as NewsletterRouteDeps;

function resetWarningInputs(): void {
  selection.clear();
  activations = { schemaVersion: 1, plugins: {} };
  activationsFailure = undefined;
  installed = [];
}

test("TW2: bundled preparation reports failures and retirements in order before tokens and renames", async (t) => {
  calls.length = 0;
  resetWarningInputs();
  t.mock.method(console, "warn", (line: string) => { calls.push(`warn:${line}`); });
  t.mock.method(console, "info", (line: string) => { calls.push(`info:${line}`); });
  report = { sourceRoot: "bundled", ledgerFailure: "ledger unavailable", outcomes: [
    { pluginId: "ok", status: "seeded", archiveDigest: "digest", activationRecorded: true },
    { pluginId: "broken", status: "failed", reason: "bad package" },
  ], retirements: [
    { pluginId: "absent", successorId: "new", status: "absent" },
    { pluginId: "failed", successorId: "new", status: "failed", reason: "busy" },
    { pluginId: "old", successorId: "new", status: "retired", removedDigests: [], activationRemoved: true, ledgerEntryRemoved: true, successor: "not-needed" },
    { pluginId: "disabled", successorId: "new", status: "retired", removedDigests: [], activationRemoved: true, ledgerEntryRemoved: true, successor: "left-disabled-by-operator" },
    // A parked plugin (formspree, 2026-11-10) retires into nothing: no "moved into ''".
    { pluginId: "parked", successorId: "", successorIds: [], status: "retired", removedDigests: [], activationRemoved: true, ledgerEntryRemoved: true, successor: "not-needed", successors: {} },
  ] };
  const bundled = buildBootModules(deps, { useMemory: true, defaultContentDbPath: () => ":memory:" }).find(module => module.name === "bundled-agent-plugins");
  assert.ok(bundled);
  await bundled.prepare();
  assert.deepEqual(calls, [
    "seed",
    "warn:[bundled-agent-plugins] 'broken' could not be installed from this build (bad package); the copy already installed, if any, stays in use. Restart Tovu to try again; if it keeps failing, reinstall 'broken' from Agent Plugins.",
    "warn:[bundled-agent-plugins] the bundled-digest ledger could not be written: ledger unavailable",
    "warn:[bundled-agent-plugins] retired 'failed' could not be removed: busy",
    "info:[bundled-agent-plugins] retired 'old' (moved into 'new'; successor: not-needed)",
    "info:[bundled-agent-plugins] retired 'disabled' (moved into 'new'; successor: left-disabled-by-operator)",
    "warn:[bundled-agent-plugins] 'disabled' was enabled but its successor 'new' is turned off by an operator and was left off — turn it on in Agent Plugins to keep that capability",
    "info:[bundled-agent-plugins] retired 'parked' (no successor)",
    "faces", "soon-lock", "tokens", "renames", "grants",
  ]);
  calls.length = 0;
  report = { sourceRoot: "bundled", outcomes: [], retirements: [] };
  await bundled.prepare();
  assert.deepEqual(calls, ["seed", "faces", "soon-lock", "tokens", "renames", "grants"]);
});

test("publisher-ID upgrades are reported in plain words, and an explained plugin gets no second, generic seed line", async (t) => {
  calls.length = 0;
  resetWarningInputs();
  t.mock.method(console, "warn", (line: string) => { calls.push(`warn:${line}`); });
  t.mock.method(console, "info", (line: string) => { calls.push(`info:${line}`); });
  report = { sourceRoot: "bundled", retirements: [], outcomes: [
    { pluginId: "cloudflare", status: "seeded", archiveDigest: "digest", activationRecorded: false },
    { pluginId: "github", status: "failed", reason: "Error" },
    { pluginId: "fly", status: "failed", reason: "Error" },
  ], idUpgrades: [
    { status: "upgraded", pluginId: "cloudflare", to: "jini/cloudflare", moved: [{ packageRoot: "/ws/cloudflare/package/sha256/a", savedAt: "/ws/.bundled-id-upgrade/cloudflare/a" }] },
    { status: "held", pluginId: "github", to: "jini/github", reason: "its installed files were changed after install" },
    { status: "restored", pluginId: "fly", to: "jini/fly", moved: [] },
  ] };
  const bundled = buildBootModules(deps, { useMemory: true, defaultContentDbPath: () => ":memory:" }).find(module => module.name === "bundled-agent-plugins");
  assert.ok(bundled);
  await bundled.prepare();
  assert.deepEqual(calls, [
    "seed",
    "info:[bundled-agent-plugins] 'cloudflare' moved to its new publisher ID 'jini/cloudflare'; its on/off switch, settings, data and memory are kept. The previous copy is saved in /ws/.bundled-id-upgrade/cloudflare/a",
    "warn:[bundled-agent-plugins] 'github' stays on its current version because its installed files were changed after install, so Tovu will not replace it with 'jini/github'. It keeps working. To get the new version, uninstall 'github' and install it again from Agent Plugins; if another publisher made it, ask them for an update.",
    "warn:[bundled-agent-plugins] 'fly' could not move to 'jini/fly' because the new version did not install; the previous version was put back and stays in use. Restart Tovu to try again.",
    "faces", "soon-lock", "tokens", "renames", "grants",
  ]);
});

const SEEDED_NOTHING = "warn:[bundled-agent-plugins] this build selects 2 plugin packages (jev, site-import) but no bundled plugin was found in bundled; rebuild Tovu (in development: npm run agent-plugins:compose, then restart)";

test("D0a: boot warns, never refuses, when the bundled folder seeded nothing although packages are selected", async (t) => {
  calls.length = 0;
  resetWarningInputs();
  t.mock.method(console, "warn", (line: string) => { calls.push(`warn:${line}`); });
  selection.set("jev", "@jini-ai/agent-plugins/jev").set("site-import", "@jini-ai/agent-plugins/site-import");
  report = { sourceRoot: "bundled", outcomes: [], retirements: [] };
  const bundled = buildBootModules(deps, { useMemory: true, defaultContentDbPath: () => ":memory:" }).find(module => module.name === "bundled-agent-plugins");
  assert.ok(bundled);
  await bundled.prepare();
  assert.deepEqual(calls, ["seed", SEEDED_NOTHING, "faces", "soon-lock", "tokens", "renames", "grants"]);
});

test("D0a: an enabled plugin with neither a bundled source nor an installed package is named once; present ones are not", async (t) => {
  calls.length = 0;
  resetWarningInputs();
  t.mock.method(console, "warn", (line: string) => { calls.push(`warn:${line}`); });
  report = { sourceRoot: "bundled", outcomes: [
    { pluginId: "seeded", status: "seeded", archiveDigest: "digest", activationRecorded: true },
    { pluginId: "broken", status: "failed", reason: "bad package" },
  ], retirements: [] };
  activations = { schemaVersion: 1, plugins: { seeded: { enabled: true }, broken: { enabled: true }, uploaded: { enabled: true }, gone: { enabled: true }, off: { enabled: false } } };
  installed = [{ pluginId: "uploaded" }];
  const bundled = buildBootModules(deps, { useMemory: true, defaultContentDbPath: () => ":memory:" }).find(module => module.name === "bundled-agent-plugins");
  assert.ok(bundled);
  await bundled.prepare();
  assert.deepEqual(calls, [
    "seed",
    "warn:[bundled-agent-plugins] 'broken' could not be installed from this build (bad package); the copy already installed, if any, stays in use. Restart Tovu to try again; if it keeps failing, reinstall 'broken' from Agent Plugins.",
    "warn:[bundled-agent-plugins] 'gone' is turned on, but this build does not ship it and it is not installed; add its package to the build, or turn it off in Agent Plugins",
    "faces", "soon-lock", "tokens", "renames", "grants",
  ]);
});

test("D0a: an unreadable activations file costs only the enabled-plugin check; the seeded-nothing warning and boot continue", async (t) => {
  calls.length = 0;
  resetWarningInputs();
  t.mock.method(console, "warn", (line: string) => { calls.push(`warn:${line}`); });
  selection.set("jev", "@jini-ai/agent-plugins/jev").set("site-import", "@jini-ai/agent-plugins/site-import");
  activationsFailure = new Error("activations.json is unreadable");
  report = { sourceRoot: "bundled", outcomes: [], retirements: [] };
  const bundled = buildBootModules(deps, { useMemory: true, defaultContentDbPath: () => ":memory:" }).find(module => module.name === "bundled-agent-plugins");
  assert.ok(bundled);
  await bundled.prepare();
  assert.deepEqual(calls, [
    "seed",
    "warn:[bundled-agent-plugins] could not compare enabled plugins with this build: activations.json is unreadable",
    SEEDED_NOTHING,
    "faces", "soon-lock", "tokens", "renames", "grants",
  ]);
});

test("D0a: no selection and an empty folder is quiet; an id both seeded and enabled is quiet", () => {
  assert.deepEqual(bundledAgentPluginBootWarnings({ sourceRoot: "bundled", seededIds: [], selectedIds: [], enabledIds: [], installedIds: [] }), []);
  assert.deepEqual(bundledAgentPluginBootWarnings({ sourceRoot: "bundled", seededIds: ["fly"], selectedIds: ["fly"], enabledIds: ["fly"], installedIds: [] }), []);
  assert.deepEqual(bundledAgentPluginBootWarnings({ sourceRoot: "bundled", seededIds: ["fly"], selectedIds: [], enabledIds: ["a", "b"], installedIds: ["b"] }).length, 1);
});

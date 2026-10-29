import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { SeedBundledAgentPluginsResult } from "#src/features/agent-plugins/lifecycle";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";

const lifecycle = await import("#src/features/agent-plugins/lifecycle");
const tokens = await import("#src/features/agent-plugins/import-access-token");
const renames = await import("#src/features/agent-plugins/apply-tool-renames");
const faces = await import("#src/features/agent-plugins/provider-plugin-link");
const calls: string[] = [];
let report: SeedBundledAgentPluginsResult = { sourceRoot: "bundled", outcomes: [], retirements: [] };
mock.module("#src/features/agent-plugins/lifecycle", { namedExports: { ...lifecycle,
  seedBundledAgentPlugins: async () => { calls.push("seed"); return report; },
} });
mock.module("#src/features/agent-plugins/import-access-token", { namedExports: { ...tokens,
  importAgentPluginAccessTokensFromEnv: async () => { calls.push("tokens"); },
} });
mock.module("#src/features/agent-plugins/apply-tool-renames", { namedExports: { ...renames,
  applyAgentPluginToolRenames: async () => { calls.push("renames"); },
} });
mock.module("#src/features/agent-plugins/provider-plugin-link", { namedExports: { ...faces,
  syncProviderFaces: async () => { calls.push("faces"); },
} });
const { buildBootModules } = await import("../bootstrap.js");
// Only the bundled prepare step runs; its collaborators are replaced above.
const bundledDeps = { workspaceId: "test-workspace" } satisfies Pick<NewsletterRouteDeps, "workspaceId">;
const deps = bundledDeps as NewsletterRouteDeps;

test("TW2: bundled preparation reports failures and retirements in order before tokens and renames", async (t) => {
  calls.length = 0;
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
  ] };
  const bundled = buildBootModules(deps, { useMemory: true, defaultContentDbPath: () => ":memory:" }).find(module => module.name === "bundled-agent-plugins");
  assert.ok(bundled);
  await bundled.prepare();
  assert.deepEqual(calls, [
    "seed",
    "warn:[bundled-agent-plugins] 'broken' could not be seeded: bad package",
    "warn:[bundled-agent-plugins] the bundled-digest ledger could not be written: ledger unavailable",
    "warn:[bundled-agent-plugins] retired 'failed' could not be removed: busy",
    "info:[bundled-agent-plugins] retired 'old' (moved into 'new'; successor: not-needed)",
    "info:[bundled-agent-plugins] retired 'disabled' (moved into 'new'; successor: left-disabled-by-operator)",
    "warn:[bundled-agent-plugins] 'disabled' was enabled but its successor 'new' is turned off by an operator and was left off — turn it on in Agent Plugins to keep that capability",
    "faces", "tokens", "renames",
  ]);
  calls.length = 0;
  report = { sourceRoot: "bundled", outcomes: [], retirements: [] };
  await bundled.prepare();
  assert.deepEqual(calls, ["seed", "faces", "tokens", "renames"]);
});

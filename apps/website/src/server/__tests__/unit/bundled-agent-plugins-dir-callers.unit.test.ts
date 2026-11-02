import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { bundledAgentPluginsDir } from "#src/platform/site-dir/product-root";
import { nativeToolMetadata } from "#src/contracts/core/tool-metadata/index";
import { bundledContributionSources } from "#src/features/agent-plugins/bundled-contribution-sources";
import type { LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import { toolSearchKeywords } from "#src/assistant/tool-search-keywords";
import { getDeployOpsAgentToolCatalog } from "#src/features/deployments/deploy-ops/agent-tools";
import { loadDeployOpsRegistry } from "#src/features/deployments/deploy-ops/registry";

/**
 * @file Bug class: a server caller that builds `<product>/content/agent-plugins` itself instead of
 * asking `bundledAgentPluginsDir()`. Since the generic plugins moved to `@jini-ai/agent-plugins`,
 * `npm run dev` and the unpackaged desktop point `TOVU_BUNDLED_AGENT_PLUGINS_DIR` at a COMPOSED root
 * (Tovu content + the selected Jini packages). A caller that ignores the env sees only Tovu's own
 * content, so every moved plugin silently drops out of tool keywords, deploy ops, deploy targets and
 * deploy-config candidates. The built dist hides the bug: it ships the composed root at the default.
 *
 * Each case puts a plugin ONLY in a temp "composed" root named by the env, the way dev does, and
 * asserts the caller finds it. The last case guards the whole class: no production module may
 * compose the path or read the env except the one owner.
 */

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const OWNER = path.join("platform", "site-dir", "product-root.ts");
const PLUGIN_ID = "composed-only";
const PLATFORM_ID = "composed-only-host";

/** A composed bundled root holding one plugin that Tovu's `content/agent-plugins` does not ship. */
function composedRoot(t: TestContext, manifest: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(tmpdir(), "tovu-composed-bundled-"));
  const previous = process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
  process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = root;
  t.after(() => {
    if (previous === undefined) delete process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
    else process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  });
  const packageRoot = path.join(root, PLUGIN_ID);
  mkdirSync(packageRoot);
  writeFileSync(path.join(packageRoot, "plugin.json"), JSON.stringify({ name: PLUGIN_ID, version: "1.0.0", ...manifest }));
  writeFileSync(path.join(packageRoot, "tovu-deploy-ops.json"), JSON.stringify({ schemaVersion: 1, platforms: [{ id: PLATFORM_ID, label: "Composed Only", hosts: ["api.example.com"], module: "ops.mjs" }] }));
  writeFileSync(path.join(packageRoot, "ops.mjs"), "export default { status() {}, logs() {} };\n");
  return root;
}

test("the owner answers the composed root the host names, else the product's content/agent-plugins", () => {
  assert.equal(bundledAgentPluginsDir({}, { env: { TOVU_BUNDLED_AGENT_PLUGINS_DIR: "/composed" } }), "/composed");
  assert.match(bundledAgentPluginsDir({}, { env: {} }), /[/\\]content[/\\]agent-plugins$/);
});

test("tool search keywords come from a plugin present only in the composed root", (t) => {
  const toolId = Object.keys(nativeToolMetadata.byId)[0];
  assert.ok(toolId, "the native catalog has at least one tool");
  composedRoot(t, { extensions: { tovu: { toolKeywords: { [toolId]: "composedonlyword" } } } });
  assert.match(toolSearchKeywords({}, { sources: bundledContributionSources })[toolId] ?? "", /\bcomposedonlyword\b/);
});

test("the deploy-ops tool catalog lists a platform present only in the composed root", (t) => {
  composedRoot(t, {});
  const enums = getDeployOpsAgentToolCatalog()
    .map(tool => (tool.inputSchema as { properties?: { platform?: { enum?: readonly string[] } } }).properties?.platform?.enum)
    .filter((values): values is readonly string[] => values !== undefined);
  assert.ok(enums.length > 0, "deploy-ops tools take a platform");
  for (const values of enums) assert.ok(values.includes(PLATFORM_ID), `platform enum ${JSON.stringify(values)} misses ${PLATFORM_ID}`);
});

test("the installed deploy-ops registry treats a plugin present only in the composed root as an owner", async (t) => {
  composedRoot(t, {});
  const loadContributions: LoadPluginContributions = async (_input, options) => {
    const refusal = options?.packageRefusal?.({ plugin: { pluginId: PLUGIN_ID, packageRoot: "/installed/composed-only" } });
    return { items: [], refusals: refusal === undefined ? [] : [refusal] };
  };
  assert.deepEqual((await loadDeployOpsRegistry({ workspaceId: "ws" }, { loadContributions })).refusals, []);
});

/** Production `.ts` files under `src/`, relative to it; tests and fixtures excluded. O(files). */
function productionSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "node_modules" ? [] : productionSources(full);
    return /\.ts$/.test(entry.name) && !/\.(test|d)\.ts$/.test(entry.name) ? [path.relative(SRC_ROOT, full)] : [];
  });
}

test("no production module composes content/agent-plugins or reads TOVU_BUNDLED_AGENT_PLUGINS_DIR but the owner", () => {
  // Also the constant form (`"content", AGENT_PLUGINS_DIRECTORY`) the hermetic app root used.
  const composes = /["']content["']\s*,\s*(?:["']agent-plugins["']|[A-Z_]*AGENT_PLUGINS[A-Z_]*\b)/;
  const readsEnv = /\.TOVU_BUNDLED_AGENT_PLUGINS_DIR\b/;
  const offenders = productionSources(SRC_ROOT)
    .filter(file => file !== OWNER)
    .filter((file) => { const text = readFileSync(path.join(SRC_ROOT, file), "utf8"); return composes.test(text) || readsEnv.test(text); });
  assert.deepEqual(offenders, [], "call bundledAgentPluginsDir() from platform/site-dir/product-root.ts instead");
});

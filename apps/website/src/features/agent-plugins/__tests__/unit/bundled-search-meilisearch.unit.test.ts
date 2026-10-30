import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import { resolveSiteRoot } from "#src/platform/site-dir/index";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";

// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "../../activation-effects.js";
const { readAgentPluginActivations, setAgentPluginActivation } = agentPluginActivations;
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSearchProviderRegistry } from "@jini-ai/search";
import { contributeProviders } from "@jini-ai/search/contribution";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";

import { forceRemove } from "../fixtures/force-remove.js";

import { packAgentPluginDirectory, seedBundledAgentPlugins } from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { parseAgentPluginMcpConfig } from "../../mcp-metadata.js";
import { SEARCH_PROVIDERS_FILENAME, loadSearchProviderContributions, loadSearchProviderContributionsFromSource } from "../../search-provider-registry.js";

/**
 * @file The bundled `meilisearch` Agent Plugin as a PACKAGE: valid manifest, zero MCP servers (its
 * provider runs in-process through the search-provider registry), packable, seeded SWITCHED OFF (a
 * vendor receives site content only after the owner opts in), and its provider reaching the
 * site-search provider registry only through the gated installed path once switched on. The
 * provider's behavior is covered by the conformance and provider test files next to this one.
 */

const CONTENT_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const PACKAGE_ROOT = path.join(CONTENT_ROOT, "meilisearch");
const WORKSPACE_ID = "workspace-local";

async function readPackageJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(PACKAGE_ROOT, relativePath), "utf8"));
}

test("plugin.json parses under the Agent Plugins v1.0.0 validator with no warnings, provides site-search and says vendors get public content only", async () => {
  const value = await readPackageJson("plugin.json");
  const parsed = parseAgentPluginManifest({ value });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "meilisearch");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
  const manifest = value as { description: string; extensions: { tovu: { provides: string[] } } };
  assert.deepEqual(manifest.extensions.tovu.provides, ["site-search"]);
  assert.match(manifest.description, /PUBLIC content only/);
});

test("mcp.json declares ZERO servers — the provider runs in-process through the search-provider registry", async () => {
  const parsed = parseAgentPluginMcpConfig({ value: await readPackageJson("mcp.json") });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok ? parsed.config.serverIds : ["unreachable"], []);
});

test("the package packs through the real packer with its manifest, provider module and skill", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);
  for (const file of ["plugin.json", "mcp.json", SEARCH_PROVIDERS_FILENAME, "providers/meilisearch.mjs", "skills/meilisearch/SKILL.md"]) {
    assert.ok(packed.files.includes(file), `${file} must survive packing`);
  }
});

test("from source, the manifest yields exactly the meilisearch provider, which the site-search registry accepts as a plugin provider", async () => {
  const loaded = await loadSearchProviderContributionsFromSource({ pluginId: "meilisearch", packageRoot: PACKAGE_ROOT });
  assert.deepEqual(loaded.refusals, []);
  assert.deepEqual(loaded.items.map((item) => [item.contract, item.pluginId, item.definition.id, item.definition.label]), [["search", "meilisearch", "meilisearch", "Meilisearch"]]);

  const registry = createSearchProviderRegistry();
  assert.deepEqual(contributeProviders({ registry, loaded }), { accepted: ["meilisearch"], refusals: [] });
  assert.deepEqual([registry.get({ id: "meilisearch" })?.origin, registry.get({ id: "meilisearch" })?.pluginId], ["plugin", "meilisearch"]);
});

async function withAgentPluginsDir<T>(fn: (layout: ReturnType<typeof resolveAgentPluginLayout>) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-meilisearch-plugin-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }));
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

test("seeded by the real seeder, meilisearch is SWITCHED OFF and contributes nothing; switched on, the installed digest contributes its provider", async () => {
  await withAgentPluginsDir(async (layout) => {
    const seeded = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal(seeded.outcomes.find((outcome) => outcome.pluginId === "meilisearch")?.status, "seeded");
    const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
    assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins.meilisearch?.enabled, false, "no site content goes to a vendor before the owner opts in");

    const loadContributions = createTovuAgentPluginLifecycle({ layout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }) }, { bundledSourceRoot: bundledAgentPluginsDir() }).loadPluginContributions;
    const off = await loadSearchProviderContributions({ workspaceId: WORKSPACE_ID }, { loadContributions });
    assert.deepEqual(off.items, []);

    await setAgentPluginActivation({ workspaceRoot, pluginId: "meilisearch", enabled: true, actor: "test:operator" });
    const on = await loadSearchProviderContributions({ workspaceId: WORKSPACE_ID }, { loadContributions });
    assert.deepEqual(on.refusals, []);
    assert.deepEqual(on.items.map((item) => [item.pluginId, item.definition.id]), [["meilisearch", "meilisearch"]]);
    assert.equal(typeof on.items[0]?.definition.provider.query, "function");
  });
});

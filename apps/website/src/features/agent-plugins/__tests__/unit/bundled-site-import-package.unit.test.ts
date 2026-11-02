import { resolveSiteRoot } from "#src/platform/site-dir/index";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { agentPluginSourceDir } from "../../../../../../../development/test-support/agent-plugin-source.mjs";
import { agentPluginActivations } from "../../activation-effects.js";
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED } from "../../bundled-catalog.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { seedBundledAgentPlugins } from "../../lifecycle.js";
import { parseAgentPluginMcpConfig } from "../../mcp-metadata.js";
import { selectedPluginSourceRoot, type DisposableSourceRoot } from "../fixtures/bundled-source-root.js";
import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file Tovu's side of the `site-import` Agent Plugin, which now ships as
 * `@jini-ai/plugin-site-import` and is read here from that selected package.
 *
 * 1. **Host acceptance** — both manifests parse under this host's validators, and `mcp.json`
 *    declares ZERO servers (`capability-projection.ts` marks every plugin-declared MCP server
 *    unavailable, so one here would be decoration that looks like a capability).
 *
 * 2. **On by default** (owner decision 2026-10-08) — seeded enabled on a fresh site, switched on
 *    for an existing site whose record is the seeder's untouched "off", and never re-enabled once
 *    an operator turned it off.
 *
 * Moved out (D-W1, 2026-11-02): the skill's text pins (safety rules, verbatim copy, one question,
 * homepage at `/`, references, vendor-neutral) run with the plugin in Jini
 * (`packages/agent-plugins/site-import/__tests__`); the tool-name drift guard and the Step 6
 * reader names run on Tovu's overlay (`content/agent-plugin-overlays/site-import/__tests__`),
 * because Tovu's tool names live there now.
 */

const PACKAGE_ROOT = agentPluginSourceDir({ pluginId: "site-import" });
const SKILL_DIR = path.join(PACKAGE_ROOT, "skills", "site-import");
const PLUGIN_ID = "site-import";
const WORKSPACE_ID = "workspace-local";
const { readAgentPluginActivations, recordBundledAgentPluginIfAbsent, setAgentPluginActivation } = agentPluginActivations;

let source: DisposableSourceRoot;
before(async () => { source = await selectedPluginSourceRoot({ pluginIds: [PLUGIN_ID] }); });
after(() => source.dispose());

/** Runs `fn` against a throwaway agent-plugins root (the layout resolves it from env at call time). */
async function withAgentPluginsDir<T>(fn: (layout: ReturnType<typeof resolveAgentPluginLayout>) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-site-import-plugin-"));
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

async function siteImportEnabled(layout: ReturnType<typeof resolveAgentPluginLayout>): Promise<boolean | undefined> {
  const activations = await readAgentPluginActivations({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root });
  return activations.plugins[PLUGIN_ID]?.enabled;
}

async function readPackageFile(relativePath: string): Promise<string> {
  return readFile(path.join(PACKAGE_ROOT, relativePath), "utf8");
}

test("site-import is on the seeded-enabled list", () => {
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has(PLUGIN_ID), true);
});

test("a fresh site seeds site-import ENABLED with no owner action", async () => {
  await withAgentPluginsDir(async (layout) => {
    const seeded = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: source.root });
    assert.equal(seeded.outcomes.find((outcome) => outcome.pluginId === PLUGIN_ID)?.status, "seeded");
    assert.equal(await siteImportEnabled(layout), true);
  });
});

test("an existing site whose record is the seeder's untouched OFF is switched on at the next boot", async () => {
  await withAgentPluginsDir(async (layout) => {
    // What a site seeded before 2026-10-08 carries: the seeder's own disabled record, never touched.
    await recordBundledAgentPluginIfAbsent({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root, pluginId: PLUGIN_ID });
    assert.equal(await siteImportEnabled(layout), false);
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: source.root });
    assert.equal(await siteImportEnabled(layout), true);
  });
});

test("an owner who switched site-import off stays off across boots", async () => {
  await withAgentPluginsDir(async (layout) => {
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: source.root });
    await setAgentPluginActivation({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root, pluginId: PLUGIN_ID, enabled: false, actor: "test:operator" });
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: source.root });
    assert.equal(await siteImportEnabled(layout), false);
  });
});

test("plugin.json parses under the Agent Plugins v1.0.0 validator with no warnings", async () => {
  const parsed = parseAgentPluginManifest({ value: JSON.parse(await readPackageFile("plugin.json")) });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "site-import");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

test("plugin.json's keywords carry the words an owner uses when asking to move a site", async () => {
  const parsed = parseAgentPluginManifest({ value: JSON.parse(await readPackageFile("plugin.json")) });
  assert.equal(parsed.ok, true);
  const keywords = new Set(parsed.ok ? (parsed.manifest.keywords ?? []) : []);
  for (const expected of ["import", "migrate", "website", "sitemap", "wordpress", "posts", "redirects"]) {
    assert.ok(keywords.has(expected), `plugin.json keywords must include '${expected}' — it is a primary discovery term`);
  }
});

test("mcp.json declares ZERO servers — the plugin runs entirely on native tools", async () => {
  const parsed = parseAgentPluginMcpConfig({ value: JSON.parse(await readPackageFile("mcp.json")) });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok ? parsed.config.serverIds : ["unreachable"], []);
});

test("the eponymous skill exists and its frontmatter names it", async () => {
  const markdown = await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  assert.match(markdown, /^---\nname: site-import\ndescription: .+\n/);
});

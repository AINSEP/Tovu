import fs from "node:fs";
import path from "node:path";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { defaultBundledSourceRoot } from "#src/features/agent-plugins/supersession";
import { readTemplate } from "#src/platform/site-dir/read-template";
import { writeExclusive } from "./import-restore-placement.js";
import type { ArchivePlugin } from "./archive-manifest.js";

/** Functional private staging state; discarded with the import stage, never an import history report. */
export interface ImportedExtensionState {
  plugins: readonly ArchivePlugin[];
  trustedPlugins: readonly ArchivePlugin[];
  modified: readonly string[];
}

/** Seed only THIS install's code before applying bundled-identical activation decisions.
 * Shipped code remains quarantined; an unrecognised/edited version explicitly stays off.
 * @complexity O(local bundled package bytes + imported memory bytes), bounded by share caps.
 */
export async function restoreImportedPluginState(required: { root: string; dir: string; state: ImportedExtensionState; files: readonly string[] }, optional: { sourceRoot?: string } = {}): Promise<ReadonlySet<string>> {
  const placed = new Set<string>();
  if (!required.state.plugins.some(plugin => plugin.kind === "agent")) return placed;
  const layout = resolveAgentPluginLayout({ siteDir: required.dir, env: {} });
  const lifecycle = createTovuAgentPluginLifecycle({ layout });
  const workspaceId = readTemplate({ templateId: "starter" }).seed.workspace.id;
  const sourceRoot = optional.sourceRoot ?? defaultBundledSourceRoot({ env: process.env });
  await lifecycle.seedBundledAgentPlugins({ layout, workspaceId, sourceRoot });
  const workspace = layout.forWorkspace(workspaceId);
  const installed = await lifecycle.listInstalledPlugins(workspace.root);
  const trusted = new Map(required.state.trustedPlugins.map(plugin => [plugin.id, plugin]));
  for (const plugin of required.state.plugins.filter(plugin => plugin.kind === "agent")) {
    const local = installed.find(local => local.pluginId === plugin.id && local.archiveDigest === plugin.digest);
    const enabled = Boolean(local && trusted.has(plugin.id) && !required.state.modified.includes("agent-plugins/" + plugin.id) && plugin.enabled);
    await lifecycle.setAgentPluginActivation({ workspaceRoot: workspace.root, pluginId: plugin.id, enabled, actor: "system:import" });
  }
  const ids = new Set(installed.map(plugin => plugin.pluginId));
  for (const file of required.files) {
    const match = /^agent-plugins\/([^/]+)\/memory\/(notes|learned)\/(.+)$/.exec(file);
    if (!match || !ids.has(match[1]!)) continue;
    const memoryDir = workspace.pluginMemoryDir({ pluginId: match[1]!, kind: match[2] as "notes" | "learned" });
    placed.add(file);
    writeExclusive({ root: required.dir, relative: path.relative(required.dir, path.join(memoryDir, match[3]!)), bytes: fs.readFileSync(path.join(required.root, file)) });
  }
  return placed;
}

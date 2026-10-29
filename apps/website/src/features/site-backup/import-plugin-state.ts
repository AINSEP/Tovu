import fs from "node:fs";
import path from "node:path";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import type { AgentPluginLayout } from "#src/features/agent-plugins/layout";
import { defaultBundledSourceRoot } from "#src/features/agent-plugins/supersession";
import { readTemplate } from "#src/platform/site-dir/index";
import { writeExclusive } from "./import-restore-placement.js";
import type { ArchivePlugin } from "./archive-manifest.js";

type InstalledPlugin = Awaited<ReturnType<ReturnType<typeof createTovuAgentPluginLifecycle>["listInstalledPlugins"]>>[number];
type MemoryDirs = Pick<ReturnType<AgentPluginLayout["forWorkspace"]>, "pluginMemoryDir">;

/** Functional private staging state; discarded with the import stage, never an import history report. */
export interface ImportedExtensionState {
  plugins: readonly ArchivePlugin[];
  trustedPlugins: readonly ArchivePlugin[];
  modified: readonly string[];
  /** Code units staged switched off because this install does not recognise them. Absent in
   * stages written before this field existed. */
  keptOff?: readonly string[];
}

/** Seed only THIS install's code before applying bundled-identical activation decisions.
 * Shipped code remains quarantined (see `importedActivation` for the per-plugin decision).
 * @complexity O(local bundled package bytes + imported memory bytes), bounded by share caps.
 */
export async function restoreImportedPluginState(required: { root: string; dir: string; layout: AgentPluginLayout; state: ImportedExtensionState; files: readonly string[] }, optional: { sourceRoot?: string } = {}): Promise<ReadonlySet<string>> {
  if (!required.state.plugins.some(plugin => plugin.kind === "agent")) return new Set();
  const { layout } = required;
  const lifecycle = createTovuAgentPluginLifecycle({ layout });
  const workspaceId = readTemplate({ templateId: "starter" }).seed.workspace.id;
  const sourceRoot = optional.sourceRoot ?? defaultBundledSourceRoot({ env: process.env });
  await lifecycle.seedBundledAgentPlugins({ layout, workspaceId, sourceRoot });
  const workspace = layout.forWorkspace(workspaceId);
  const installed = await lifecycle.listInstalledPlugins(workspace.root);
  const trusted = new Set(required.state.trustedPlugins.map(plugin => plugin.id));
  for (const plugin of required.state.plugins.filter(plugin => plugin.kind === "agent")) {
    const edited = required.state.modified.includes("agent-plugins/" + plugin.id);
    const enabled = importedActivation({ plugin, installed, trusted, edited });
    if (enabled !== undefined) await lifecycle.setAgentPluginActivation({ workspaceRoot: workspace.root, pluginId: plugin.id, enabled, actor: "system:import" });
  }
  return placeImportedMemory({ root: required.root, dir: required.dir, files: required.files, workspace, pluginIds: new Set(installed.map(plugin => plugin.pluginId)) });
}

/**
 * The activation an imported agent plugin writes, or `undefined` to write none.
 * - This install ships the same id under a different digest (the source ran another Tovu
 *   version) and the copy was not edited: keep this install's own seeded state. An explicit
 *   `false` would read as "disabled by operator" and the boot seeder would preserve it.
 * - Otherwise only bundled-identical, trusted code carries the source's `enabled` over; an
 *   unrecognised or edited version explicitly stays off.
 * `trusted` already excludes edited units.
 */
function importedActivation(required: { plugin: ArchivePlugin; installed: readonly InstalledPlugin[]; trusted: ReadonlySet<string>; edited: boolean }): boolean | undefined {
  const { plugin } = required;
  const local = required.installed.find(local => local.pluginId === plugin.id);
  if (local && local.archiveDigest !== plugin.digest && !required.edited) return undefined;
  return Boolean(local && required.trusted.has(plugin.id) && plugin.enabled);
}

/** Places imported agent-plugin memory for plugins installed here; returns the staged files it placed.
 * @complexity O(files + memory bytes). */
function placeImportedMemory(required: { root: string; dir: string; files: readonly string[]; workspace: MemoryDirs; pluginIds: ReadonlySet<string> }): Set<string> {
  const placed = new Set<string>();
  for (const file of required.files) {
    const match = /^agent-plugins\/([^/]+)\/memory\/(notes|learned)\/(.+)$/.exec(file);
    if (!match || !required.pluginIds.has(match[1]!)) continue;
    const memoryDir = required.workspace.pluginMemoryDir({ pluginId: match[1]!, kind: match[2] as "notes" | "learned" });
    placed.add(file);
    writeExclusive({ root: required.dir, relative: path.relative(required.dir, path.join(memoryDir, match[3]!)), bytes: fs.readFileSync(path.join(required.root, file)) });
  }
  return placed;
}

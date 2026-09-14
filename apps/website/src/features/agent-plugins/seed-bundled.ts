/**
 * @file `seedBundledAgentPlugins()` — installs the Agent Plugins that ship WITH Tovu into a
 * workspace's own package store, and records each one INACTIVE until an operator says otherwise.
 *
 * ---------------------------------------------------------------------------
 * "Bundled but inactive", concretely
 * ---------------------------------------------------------------------------
 * Bundled: the package's real files are tracked in this repository under `content/agent-plugins/<id>/`
 * and copied into `dist/` by `npm run build`, exactly like `content/themes/`. A fresh install has them
 * without downloading anything.
 *
 * Inactive: seeding writes `{ enabled: false, origin: "bundled" }` into the workspace's activation
 * record (`activation.ts`) BEFORE the package can be read by anything, and the two places that
 * consume installed plugins both consult that record:
 *
 * - `tool-registrations.ts` — will not register its `agent_plugin_<id>` tool;
 * - `resolve-agent-plugin-refs.ts` — refuses to inject it even if a composer chip pins it by id.
 *
 * (A third surface, `capability-source.ts`'s `capability_search` discovery, was gated here too
 * until that tool pair was removed 2026-08-26 — see
 * `ADS-memory/knowledge/2026-08-26-removed-capability-search.md`.)
 *
 * So "inactive" means genuinely unexecutable, not merely unadvertised: its skills never reach a
 * prompt, and its tools and MCP servers are never registered.
 *
 * It does NOT mean hidden from the operator. The admin Agent Plugins screen lists every installed
 * plugin, with an inactive one's switch shown off, so a bundled plugin can be found and turned on
 * there (owner decision, 2026-09-13; before it, that screen's default tab listed only active ones).
 * Listing only READS the activation record, so the "absent means active" hazard described below is
 * unaffected.
 *
 * ---------------------------------------------------------------------------
 * Why it runs on every boot
 * ---------------------------------------------------------------------------
 * Seeding is idempotent twice over: `installAgentPlugin` short-circuits when the content digest is
 * already published, and `recordBundledAgentPluginIfAbsent` never overwrites an existing decision.
 * Re-running it therefore costs one directory walk and one hash, and buys two things a one-shot
 * first-run seed would not:
 *
 * 1. A product upgrade that ships a NEW bundled plugin, or a new version of one, reaches existing
 *    workspaces without a migration step.
 * 2. Deleting `activations.json` re-creates the bundled plugin's DISABLED record. Without the
 *    re-run, deleting that file would silently promote every bundled plugin to active, because
 *    `isAgentPluginActive`'s "absent means active" default is what keeps operator-installed plugins
 *    working. The boot-time re-seed is what closes that direction.
 *
 * ---------------------------------------------------------------------------
 * Failure isolation
 * ---------------------------------------------------------------------------
 * One unusable bundled package must never stop a workspace from booting or hide the others. Each is
 * seeded independently and its failure is captured into the returned report, not thrown. The caller
 * decides whether to log it; nothing here writes to the console, so this stays a pure-ish function
 * a test can assert on directly.
 *
 * Architectural role:
 * Composition over `bundled-source-archive.ts` (directory to archive), `install.ts`
 * (`installAgentPlugin`, where every extraction guarantee lives), and `activation.ts` (the record).
 * No guarantee of its own.
 */
import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { recordBundledAgentPluginIfAbsent } from "./activation.js";
import { createBundledSourceArchiveReader, packAgentPluginDirectory } from "./bundled-source-archive.js";
import { installAgentPlugin } from "./install.js";
import type { AgentPluginLayout } from "./layout.js";

export type SeededAgentPluginOutcome =
  | {
      readonly pluginId: string;
      readonly status: "seeded";
      readonly archiveDigest: string;
      /** True when this boot wrote the initial disabled record; false when a decision already
       *  existed and was preserved. */
      readonly activationRecorded: boolean;
    }
  | { readonly pluginId: string; readonly status: "failed"; readonly reason: string };

export interface SeedBundledAgentPluginsResult {
  readonly sourceRoot: string;
  readonly outcomes: readonly SeededAgentPluginOutcome[];
}

export interface SeedBundledAgentPluginsRequired {
  /** The INSTANCE-level layout (`resolveAgentPluginLayout()`), not a pre-resolved workspace one —
   *  `installAgentPlugin` resolves `forWorkspace(workspaceId)` itself, atomically, and this
   *  function passes both through unchanged so that guarantee is not weakened in transit. See
   *  `install.ts`'s SECURITY note on `InstallAgentPluginRequired.layout`. */
  readonly layout: AgentPluginLayout;
  readonly workspaceId: string;
  /** Directory holding one subdirectory per bundled plugin. `deps.ts`'s `bundledAgentPluginsDir()`
   *  in production. */
  readonly sourceRoot: string;
}

/**
 * Installs every bundled Agent Plugin into one workspace and records each inactive-by-default.
 *
 * @returns A per-plugin report. An absent or unreadable `sourceRoot` yields an empty `outcomes`
 * list rather than an error: a build that shipped no bundled plugins is a legitimate configuration,
 * and a self-hosted operator who deleted the directory has made a choice this function should not
 * override by crashing.
 * @throws Nothing. Every per-plugin failure is captured into the report.
 * @complexity O(p) plugins, each O(f) files and O(b) bytes — all bounded by
 * `bundled-source-archive.ts`'s file cap and `install.ts`'s own byte caps.
 */
export async function seedBundledAgentPlugins(
  required: SeedBundledAgentPluginsRequired,
): Promise<SeedBundledAgentPluginsResult> {
  const { layout, workspaceId, sourceRoot } = required;

  const pluginDirNames = await listBundledPluginDirs(sourceRoot);
  const outcomes: SeededAgentPluginOutcome[] = [];

  for (const dirName of pluginDirNames) {
    outcomes.push(await seedOne({ layout, workspaceId, sourceDir: path.join(sourceRoot, dirName), dirName }));
  }

  return { sourceRoot, outcomes };
}

async function seedOne(args: {
  readonly layout: AgentPluginLayout;
  readonly workspaceId: string;
  readonly sourceDir: string;
  readonly dirName: string;
}): Promise<SeededAgentPluginOutcome> {
  try {
    const packed = await packAgentPluginDirectory(args.sourceDir);
    const installed = await installAgentPlugin({
      archive: packed.bytes,
      expectedSha256: packed.sha256,
      archiveReader: createBundledSourceArchiveReader(),
      layout: args.layout,
      workspaceId: args.workspaceId,
    });

    // The plugin's OWN manifest name, not the directory name — `install.ts` reads the id from
    // `plugin.json`, and every consumer keys activation off that same id. Using the folder name
    // here would produce a record nothing ever consults if the two ever disagreed.
    const { recorded } = await recordBundledAgentPluginIfAbsent({
      workspaceRoot: args.layout.forWorkspace(args.workspaceId).root,
      pluginId: installed.pluginId,
    });

    return {
      pluginId: installed.pluginId,
      status: "seeded",
      archiveDigest: installed.archiveDigest,
      activationRecorded: recorded,
    };
  } catch (error) {
    return {
      pluginId: args.dirName,
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Lists the subdirectories of `sourceRoot` that actually look like Agent Plugin packages (they hold
 * a `plugin.json` at their own root, which is where `indexInstalledRoot` looks for it).
 *
 * Filtering here rather than letting the installer reject them keeps a stray `README.md` or an
 * editor's scratch directory from showing up in the report as a failed plugin.
 *
 * @complexity O(d) in the subdirectory count.
 */
async function listBundledPluginDirs(sourceRoot: string): Promise<readonly string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(sourceRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const manifest = await stat(path.join(sourceRoot, entry.name, "plugin.json"));
      if (manifest.isFile()) dirs.push(entry.name);
    } catch {
      // No plugin.json: not a package. Silently skipped — see this function's own doc.
    }
  }
  return dirs.sort();
}

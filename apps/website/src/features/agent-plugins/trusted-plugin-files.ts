
// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "./activation-effects.js";
const { resolveAgentPluginActivation } = agentPluginActivations;
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";


import { preferBundledAgentPluginDigests, readBundledAgentPluginDigests } from "./bundled-digests.js";
import { resolveAgentPluginLayout } from "./layout.js";
import { assertContainedOnDisk, PackagePathViolation } from "./package-paths.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";

/**
 * @file The shared trust gate for plugin-contributed files that core reads or runs: deploy targets
 * (`features/deployments/deploy-targets/registry.ts`), deploy-config generators, credential
 * scheme rules, mail adapters (`./mail-adapter-registry.ts`) and git-host providers
 * (`features/source-control/provider-registry.ts`). One place decides which installed Agent Plugin packages core may take a contribution
 * from, so every seam applies the same rules.
 *
 * A plugin opts in to a seam by shipping that seam's file at its package root (e.g.
 * `tovu-deploy-targets.json`). {@link findTrustedPluginPackages} judges each package that ships it
 * against the gates:
 * 1. ACTIVE by the fail-closed reader (`resolveAgentPluginActivation`) when the seam asks for it
 *    (`requireActive`). An unreadable activation record refuses rather than reading as consent. A
 *    data-only seam may skip this gate; its own file header must say why.
 * 2. Its installed digest is the one `bundled-digests.json` records for it, the build's own seed.
 *    An operator-installed package, or a tampered copy under a bundled id, never contributes
 *    (owner decision 2026-09-29: third-party contributions come later). Always applied.
 *
 * {@link importContainedModule} is the third gate for seams that run code: the module path must
 * resolve inside the package root on disk (`assertContainedOnDisk`) and end in `.mjs` (the caller's
 * descriptor parser checks the extension), so no `package.json` above the install directory can make
 * Node read it as CommonJS.
 *
 * Failure isolation: a refused package comes back as a refusal verdict, never thrown. Only a filesystem
 * fault listing the workspace's package directory itself propagates.
 *
 * Architectural role: `features/agent-plugins` capability. Depends only on this feature's own
 * install, activation and path modules; the seams depend on it, nothing here names one.
 */

/** A package a seam may read: whose it is and where its files live. */
export interface TrustedPluginPackage {
  readonly pluginId: string;
  readonly packageRoot: string;
}

export interface TrustedPluginPackagesQuery {
  readonly workspaceId: string;
  /** The file a plugin ships at its root to opt in to this seam. */
  readonly filename: string;
  /** Plural noun for refusal text, e.g. `"deploy targets"`: "deploy targets from 'x' were not loaded: …". */
  readonly contribution: string;
  /** Apply the activation gate (see this file's header, gate 1). */
  readonly requireActive: boolean;
  /** Return verdicts sorted by plugin id instead of installed order. */
  readonly orderByPluginId?: boolean;
  /** Hears each package the activation gate skips as switched off, e.g. to read its seam file as
   *  data and name the plugin in a refusal. Never called without `requireActive`. */
  readonly onInactive?: (plugin: TrustedPluginPackage) => Promise<void>;
}

/** One installed package that ships the seam's file: trusted, or refused with the full refusal line.
 *  Returned in installed order (or plugin-id order, see `orderByPluginId`) so a seam that interleaves its own per-package refusals keeps them in
 *  the same order as the gate's. */
export type TrustedPluginVerdict = { readonly trusted: TrustedPluginPackage } | { readonly refusal: string };

/**
 * A verdict for every installed package in this workspace that ships `query.filename`, in
 * installed order (bundled digests preferred when a plugin has more than one installed digest).
 * A switched-off plugin is skipped silently (only `onInactive` hears it); every other refusal is reported.
 *
 * @throws Nothing for a plugin-level fault; only a filesystem fault listing the workspace's package
 * directory itself propagates.
 * @complexity O(p) installed plugins, one activation read each for a plugin that ships the file.
 */
export async function findTrustedPluginPackages(query: TrustedPluginPackagesQuery): Promise<readonly TrustedPluginVerdict[]> {
  const layout = resolveAgentPluginLayout().forWorkspace(query.workspaceId);
  const bundled = await readBundledAgentPluginDigests(layout.root);
  const preferred = preferBundledAgentPluginDigests(await listInstalledPlugins(layout.packages), bundled);
  const installed = query.orderByPluginId ? [...preferred].sort((a, b) => a.pluginId.localeCompare(b.pluginId)) : preferred;

  const verdicts: TrustedPluginVerdict[] = [];
  for (const plugin of installed) {
    if (!plugin.files.includes(query.filename)) continue;
    const refusal = await trustRefusal(query, plugin, bundled.get(plugin.pluginId), layout.root);
    const trusted = { pluginId: plugin.pluginId, packageRoot: plugin.packageRoot };
    if (refusal === null) verdicts.push({ trusted });
    else if (refusal === "inactive") await query.onInactive?.(trusted);
    else verdicts.push({ refusal: `${query.contribution} from '${plugin.pluginId}' were not loaded: ${refusal}` });
  }
  return verdicts;
}

/** Why one installed package may not contribute (`"inactive"` = skip silently), or `null` when it may.
 *  @complexity O(1) beyond one activation read. */
async function trustRefusal(
  query: TrustedPluginPackagesQuery,
  plugin: { readonly pluginId: string; readonly archiveDigest: string },
  bundledDigest: string | undefined,
  workspaceRoot: string
): Promise<string | null> {
  if (query.requireActive) {
    const activation = await resolveAgentPluginActivation({ workspaceRoot: workspaceRoot, pluginId: plugin.pluginId });
    if (activation.verdict === "inactive") return "inactive";
    if (activation.verdict === "undetermined") return `its activation could not be read (${activation.reason})`;
  }
  if (bundledDigest !== plugin.archiveDigest) {
    return `only plugins shipped with Tovu may add ${query.contribution} (installed digest ${plugin.archiveDigest.slice(0, 12)} is not the one this build shipped)`;
  }
  return null;
}

/** Reads one file at a trusted package's root as UTF-8. @complexity O(n) in the file size. */
export async function readTrustedPluginFile(plugin: TrustedPluginPackage, filename: string): Promise<string> {
  return readFile(path.join(plugin.packageRoot, filename), "utf8");
}

/**
 * Imports one module from a trusted package after the containment check. Returns the module's
 * default export, or the refusal reason. The caller validates the export's shape.
 *
 * @complexity One `realpath` walk plus one dynamic import (cached by Node per file URL).
 */
export async function importContainedModule(plugin: TrustedPluginPackage, modulePath: string): Promise<{ readonly exported: unknown } | string> {
  let resolved: string;
  try {
    resolved = await assertContainedOnDisk(plugin.packageRoot, modulePath);
  } catch (error) {
    if (error instanceof PackagePathViolation) return `module path '${modulePath}' escapes the plugin root`;
    throw error;
  }
  try {
    const imported = (await import(pathToFileURL(resolved).href)) as { readonly default?: unknown };
    return { exported: imported.default };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

import { requireDeployPlatform } from '@jini-ai/devops/deploy';
import { readFileSync } from "node:fs";
import path from "node:path";
import { bundledAgentPluginsDir } from "#src/platform/site-dir/index";
import { bundledContributionSources } from "../../agent-plugins/bundled-contribution-sources.js";
import { defineExecutablePluginContribution, type LoadPluginContributions, loadPluginContributionsFromSource, type TrustedPluginPackage } from "../../agent-plugins/lifecycle.js";
import { asDeployOpsModule, parseDeployOpsFile as parseDeployOpsDescriptors } from "@jini-ai/devops/deploy";
import type { DeployOpsDescriptor, DeployOpsModule, DeployOpsRegistry, LoadedDeployOps } from "./types.js";

/** Installed modules use the same activation, bundled digest and disk containment gates as deploy targets. */
export const DEPLOY_OPS_FILENAME = "tovu-deploy-ops.json";

/** Parse data only. Duplicate ids, URL hosts and escaping paths refuse the entire manifest. O(platforms).
 *  The parser lives in `@jini-ai/devops/deploy`; this keeps the host's positional signature. */
export function parseDeployOpsFile(raw: string): ReturnType<typeof parseDeployOpsDescriptors> {
  return parseDeployOpsDescriptors({ raw });
}

const opsContribution = defineExecutablePluginContribution<DeployOpsDescriptor, DeployOpsModule>({
  filename: DEPLOY_OPS_FILENAME, contribution: "deploy ops",
  parse: ({ raw }) => parseDeployOpsFile(raw), modulePath: ({ descriptor }) => descriptor.module,
  validate: ({ exported }) => asDeployOpsModule({ exported }),
  refusal: ({ descriptor, reason }) => `deploy ops platform '${descriptor.id}' was not loaded: ${reason}`,
}, {
  onReadError: ({ plugin }) => [`deploy ops from '${plugin.pluginId}' were not loaded: ${DEPLOY_OPS_FILENAME} could not be read`],
  importRefusalReason: "module could not be imported", importErrorReason: "module could not be read or imported",
});

/**
 * Import contained modules; isolate unreadable manifests, invalid exports and missing modules as refusals.
 * @param plugin - Trusted source directory. The caller owns activation/digest gates; this seam is for tests.
 * @returns Loaded modules and refusal messages; never throws for a malformed package.
 * @complexity Time and space: O(platforms), bounded to 32 entries.
 * @example await loadDeployOpsRegistryFromSource({ pluginId: "my-host", packageRoot: bundledRoot });
 */
export async function loadDeployOpsRegistryFromSource(plugin: TrustedPluginPackage, _optional: Record<string, never> = {}): Promise<DeployOpsRegistry> {
  const load = await loadPluginContributionsFromSource({ plugin, definition: opsContribution });
  return buildRegistry(load.items, load.refusals);
}

/** All Tovu bundled ops sources; category parsing and duplicate refusal stay with this registry.
 * @complexity O(p + platforms), one contained import per contribution. */
export async function loadBundledDeployOpsRegistry(required: { readonly sourceRoot: string }, _optional: Record<string, never> = {}): Promise<DeployOpsRegistry> {
  const items: LoadedDeployOps[] = [];
  const refusals: string[] = [];
  for (const plugin of bundledContributionSources({ ...required, filename: DEPLOY_OPS_FILENAME })) {
    const registry = await loadDeployOpsRegistryFromSource(plugin);
    items.push(...registry.list());
    refusals.push(...registry.refusals);
  }
  return buildRegistry(items, refusals);
}

/** Data-only enum discovery for hermetic tool catalogs, never authorization or module loading.
 * Ambiguous ids are omitted, as in the executable registry. @complexity O(p + platforms). */
export function readBundledDeployOpsDescriptors(required: { readonly sourceRoot: string }, _optional: Record<string, never> = {}): readonly DeployOpsDescriptor[] {
  const descriptors = bundledContributionSources({ ...required, filename: DEPLOY_OPS_FILENAME }).flatMap(plugin => {
    try {
      const parsed = parseDeployOpsFile(readFileSync(path.join(plugin.packageRoot, DEPLOY_OPS_FILENAME), "utf8"));
      return parsed.ok ? parsed.descriptors : [];
    } catch { return []; }
  });
  const counts = new Map<string, number>();
  for (const descriptor of descriptors) counts.set(descriptor.id, (counts.get(descriptor.id) ?? 0) + 1);
  return descriptors.filter(descriptor => counts.get(descriptor.id) === 1);
}

/**
 * Load only active, bundled-digest-trusted installed deployment packages; never fall back to source.
 * @param ctx - Workspace whose installed packages and activation records are checked fresh.
 * @returns Loaded modules and refusals, including filesystem faults; no expected failure escapes.
 * @param required - Contribution loader from this boot's lifecycle; no site-dependent module default.
 * @complexity Time: O(bundled sources + installed packages + platforms). Space: O(packages + platforms + refusals).
 * @example await loadDeployOpsRegistry({ workspaceId }, { loadContributions: lifecycle.loadPluginContributions });
 */
export async function loadDeployOpsRegistry(ctx: { workspaceId: string }, required: { readonly loadContributions: LoadPluginContributions }): Promise<DeployOpsRegistry> {
  try {
    // Only packages that ship this category in this build own it. The shared source selector
    // excludes retired packages: an old package retained until its successors are usable must
    // not contribute duplicate ids (duplicates are dropped). Installed activation and digest
    // checks still run in the lifecycle loader; this source list never authorizes an import.
    const owners = new Set(bundledContributionSources({
      sourceRoot: bundledAgentPluginsDir(), filename: DEPLOY_OPS_FILENAME,
    }).map(plugin => plugin.pluginId));
    const load = await required.loadContributions({ ...ctx, definition: opsContribution }, {
      packageRefusal: ({ plugin }) => owners.has(plugin.pluginId) ? undefined : `deploy ops from '${plugin.pluginId}' were not loaded: only bundled plugins shipping ${DEPLOY_OPS_FILENAME} may contribute`,
    });
    return buildRegistry(load.items, load.refusals);
  } catch { return buildRegistry([], ["deploy ops were not loaded: installed plugin packages could not be read"]); }
}

export function requirePlatform(registry:DeployOpsRegistry,id:string):LoadedDeployOps {return requireDeployPlatform({registry,id},{});}
/** Index uniquely claimed ids. Ambiguous ids are refused for all claimants. O(platforms). */
function buildRegistry(loaded: readonly LoadedDeployOps[], inputRefusals: readonly string[]): DeployOpsRegistry {
  const map = new Map<string, LoadedDeployOps>(); const duplicates = new Set<string>(); const refusals = [...inputRefusals];
  for (const platform of loaded) { if (map.has(platform.descriptor.id)) duplicates.add(platform.descriptor.id); else map.set(platform.descriptor.id, platform); }
  for (const id of duplicates) { map.delete(id); refusals.push(`deploy ops platform '${id}' was not loaded: declared more than once`); }
  return { get: id => map.get(id), list: () => [...map.values()], refusals };
}

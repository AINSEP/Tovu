import { bundledContributionSources } from "../agent-plugins/bundled-contribution-sources.js";
import { readFileSync } from "node:fs";
import path from "node:path";

import { defineExecutablePluginContribution, loadPluginContributionsFromSource, type LoadPluginContributions, type PluginContributionDefinition, type TrustedPluginPackage } from "../agent-plugins/lifecycle.js";

import {
  asDeployConfigGeneratorModule, isContainedDeployConfigPath, parseDeployConfigsFile as parseDeployConfigDescriptors,
  type DeployConfigGeneratorDescriptor, type DeployConfigGeneratorRegistry, type LoadedDeployConfigGenerator,
} from "@jini-ai/devops/deploy";

import type { DeployConfigGeneratorModule } from "./deploy-config.js";

/** The generator descriptor, loaded-generator and registry shapes, and the declaration-path guard,
 *  live in `@jini-ai/devops/deploy`; this path keeps the host's existing imports. */
export { isContainedDeployConfigPath };
export type { DeployConfigGeneratorDescriptor, DeployConfigGeneratorRegistry, LoadedDeployConfigGenerator };

/**
 * @file Loads the deploy-config generators behind `tovu deploy config --target <id>` from an Agent
 * Plugin, so core names no hosting vendor. A plugin opts in by shipping
 * {@link DEPLOY_CONFIGS_FILENAME} at its root: `{ schemaVersion: 1, generators: [{ id, label, module }] }`,
 * in the order the CLI lists them. Each `module` is a plain-JS `.mjs` file inside the plugin whose
 * default export is a `DeployConfigGeneratorModule` (`./deploy-config.ts`).
 *
 * Only the SOURCE loader exists today: its one caller, the CLI, runs at the repo root and reads the
 * product's own bundled `content/agent-plugins/<id>/`, the same trust basis as the hermetic
 * composition root. Module imports still go through the shared containment gate
 * (`features/agent-plugins/trusted-plugin-files.ts`). A workspace-installed variant (activation +
 * bundled-digest gates, like `deploy-targets/registry.ts`) is added when an admin route needs one.
 *
 * Failure isolation: a bad manifest drops the plugin's generators, a bad module only itself; every
 * drop is reported in `refusals`, never thrown. Cross-package duplicate ids are refused for all
 * claimants, never silently overwritten.
 *
 * Architectural role: `features/deployments` capability, read by `cli/commands/deploy-config.ts`.
 */

/** The file a plugin ships at its root to contribute deploy-config generators. */
export const DEPLOY_CONFIGS_FILENAME = "tovu-deploy-configs.json";

const configContribution = defineExecutablePluginContribution<DeployConfigGeneratorDescriptor, DeployConfigGeneratorModule>({
  filename: DEPLOY_CONFIGS_FILENAME, contribution: "deploy configs",
  parse: ({ raw }) => parseDeployConfigsFile(raw), modulePath: ({ descriptor }) => descriptor.module,
  validate: ({ exported }) => asDeployConfigGeneratorModule({ exported }),
  refusal: ({ plugin, descriptor, reason }) => `deploy config '${descriptor.id}' from '${plugin.pluginId}' was not loaded: ${reason}`,
}, { onReadError: ({ error }) => (error as NodeJS.ErrnoException).code === "ENOENT" ? [] : undefined });

/**
 * The generators a plugin's SOURCE directory declares, with no install, activation or digest gate.
 * Only for this product's own `content/agent-plugins/<id>/` (the CLI, tests): never point it at
 * anything an operator or a third party can write.
 *
 * @complexity O(g) generators, one import each.
 */
export async function loadDeployConfigGeneratorsFromSource(plugin: TrustedPluginPackage, _optional: Record<string, never> = {}): Promise<DeployConfigGeneratorRegistry> {
  const load = await loadPluginContributionsFromSource({ plugin, definition: configContribution });
  return buildRegistry(load.items, load.refusals);
}

/**
 * The generator ids a plugin's SOURCE directory declares, in declared order, read synchronously from
 * its {@link DEPLOY_CONFIGS_FILENAME} without importing any module. For text built before any async
 * work can run (the CLI's `--target` help). A missing or invalid manifest yields `[]`; the refusal
 * itself is reported when the command actually loads the generators.
 *
 * @complexity O(g) in the declared generator count.
 */
export function readDeployConfigTargetIdsFromSource(plugin: TrustedPluginPackage): readonly string[] {
  let raw: string;
  try {
    raw = readFileSync(path.join(plugin.packageRoot, DEPLOY_CONFIGS_FILENAME), "utf8");
  } catch {
    return [];
  }
  const parsed = parseDeployConfigsFile(raw);
  return parsed.ok ? parsed.descriptors.map((descriptor) => descriptor.id) : [];
}

/** All bundled generators in plugin-id order; refuse every cross-package duplicate.
 * @complexity O(p + generators), one contained import per generator. */
export async function loadBundledDeployConfigGenerators(required: { readonly sourceRoot: string }, _optional: Record<string, never> = {}): Promise<DeployConfigGeneratorRegistry> {
  const items: LoadedDeployConfigGenerator[] = [];
  const refusals: string[] = [];
  for (const plugin of bundledContributionSources({ ...required, filename: DEPLOY_CONFIGS_FILENAME })) {
    const registry = await loadDeployConfigGeneratorsFromSource(plugin);
    items.push(...registry.list());
    refusals.push(...registry.refusals);
  }
  return buildRegistry(items, refusals);
}

/** Sync CLI help uses the same source selection and duplicate policy, without importing modules.
 * @complexity O(p + generators). */
export function readBundledDeployConfigTargetIds(required: { readonly sourceRoot: string }, _optional: Record<string, never> = {}): readonly string[] {
  return readBundledDeployConfigDescriptors(required).map(descriptor => descriptor.id);
}

/** @complexity O(g). */
function buildRegistry(loaded: readonly LoadedDeployConfigGenerator[], refusals: readonly string[]): DeployConfigGeneratorRegistry {
  const byId = new Map<string, LoadedDeployConfigGenerator>();
  const duplicates = new Set<string>();
  for (const generator of loaded) {
    if (byId.has(generator.descriptor.id)) duplicates.add(generator.descriptor.id);
    else byId.set(generator.descriptor.id, generator);
  }
  for (const id of duplicates) byId.delete(id);
  return {
    get: (id) => byId.get(id),
    list: () => [...byId.values()],
    refusals: [...refusals, ...[...duplicates].map(id => `deploy config '${id}' was not loaded: declared more than once`)],
  };
}

/** Synchronous hints from shipped sources, using the generator parser and duplicate-id policy.
 * @param required Product-owned bundled source root. @returns Unambiguous descriptors, without importing modules. */
export function readBundledDeployConfigDescriptors(required: { readonly sourceRoot: string }, _optional = {}): readonly DeployConfigGeneratorDescriptor[] {
  // Composition roots call this eagerly; a missing bundled root yields no hints rather than a boot failure.
  let sources: readonly TrustedPluginPackage[];
  try { sources = bundledContributionSources({ ...required, filename: DEPLOY_CONFIGS_FILENAME }); } catch { return []; }
  const descriptors = sources.flatMap(plugin => {
    try {
      const parsed = parseDeployConfigsFile(readFileSync(path.join(plugin.packageRoot, DEPLOY_CONFIGS_FILENAME), "utf8"));
      return parsed.ok ? parsed.descriptors : [];
    } catch { return []; }
  });
  const counts = new Map<string, number>();
  for (const entry of descriptors) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  return descriptors.filter(entry => counts.get(entry.id) === 1);
}

/** Ordered deploy suggestions; app.json remains the core's neutral convention. */
export function readBundledDeployConfigCandidatePaths(required: { readonly sourceRoot: string }, _optional = {}): readonly string[] {
  const entries = readBundledDeployConfigDescriptors(required).flatMap(entry => entry.candidatePaths ?? []);
  entries.push({ path: "app.json", order: 4 });
  entries.sort((a, b) => a.order - b.order);
  return [...new Set(entries.map(entry => entry.path))];
}

/** Host supplies the single declared workflow to an ops adapter; ambiguity never guesses. */
export function readBundledDeployWorkflowFile(required: { readonly sourceRoot: string }, _optional = {}): string | undefined {
  const files = [...new Set(readBundledDeployConfigDescriptors(required).flatMap(entry => entry.workflowFile === undefined ? [] : [entry.workflowFile]))];
  return files.length === 1 ? files[0] : undefined;
}


/** Installed workflow hints use the same active, trusted lifecycle as deploy ops, without imports. */
export async function loadDeployWorkflowFiles(required: { workspaceId: string; loadContributions: LoadPluginContributions }, _options = {}): Promise<readonly string[]> {
  const definition: PluginContributionDefinition<DeployConfigGeneratorDescriptor, DeployConfigGeneratorDescriptor> = {
    filename: DEPLOY_CONFIGS_FILENAME, contribution: 'deploy workflow declarations', kind: 'data',
    parse: ({ raw }) => parseDeployConfigsFile(raw), load: ({ descriptor }) => descriptor,
    onReadError: () => [],
  };
  const result = await required.loadContributions({ workspaceId: required.workspaceId, definition }, { requireActive: true, orderByPluginId: true });
  for (const refusal of result.refusals) console.warn(refusal);
  return workflowFilesOf({ descriptors: result.items });
}

/** Hermetic roots use shipped sources; production uses loadDeployWorkflowFiles. O(descriptors). */
export function readBundledDeployWorkflowFiles(required: { sourceRoot: string }, _options = {}): readonly string[] {
  return workflowFilesOf({ descriptors: readBundledDeployConfigDescriptors(required) });
}
function workflowFilesOf({ descriptors }: { descriptors: readonly DeployConfigGeneratorDescriptor[] }, _options = {}): readonly string[] {
  return [...new Set(descriptors.flatMap(entry => entry.workflowFile === undefined ? [] : [entry.workflowFile]))];
}

/**
 * Parses a plugin's {@link DEPLOY_CONFIGS_FILENAME}. Pure (exported for its own tests). The parser
 * lives in `@jini-ai/devops/deploy`; this keeps the host's positional signature.
 *
 * @complexity O(g) in the declared generator count.
 */
export function parseDeployConfigsFile(raw: string): ReturnType<typeof parseDeployConfigDescriptors> {
  return parseDeployConfigDescriptors({ raw });
}

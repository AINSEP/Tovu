import path from "node:path";

import { importContainedModule, readTrustedPluginFile, type TrustedPluginPackage } from "#src/features/agent-plugins/trusted-plugin-files";

import type { DeployConfigGeneratorModule } from "./deploy-config.js";

/**
 * @file Loads the deploy-config generators behind `tovu deploy config --target <id>` from an Agent
 * Plugin, so core names no hosting vendor. A plugin opts in by shipping
 * {@link DEPLOY_CONFIGS_FILENAME} at its root: `{ schemaVersion: 1, generators: [{ id, label, module }] }`,
 * in the order the CLI lists them. Each `module` is a plain-JS `.mjs` file inside the plugin whose
 * default export is a `DeployConfigGeneratorModule` (`./deploy-config.ts`).
 *
 * Only the SOURCE loader exists today: its one caller, the CLI, runs at the repo root and reads the
 * product's own bundled `content/agent-plugins/deploy/`, the same trust basis as the hermetic
 * composition root. Module imports still go through the shared containment gate
 * (`features/agent-plugins/trusted-plugin-files.ts`). A workspace-installed variant (activation +
 * bundled-digest gates, like `deploy-targets/registry.ts`) is added when an admin route needs one.
 *
 * Failure isolation: a bad manifest drops the plugin's generators, a bad module only itself; every
 * drop is reported in `refusals`, never thrown.
 *
 * Architectural role: `features/deployments` capability, read by `cli/commands/deploy-config.ts`.
 */

/** The file a plugin ships at its root to contribute deploy-config generators. */
export const DEPLOY_CONFIGS_FILENAME = "tovu-deploy-configs.json";

const GENERATOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 64;
const MAX_LABEL_LENGTH = 100;

/** One entry of a plugin's {@link DEPLOY_CONFIGS_FILENAME}. */
export interface DeployConfigGeneratorDescriptor {
  readonly id: string;
  readonly label: string;
  readonly module: string;
}

export interface LoadedDeployConfigGenerator {
  readonly descriptor: DeployConfigGeneratorDescriptor;
  readonly pluginId: string;
  readonly module: DeployConfigGeneratorModule;
}

export interface DeployConfigGeneratorRegistry {
  get(id: string): LoadedDeployConfigGenerator | undefined;
  /** Declared order. */
  list(): readonly LoadedDeployConfigGenerator[];
  readonly refusals: readonly string[];
}

/**
 * The generators a plugin's SOURCE directory declares, with no install, activation or digest gate.
 * Only for this product's own `content/agent-plugins/<id>/` (the CLI, tests): never point it at
 * anything an operator or a third party can write.
 *
 * @complexity O(g) generators, one import each.
 */
export async function loadDeployConfigGeneratorsFromSource(plugin: TrustedPluginPackage): Promise<DeployConfigGeneratorRegistry> {
  let raw: string;
  try {
    raw = await readTrustedPluginFile(plugin, DEPLOY_CONFIGS_FILENAME);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return buildRegistry([], []);
    throw error;
  }
  const parsed = parseDeployConfigsFile(raw);
  if (!parsed.ok) return buildRegistry([], [`deploy configs from '${plugin.pluginId}' were not loaded: ${DEPLOY_CONFIGS_FILENAME} is invalid: ${parsed.reason}`]);

  const loaded: LoadedDeployConfigGenerator[] = [];
  const refusals: string[] = [];
  for (const descriptor of parsed.descriptors) {
    const imported = await importContainedModule(plugin, descriptor.module);
    const module = typeof imported === "string" ? imported : asGeneratorModule(imported.exported);
    if (typeof module === "string") refusals.push(`deploy config '${descriptor.id}' from '${plugin.pluginId}' was not loaded: ${module}`);
    else loaded.push({ descriptor, pluginId: plugin.pluginId, module });
  }
  return buildRegistry(loaded, refusals);
}

/** The export as a generator module, or the refusal reason. @complexity O(1). */
function asGeneratorModule(candidate: unknown): DeployConfigGeneratorModule | string {
  if (!isPlainObject(candidate) || typeof candidate.render !== "function") return "its module has no render() function";
  return candidate as unknown as DeployConfigGeneratorModule;
}

/**
 * Parses a plugin's {@link DEPLOY_CONFIGS_FILENAME}. Pure (exported for its own tests). Unknown keys
 * are ignored.
 *
 * @complexity O(g) in the declared generator count.
 */
export function parseDeployConfigsFile(raw: string): { readonly ok: true; readonly descriptors: readonly DeployConfigGeneratorDescriptor[] } | { readonly ok: false; readonly reason: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!isPlainObject(value) || value.schemaVersion !== 1) return { ok: false, reason: "schemaVersion must be 1" };
  if (!Array.isArray(value.generators)) return { ok: false, reason: "generators must be an array" };

  const descriptors: DeployConfigGeneratorDescriptor[] = [];
  for (const [index, entry] of value.generators.entries()) {
    const descriptor = parseDescriptor(entry, `generators[${index}]`);
    if (typeof descriptor === "string") return { ok: false, reason: descriptor };
    if (descriptors.some((seen) => seen.id === descriptor.id)) return { ok: false, reason: `generators[${index}].id '${descriptor.id}' is declared twice` };
    descriptors.push(descriptor);
  }
  return { ok: true, descriptors };
}

/** One generator entry, or the reason it is invalid. @complexity O(1). */
function parseDescriptor(entry: unknown, at: string): DeployConfigGeneratorDescriptor | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { id, label, module } = entry;
  if (typeof id !== "string" || id.length > MAX_ID_LENGTH || !GENERATOR_ID_PATTERN.test(id)) return `${at}.id must be a lowercase hyphenated id`;
  if (typeof label !== "string" || label.trim() === "" || label.length > MAX_LABEL_LENGTH) return `${at}.label must be a non-empty string`;
  if (typeof module !== "string" || !module.endsWith(".mjs") || path.posix.isAbsolute(module)) return `${at}.module must be a relative path ending in .mjs`;
  return { id, label, module };
}

/** @complexity O(g). */
function buildRegistry(loaded: readonly LoadedDeployConfigGenerator[], refusals: readonly string[]): DeployConfigGeneratorRegistry {
  const byId = new Map(loaded.map((generator) => [generator.descriptor.id, generator]));
  return {
    get: (id) => byId.get(id),
    list: () => [...loaded],
    refusals,
  };
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { MailAdapterModule } from "#src/platform/mail/index";

import { resolveAgentPluginActivation } from "./activation.js";
import { preferBundledAgentPluginDigests, readBundledAgentPluginDigests, type BundledAgentPluginDigests } from "./bundled-digests.js";
import type { InstalledAgentPlugin } from "./install.js";
import { resolveAgentPluginLayout } from "./layout.js";
import { assertContainedOnDisk, PackagePathViolation } from "./package-paths.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";

/**
 * @file Loads the mail adapters Agent Plugins contribute — the generic seam that lets a plugin (the
 * bundled `resend` one today) add a hosted mail provider without core naming one. Read by
 * `server/runtime/boot/resolve-mailer.ts`.
 *
 * A plugin opts in by shipping {@link MAIL_ADAPTERS_FILENAME} at its root: a data-only list of
 * `{ id, label, module, credentialLabel }`. `module` is a plain-JS `.mjs` file inside the plugin
 * whose default export is a `MailAdapterModule` (`platform/mail/adapter-module.ts`);
 * `credentialLabel` is the exact `custom_credential_sets` label its key is saved under.
 *
 * TRUST RULE (fail closed), the same one `features/deployments/deploy-targets/registry.ts` applies:
 * a module runs in this process, so it loads only when the plugin is ACTIVE by the fail-closed
 * reader, its installed digest is the one `bundled-digests.json` records (only plugins Tovu shipped),
 * and the module path stays inside the plugin root and ends in `.mjs`. A bad plugin drops only its
 * own adapters and a bad module only itself; every drop is reported in `refusals`, never thrown.
 */

/** The file a plugin ships at its root to contribute mail adapters. */
export const MAIL_ADAPTERS_FILENAME = "tovu-mail-adapters.json";

const ADAPTER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 64;
const MAX_LABEL_LENGTH = 100;

export interface MailAdapterDescriptor {
  readonly id: string;
  readonly label: string;
  /** Plugin-relative path of the `.mjs` module. */
  readonly module: string;
  /** Exact `custom_credential_sets.label` the provider's key is saved under. */
  readonly credentialLabel: string;
}

export interface LoadedMailAdapter {
  readonly descriptor: MailAdapterDescriptor;
  readonly pluginId: string;
  readonly module: MailAdapterModule;
}

export interface MailAdapterRegistry {
  /** Every loaded adapter, in a stable order (plugin id, then declaration order). */
  list(): readonly LoadedMailAdapter[];
  /** Log-safe, one sentence per plugin or adapter that was NOT loaded, and why. */
  readonly refusals: readonly string[];
}

type ParseResult = { readonly ok: true; readonly descriptors: readonly MailAdapterDescriptor[] } | { readonly ok: false; readonly reason: string };

interface PackageLoad {
  readonly adapters: readonly LoadedMailAdapter[];
  readonly refusals: readonly string[];
}

const NOTHING: PackageLoad = { adapters: [], refusals: [] };

/** The two facts a package load needs: whose it is and where it lives. */
interface AdapterPackage {
  readonly pluginId: string;
  readonly packageRoot: string;
}

/**
 * Builds this workspace's mail-adapter registry from its installed Agent Plugins. Read fresh on each
 * call; Node caches each module import per file URL, and installed digest directories never change.
 *
 * @throws Nothing for a plugin-level fault; only a filesystem fault listing the package directory itself.
 * @complexity O(p) installed plugins, one small read plus one import per declared adapter.
 */
export async function loadMailAdapterRegistry(ctx: { readonly workspaceId: string }): Promise<MailAdapterRegistry> {
  const layout = resolveAgentPluginLayout().forWorkspace(ctx.workspaceId);
  const bundled = await readBundledAgentPluginDigests(layout.root);
  const installed = preferBundledAgentPluginDigests(await listInstalledPlugins(layout.packages), bundled);

  const adapters: LoadedMailAdapter[] = [];
  const refusals: string[] = [];
  for (const plugin of [...installed].sort((a, b) => a.pluginId.localeCompare(b.pluginId))) {
    const load = await loadTrustedPlugin(plugin, bundled, layout.root);
    adapters.push(...load.adapters);
    refusals.push(...load.refusals);
  }
  return { list: () => adapters, refusals };
}

/**
 * A registry read straight from a plugin's SOURCE directory, with no install, activation or digest
 * gate. For tests only, where the directory is this product's own `content/agent-plugins/<id>/`.
 *
 * @complexity O(a) adapters, one import each.
 */
export async function loadMailAdapterRegistryFromSource(plugin: AdapterPackage): Promise<MailAdapterRegistry> {
  const load = await loadPackageAdapters(plugin);
  return { list: () => load.adapters, refusals: load.refusals };
}

/** One installed plugin's contribution, after the activation and bundled-digest gates. @complexity O(a). */
async function loadTrustedPlugin(plugin: InstalledAgentPlugin, bundled: BundledAgentPluginDigests, workspaceRoot: string): Promise<PackageLoad> {
  if (!plugin.files.includes(MAIL_ADAPTERS_FILENAME)) return NOTHING;
  const refuse = (reason: string): PackageLoad => ({ adapters: [], refusals: [`mail adapters from '${plugin.pluginId}' were not loaded: ${reason}`] });

  const activation = await resolveAgentPluginActivation(workspaceRoot, plugin.pluginId);
  if (activation.verdict === "inactive") return NOTHING;
  if (activation.verdict === "undetermined") return refuse(`its activation could not be read (${activation.reason})`);

  if (bundled.get(plugin.pluginId) !== plugin.archiveDigest) {
    return refuse(`only plugins shipped with Tovu may add mail adapters (installed digest ${plugin.archiveDigest.slice(0, 12)} is not the one this build shipped)`);
  }
  return loadPackageAdapters(plugin);
}

/** A package's own adapters, trusted by the caller. @complexity O(a) adapters, one import each. */
async function loadPackageAdapters(plugin: AdapterPackage): Promise<PackageLoad> {
  const parsed = parseMailAdaptersFile(await readFile(path.join(plugin.packageRoot, MAIL_ADAPTERS_FILENAME), "utf8"));
  if (!parsed.ok) return { adapters: [], refusals: [`mail adapters from '${plugin.pluginId}' were not loaded: ${MAIL_ADAPTERS_FILENAME} is invalid: ${parsed.reason}`] };

  const adapters: LoadedMailAdapter[] = [];
  const refusals: string[] = [];
  for (const descriptor of parsed.descriptors) {
    const loaded = await loadAdapterModule(plugin, descriptor);
    if (typeof loaded === "string") refusals.push(`mail adapter '${descriptor.id}' from '${plugin.pluginId}' was not loaded: ${loaded}`);
    else adapters.push({ descriptor, pluginId: plugin.pluginId, module: loaded });
  }
  return { adapters, refusals };
}

/** Imports one module after the containment check; the module, or the refusal reason. @complexity O(1). */
async function loadAdapterModule(plugin: AdapterPackage, descriptor: MailAdapterDescriptor): Promise<MailAdapterModule | string> {
  let modulePath: string;
  try {
    modulePath = await assertContainedOnDisk(plugin.packageRoot, descriptor.module);
  } catch (error) {
    if (error instanceof PackagePathViolation) return `module path '${descriptor.module}' escapes the plugin root`;
    throw error;
  }

  let imported: { readonly default?: unknown };
  try {
    imported = (await import(pathToFileURL(modulePath).href)) as { readonly default?: unknown };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const candidate = imported.default;
  if (!isPlainObject(candidate) || typeof candidate.create !== "function") return "its module has no create() function";
  return candidate as unknown as MailAdapterModule;
}

/**
 * Parses a plugin's {@link MAIL_ADAPTERS_FILENAME}. Pure. Unknown keys are ignored.
 *
 * @complexity O(a) in the declared adapter count.
 */
export function parseMailAdaptersFile(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!isPlainObject(value) || value.schemaVersion !== 1) return { ok: false, reason: "schemaVersion must be 1" };
  if (!Array.isArray(value.adapters)) return { ok: false, reason: "adapters must be an array" };

  const descriptors: MailAdapterDescriptor[] = [];
  for (const [index, entry] of value.adapters.entries()) {
    const result = parseDescriptor(entry, `adapters[${index}]`);
    if (typeof result === "string") return { ok: false, reason: result };
    if (descriptors.some((seen) => seen.id === result.id)) return { ok: false, reason: `adapters[${index}].id '${result.id}' is declared twice` };
    descriptors.push(result);
  }
  return { ok: true, descriptors };
}

/** One descriptor entry, or the reason it is invalid. @complexity O(1). */
function parseDescriptor(entry: unknown, at: string): MailAdapterDescriptor | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { id, label, module, credentialLabel } = entry;
  if (typeof id !== "string" || id.length > MAX_ID_LENGTH || !ADAPTER_ID_PATTERN.test(id)) return `${at}.id must be a lowercase hyphenated id`;
  if (!isLabel(label)) return `${at}.label must be a non-empty string`;
  if (typeof module !== "string" || !module.endsWith(".mjs") || path.posix.isAbsolute(module)) return `${at}.module must be a relative path ending in .mjs`;
  if (!isLabel(credentialLabel)) return `${at}.credentialLabel must be a non-empty string`;
  return { id, label, module, credentialLabel };
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= MAX_LABEL_LENGTH;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

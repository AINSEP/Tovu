import path from "node:path";

import type { MailAdapterModule } from "#src/platform/mail/index";

import { defineExecutablePluginContribution, loadPluginContributions, loadPluginContributionsFromSource, type TrustedPluginPackage } from "./lifecycle.js";

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
 * TRUST RULE (fail closed), the shared gate in `./trusted-plugin-files.ts`: a module runs in this
 * process, so it loads only when the plugin is ACTIVE by the fail-closed reader, its installed digest
 * is the one `bundled-digests.json` records (only plugins Tovu shipped), and the module path stays
 * inside the plugin root and ends in `.mjs`. A bad plugin drops only its
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

const adapterContribution = defineExecutablePluginContribution<MailAdapterDescriptor, MailAdapterModule>({
  filename: MAIL_ADAPTERS_FILENAME, contribution: "mail adapters",
  parse: ({ raw }) => parseMailAdaptersFile(raw), modulePath: ({ descriptor }) => descriptor.module,
  validate: ({ exported }) => asAdapterModule(exported),
  refusal: ({ plugin, descriptor, reason }) => `mail adapter '${descriptor.id}' from '${plugin.pluginId}' was not loaded: ${reason}`,
});

/** The two facts a package load needs: whose it is and where it lives. */
type AdapterPackage = TrustedPluginPackage;

/**
 * Builds this workspace's mail-adapter registry from its installed Agent Plugins. Read fresh on each
 * call; Node caches each module import per file URL, and installed digest directories never change.
 *
 * @throws Nothing for a plugin-level fault; only a filesystem fault listing the package directory itself.
 * @complexity O(p) installed plugins, one small read plus one import per declared adapter.
 */
export async function loadMailAdapterRegistry(ctx: { readonly workspaceId: string }, _optional: Record<string, never> = {}): Promise<MailAdapterRegistry> {
  const load = await loadPluginContributions({ ...ctx, definition: adapterContribution }, { orderByPluginId: true });
  return { list: () => load.items, refusals: load.refusals };
}

/**
 * A registry read straight from a plugin's SOURCE directory, with no install, activation or digest
 * gate. For tests only, where the directory is this product's own `content/agent-plugins/<id>/`.
 *
 * @complexity O(a) adapters, one import each.
 */
export async function loadMailAdapterRegistryFromSource(plugin: AdapterPackage, _optional: Record<string, never> = {}): Promise<MailAdapterRegistry> {
  const load = await loadPluginContributionsFromSource({ plugin, definition: adapterContribution });
  return { list: () => load.items, refusals: load.refusals };
}

/** Validate the default export after Jini's contained import. @complexity O(1). */
function asAdapterModule(candidate: unknown): MailAdapterModule | string {
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

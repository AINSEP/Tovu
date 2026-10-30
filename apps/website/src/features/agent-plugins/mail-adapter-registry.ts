import path from "node:path";

import { PROVIDER_ID_PATTERN } from "@jini-ai/core/provider-registry";
import { contributeProviders, type LoadedProviderContribution } from "@jini-ai/agent-plugins/lifecycle";
import type { MailAdapterCreateContext as JiniCreateContext, MailProviderModule, MailProviderRegistry } from "@jini-ai/platform/mail";
import type { MailAdapterCreateContext, MailAdapterModule } from "#src/platform/mail/index";
import { toJiniMailer } from "#src/platform/mail/purpose-scoped-mailer";
import type { MailProviderSetup } from "#src/platform/mail/index";

import { bundledContributionSources } from "./bundled-contribution-sources.js";
import { parseMailProviderSetupProperty } from "./mail-provider-setup.js";
import { parseCredentialCardUsedFor } from "./credential-cards.js";
import { defineExecutablePluginContribution, type LoadPluginContributions, loadPluginContributionsFromSource, type TrustedPluginPackage } from "./lifecycle.js";

/**
 * @file Loads the mail adapters Agent Plugins contribute — the generic seam that lets a plugin (a
 * bundled mail plugin, for instance) add a hosted mail provider without core naming one. Read by
 * `server/runtime/boot/resolve-mailer.ts`.
 *
 * A plugin opts in by shipping {@link MAIL_ADAPTERS_FILENAME} at its root: a data-only list of
 * `{ id, label, module, credentialLabel }`. `module` is a plain-JS `.mjs` file inside the plugin
 * whose default export is a `MailAdapterModule` (`platform/mail/adapter-module.ts`);
 * `credentialLabel` is the exact `custom_credential_sets` label its key is saved under.
 *
 * schemaVersion 2 (email provider contract v1, 2026-10-21) adds `credentialKeys` and `feedback`, and
 * its module is a provider module (`id`, `capabilities`, optional `feedback` parser and domain
 * methods) whose `module.id` must equal the descriptor's `id`. `credentialLabel` stays optional
 * there; absent, it is {@link defaultCredentialLabel}. v1 files keep loading unchanged. 2026-10-22: v2
 * may also carry `setup` (field labels/types/defaults/help links, `./mail-provider-setup.ts`).
 * {@link contributeMailProviders} offers every loaded adapter to Jini's keyed mail-provider registry
 * so its refusals (bad id, duplicate, capability claims without code) surface with the loader's.
 *
 * A v2 entry may also declare `credentialCard` (2026-10-22): the copy for the plugin's own key card
 * (`custom-credentials/plugin-credential-card.ts`). It is data only, never required: an invalid card
 * is dropped with a note in `refusals` and the adapter still loads.
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
  /** 1 or 2; v1 descriptors carry neither `credentialKeys` nor `feedback`. */
  readonly schemaVersion?: 1 | 2;
  readonly id: string;
  readonly label: string;
  /** Plugin-relative path of the `.mjs` module. */
  readonly module: string;
  /** Exact `custom_credential_sets.label` the provider's key is saved under. */
  readonly credentialLabel: string;
  /** v2: credential fields the provider reads (`token`, `baseUrl`, `username`). */
  readonly credentialKeys?: readonly string[];
  /** v2: whether the module ships a delivery-feedback parser. */
  readonly feedback?: boolean;
  /** v2, optional: declarative setup-form metadata (`./mail-provider-setup.ts`). */
  readonly setup?: MailProviderSetup;
  /** v2: the plugin's own key card copy; core fills in the saved label and category. */
  readonly credentialCard?: MailCredentialCard;
  /** Why a declared `credentialCard` was ignored; surfaced in the registry's `refusals`. */
  readonly credentialCardRefusal?: string;
}

/** Plugin-declared key card copy (https URLs only; the base URL is where the saved key is used). */
export interface MailCredentialCard {
  readonly title: string;
  readonly intro?: string;
  readonly helpUrl?: string;
  readonly helpLabel?: string;
  readonly keyHint?: string;
  /** Display-only purpose copy, validated by the same parser as manifest credential cards. */
  readonly usedFor?: readonly string[];
  readonly baseUrl: string;
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
 * @param required - Contribution loader from this boot's lifecycle; no site-dependent module default.
 * @complexity O(p) installed plugins, one small read plus one import per declared adapter.
 */
export async function loadMailAdapterRegistry(ctx: { readonly workspaceId: string }, required: { readonly loadContributions: LoadPluginContributions }): Promise<MailAdapterRegistry> {
  const load = await required.loadContributions({ ...ctx, definition: adapterContribution }, { orderByPluginId: true });
  return { list: () => load.items, refusals: [...load.refusals, ...cardNotes(load.items)] };
}

/**
 * A registry read straight from a plugin's SOURCE directory, with no install, activation or digest
 * gate. For tests only, where the directory is this product's own `content/agent-plugins/<id>/`.
 *
 * @complexity O(a) adapters, one import each.
 */
export async function loadMailAdapterRegistryFromSource(plugin: AdapterPackage, _optional: Record<string, never> = {}): Promise<MailAdapterRegistry> {
  const load = await loadPluginContributionsFromSource({ plugin, definition: adapterContribution });
  return { list: () => load.items, refusals: [...load.refusals, ...cardNotes(load.items)] };
}

/**
 * Every bundled plugin's mail adapters, read from the product's own `content/agent-plugins/` source
 * (no install or digest gate). For the hermetic composition root only, like the other `loadBundled*`.
 *
 * @complexity O(p) plugin directories, one import per declared adapter.
 */
export async function loadBundledMailAdapterRegistry(required: { readonly sourceRoot: string }, _optional: Record<string, never> = {}): Promise<MailAdapterRegistry> {
  const items: LoadedMailAdapter[] = [];
  const refusals: string[] = [];
  for (const plugin of bundledContributionSources({ ...required, filename: MAIL_ADAPTERS_FILENAME })) {
    const load = await loadMailAdapterRegistryFromSource(plugin);
    items.push(...load.list());
    refusals.push(...load.refusals);
  }
  return { list: () => items, refusals };
}

/** One note per loaded adapter whose declared key card was ignored. @complexity O(a). */
function cardNotes(items: readonly LoadedMailAdapter[]): string[] {
  return items.flatMap(({ descriptor, pluginId }) =>
    descriptor.credentialCardRefusal ? [`mail adapter '${descriptor.id}' from '${pluginId}' key card was ignored: ${descriptor.credentialCardRefusal}`] : []);
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
  if (!isPlainObject(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) return { ok: false, reason: "schemaVersion must be 1 or 2" };
  if (!Array.isArray(value.adapters)) return { ok: false, reason: "adapters must be an array" };
  return parseAdapterDescriptors({ adapters: value.adapters, version: value.schemaVersion });
}

function parseAdapterDescriptors({ adapters, version }: { adapters: unknown[]; version: number }, _options = {}): ParseResult {
  const descriptors: MailAdapterDescriptor[] = [];
  for (const [index, entry] of adapters.entries()) {
    const result = version === 1 ? parseDescriptor(entry, `adapters[${index}]`) : parseDescriptorV2({ entry, at: `adapters[${index}]` });
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

/** The credential label a v2 descriptor without one uses; matches the v1 bundled label shape (`Tovu Mail — <label> API`). */
export function defaultCredentialLabel({ label }: { label: string }): string {
  return `Tovu Mail — ${label} API`;
}

/** One v2 entry, or why it is invalid; a bad optional card only adds a note. @complexity O(k + f) credential keys and setup fields. */
function parseDescriptorV2({ entry, at }: { entry: unknown; at: string }, _options: Record<string, never> = {}): MailAdapterDescriptor | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { id, label, module, credentialLabel, credentialKeys, feedback, setup } = entry;
  if (typeof id !== "string" || !PROVIDER_ID_PATTERN.test(id)) return `${at}.id must match ${PROVIDER_ID_PATTERN.source}`;
  const base = parseDescriptor({ id: "v2", label, module, credentialLabel: credentialLabel ?? "v2" }, at);
  if (typeof base === "string") return base;
  if (!isCredentialKeys(credentialKeys)) return `${at}.credentialKeys must be an array of field names`;
  if (typeof feedback !== "boolean") return `${at}.feedback must be true or false`;
  const savedUnder = typeof credentialLabel === "string" ? base.credentialLabel : defaultCredentialLabel({ label: base.label });
  const card = parseCredentialCardProperty({ value: entry.credentialCard, at: `${at}.credentialCard` });
  return withSetup({ descriptor: { schemaVersion: 2, id, label: base.label, module: base.module, credentialLabel: savedUnder, credentialKeys, feedback, ...card }, setup, at });
}

/** Narrow credential keys before passing them to setup validation. @complexity O(k) keys. */
function isCredentialKeys(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((key) => typeof key === "string" && key !== "");
}

/** Keep absent cards absent; validate declared cards through the live parser. @complexity O(1). */
function parseCredentialCardProperty({ value, at }: { value: unknown; at: string }, _options: Record<string, never> = {}): Pick<MailAdapterDescriptor, "credentialCard" | "credentialCardRefusal"> {
  return value === undefined ? {} : parseCredentialCard(value, at);
}

const MAX_CARD_TEXT_LENGTH = 500;
const MAX_URL_LENGTH = 500;

/** A declared key card, or the note saying why it is ignored. Unknown keys are ignored. @complexity O(1). */
function parseCredentialCard(value: unknown, at: string): { credentialCard: MailCredentialCard } | { credentialCardRefusal: string } {
  if (!isPlainObject(value)) return { credentialCardRefusal: `${at} must be an object` };
  const card: Record<string, string | readonly string[]> = {};
  for (const [key, required, valid, rule] of [
    ["title", true, isLabel, "a non-empty string"],
    ["intro", false, isCardText, "a non-empty string"],
    ["helpUrl", false, isHttpsUrl, "an https URL"],
    ["helpLabel", false, isLabel, "a non-empty string"],
    ["keyHint", false, isCardText, "a non-empty string"],
    ["baseUrl", true, isHttpsUrl, "an https URL"],
  ] as const) {
    const field = value[key];
    if (field === undefined && !required) continue;
    if (!valid(field)) return { credentialCardRefusal: `${at}.${key} must be ${rule}` };
    card[key] = field;
  }
  try {
    const usedFor = parseCredentialCardUsedFor({ value: value.usedFor });
    if (usedFor !== undefined) card.usedFor = usedFor;
  } catch {
    // Bad optional copy must not disable a provider that can still send mail.
    return { credentialCardRefusal: `${at}.usedFor must be an array of at most 8 non-empty strings (at most 120 characters each)` };
  }
  return { credentialCard: card as unknown as MailCredentialCard };
}

function isCardText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= MAX_CARD_TEXT_LENGTH;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH || !URL.canParse(value)) return false;
  return new URL(value).protocol === "https:";
}

/** Parse optional setup without losing the card or its refusal note. @complexity O(f) setup fields. */
function withSetup({ descriptor, setup, at }: { descriptor: MailAdapterDescriptor; setup: unknown; at: string }, _options = {}): MailAdapterDescriptor | string {
  const declared = parseMailProviderSetupProperty({ value: setup, at, credentialKeys: descriptor.credentialKeys! });
  return typeof declared === "string" ? declared : { ...descriptor, ...declared };
}

/** Why a v2 module disagrees with its descriptor, or undefined. @complexity O(1). */
function v2Mismatch(adapter: LoadedMailAdapter): string | undefined {
  const declared = adapter.module as unknown as Partial<MailProviderModule>;
  if (declared.id !== adapter.descriptor.id) return `its module id '${String(declared.id)}' does not match the descriptor id '${adapter.descriptor.id}'`;
  if (adapter.descriptor.feedback !== (declared.feedback !== undefined)) return "its descriptor feedback flag does not match the module's feedback parser";
  return undefined;
}

/**
 * The Jini provider for one loaded adapter. The module keeps Tovu's positional mailer ABI, so
 * `create` adapts it; a v1 module (create only) is a hosted provider without feedback or domains.
 * @complexity O(1).
 */
function providerFor(adapter: LoadedMailAdapter): MailProviderModule {
  const { descriptor, module } = adapter;
  const declared = descriptor.schemaVersion === 2 ? (module as unknown as Partial<MailProviderModule>) : {};
  return {
    ...declared,
    id: descriptor.id,
    label: descriptor.label,
    credentialKeys: descriptor.credentialKeys ?? ["token", "baseUrl"],
    capabilities: declared.capabilities ?? { hosted: true, feedback: false, domainVerification: false },
    // Plugins receive Tovu's guarded HTTP client (positional `send`), never Jini's object-arg one.
    create: (context: JiniCreateContext) => toJiniMailer({ mailer: module.create(context as unknown as MailAdapterCreateContext) }),
  };
}

/**
 * Offers every loaded plugin adapter to the mail-provider registry. A v2 module whose id or
 * feedback claim disagrees with its descriptor is refused before the registry sees it.
 * @returns Accepted provider ids and every refusal (loader's, ours, then the registry's); never throws.
 * @complexity O(a) adapters.
 */
export function contributeMailProviders(
  required: { registry: MailProviderRegistry; adapters: MailAdapterRegistry },
  _optional: Record<string, never> = {}
): { accepted: readonly string[]; refusals: readonly string[] } {
  const items: LoadedProviderContribution<MailProviderModule>[] = [];
  const refusals = [...required.adapters.refusals];
  for (const adapter of required.adapters.list()) {
    const mismatch = adapter.descriptor.schemaVersion === 2 ? v2Mismatch(adapter) : undefined;
    if (mismatch) {
      refusals.push(`mail adapter '${adapter.descriptor.id}' from '${adapter.pluginId}' was not loaded: ${mismatch}`);
      continue;
    }
    items.push({ contract: "mail", pluginId: adapter.pluginId, definition: { id: adapter.descriptor.id, provider: providerFor(adapter), label: adapter.descriptor.label } });
  }
  return contributeProviders({ registry: required.registry, loaded: { items, refusals } });
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= MAX_LABEL_LENGTH;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import path from "node:path";

import { defineExecutablePluginContribution, type LoadPluginContributions, loadPluginContributionsFromSource, type TrustedPluginPackage } from "#src/features/agent-plugins/lifecycle";

import type { FormDestinationDescriptor, FormDestinationModule, FormDestinationRegistry, LoadedFormDestination } from "./types.js";

/**
 * @file Loads the form destinations Agent Plugins contribute: a copy of the mail-adapter
 * contribution (`features/agent-plugins/mail-adapter-registry.ts`) on Jini's
 * `defineExecutablePluginContribution`, so there is no new loader.
 *
 * A plugin opts in by shipping {@link FORM_DESTINATIONS_FILENAME} at its root: a data-only list of
 * `{ id, label, module, receive?, hosts?, credentialLabel? }`. `module` is a plain-JS `.mjs` file
 * inside the plugin whose default export is a `FormDestinationModule` (`./types.ts`).
 *
 * TRUST RULE (fail closed), the shared gate in `features/agent-plugins/trusted-plugin-files.ts`: a
 * module runs in this process, so it loads only when the plugin is ACTIVE, its installed digest is
 * the one `bundled-digests.json` records (only plugins Tovu shipped), and the module path stays
 * inside the plugin root and ends in `.mjs`. An id two plugins declare, or a host two co-hosted
 * destinations claim, is dropped for both ("refusing to guess", as the deploy-target registry does).
 * Every drop is reported in `refusals`, never thrown.
 */

/** The file a plugin ships at its root to contribute form destinations. */
export const FORM_DESTINATIONS_FILENAME = "tovu-form-destinations.json";

const DESTINATION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 64;
const MAX_LABEL_LENGTH = 100;
const RECEIVE_MODES: ReadonlySet<unknown> = new Set(["co-hosted", "external"]);

type ParseResult = { readonly ok: true; readonly descriptors: readonly FormDestinationDescriptor[] } | { readonly ok: false; readonly reason: string };

const destinationContribution = defineExecutablePluginContribution<FormDestinationDescriptor, FormDestinationModule>({
  filename: FORM_DESTINATIONS_FILENAME, contribution: "form destinations",
  parse: ({ raw }) => parseFormDestinationsFile(raw), modulePath: ({ descriptor }) => descriptor.module,
  validate: ({ exported }) => (isPlainObject(exported) ? exported as FormDestinationModule : "its module's default export is not an object"),
  refusal: ({ plugin, descriptor, reason }) => `form destination '${descriptor.id}' from '${plugin.pluginId}' was not loaded: ${reason}`,
});

/**
 * Builds this workspace's form destination registry from its installed Agent Plugins. Read fresh on
 * each call; Node caches each module import per file URL, and installed digest directories never change.
 *
 * @throws Nothing for a plugin-level fault; only a filesystem fault listing the package directory itself.
 * @param required - Contribution loader from this boot's lifecycle; no site-dependent module default.
 * @complexity O(p) installed plugins, one small read plus one import per declared destination.
 */
export async function loadFormDestinationRegistry(ctx: { readonly workspaceId: string }, required: { readonly loadContributions: LoadPluginContributions }): Promise<FormDestinationRegistry> {
  const load = await required.loadContributions({ ...ctx, definition: destinationContribution }, { orderByPluginId: true });
  return buildFormDestinationRegistry({ loaded: load.items, refusals: load.refusals });
}

/**
 * A registry read straight from a plugin's SOURCE directory, with no install, activation or digest
 * gate. For tests only, where the directory is this product's own `content/agent-plugins/<id>/`.
 *
 * @complexity O(d) destinations, one import each.
 */
export async function loadFormDestinationRegistryFromSource(plugin: TrustedPluginPackage, _optional: Record<string, never> = {}): Promise<FormDestinationRegistry> {
  const load = await loadPluginContributionsFromSource({ plugin, definition: destinationContribution });
  return buildFormDestinationRegistry({ loaded: load.items, refusals: load.refusals });
}

/**
 * Indexes loaded destinations: drops a module missing the methods its receive mode needs, every id
 * more than one plugin declares, and every host more than one co-hosted destination claims. Pure.
 * @complexity O(n * h) for n loaded destinations with h hosts each.
 */
export function buildFormDestinationRegistry(required: { readonly loaded: readonly LoadedFormDestination[]; readonly refusals: readonly string[] }, _optional: Record<string, never> = {}): FormDestinationRegistry {
  const refusals = [...required.refusals];
  const complete = required.loaded.filter((entry) => {
    const missing = missingMethods({ entry });
    if (missing) refusals.push(`form destination '${entry.descriptor.id}' from '${entry.pluginId}' was not loaded: ${missing}`);
    return !missing;
  });
  const unique = dropShared({ entries: complete, keysOf: (entry) => [entry.descriptor.id], refusals, what: (id) => `form destination '${id}'`, why: "more than one plugin declares it" });
  const unclaimed = dropShared({ entries: unique, keysOf: (entry) => (entry.descriptor.receive === "co-hosted" ? entry.descriptor.hosts ?? [] : []), refusals,
    what: (host) => `form receiver for host '${host}'`, why: "more than one co-hosted destination claims it" });
  return {
    list: () => unclaimed,
    get: (id) => unclaimed.find((entry) => entry.descriptor.id === id),
    resolve: ({ scope }) => unclaimed.find((entry) => entry.descriptor.id === scope)
      ?? unclaimed.find((entry) => entry.descriptor.receive === "co-hosted" && entry.descriptor.hosts?.includes(scope)),
    refusals,
  };
}

/** The methods the descriptor's receive mode needs that the module lacks, as a reason, or nothing. @complexity O(1). */
function missingMethods({ entry }: { entry: LoadedFormDestination }, _optional = {}): string | undefined {
  const { descriptor: { receive }, module } = entry;
  if (receive && (typeof module.pull !== "function" || typeof module.ack !== "function")) return "a destination that receives submissions needs pull() and ack()";
  if (receive === "external" && typeof module.prepare !== "function") return "an external receiver needs prepare()";
  if (!receive && typeof module.deliver !== "function") return "a destination that does not receive submissions needs deliver()";
  return undefined;
}

/** Keeps the entries none of whose keys another entry shares; each shared key is one refusal line.
 * @complexity O(n * k) for n entries with k keys each. */
function dropShared(
  required: { entries: readonly LoadedFormDestination[]; keysOf: (entry: LoadedFormDestination) => readonly string[]; refusals: string[]; what: (key: string) => string; why: string },
  _optional: Record<string, never> = {},
): LoadedFormDestination[] {
  const { entries, keysOf, refusals, what, why } = required;
  const claimants = new Map<string, LoadedFormDestination[]>();
  for (const entry of entries) for (const key of new Set(keysOf(entry))) claimants.set(key, [...(claimants.get(key) ?? []), entry]);
  const dropped = new Set<LoadedFormDestination>();
  for (const [key, owners] of claimants) {
    if (owners.length < 2) continue;
    owners.forEach((owner) => dropped.add(owner));
    const pluginIds = owners.map((owner) => `'${owner.pluginId}'`).sort().join(", ");
    refusals.push(`${what(key)} was not loaded: ${why} (${pluginIds})`);
  }
  return entries.filter((entry) => !dropped.has(entry));
}

/**
 * Parses a plugin's {@link FORM_DESTINATIONS_FILENAME}. Pure. Unknown keys are ignored.
 *
 * @complexity O(d) in the declared destination count.
 */
export function parseFormDestinationsFile(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!isPlainObject(value) || value.schemaVersion !== 1) return { ok: false, reason: "schemaVersion must be 1" };
  if (!Array.isArray(value.destinations)) return { ok: false, reason: "destinations must be an array" };

  const descriptors: FormDestinationDescriptor[] = [];
  for (const [index, entry] of value.destinations.entries()) {
    const result = parseDescriptor(entry, `destinations[${index}]`);
    if (typeof result === "string") return { ok: false, reason: result };
    if (descriptors.some((seen) => seen.id === result.id)) return { ok: false, reason: `destinations[${index}].id '${result.id}' is declared twice` };
    descriptors.push(result);
  }
  return { ok: true, descriptors };
}

/** One descriptor entry, or the reason it is invalid. @complexity O(h) in the declared hosts. */
function parseDescriptor(entry: unknown, at: string): FormDestinationDescriptor | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { id, label, module } = entry;
  if (!isId(id)) return `${at}.id must be a lowercase hyphenated id`;
  if (!isLabel(label)) return `${at}.label must be a non-empty string`;
  if (typeof module !== "string" || !module.endsWith(".mjs") || path.posix.isAbsolute(module)) return `${at}.module must be a relative path ending in .mjs`;
  const options = parseReceiveOptions(entry, at);
  return typeof options === "string" ? options : { id, label, module, ...options };
}

/** The optional receive fields: mode, co-hosting targets and vendor credential label. @complexity O(h). */
function parseReceiveOptions(entry: Readonly<Record<string, unknown>>, at: string): Pick<FormDestinationDescriptor, "receive" | "hosts" | "credentialLabel"> | string {
  const reason = receiveOptionsReason(entry, at);
  if (reason) return reason;
  const { receive, hosts, credentialLabel } = entry as Pick<FormDestinationDescriptor, "receive" | "hosts" | "credentialLabel">;
  return { ...(receive ? { receive } : {}), ...(hosts ? { hosts } : {}), ...(credentialLabel ? { credentialLabel } : {}) };
}

/** Why the optional receive fields are invalid, or nothing. @complexity O(h). */
function receiveOptionsReason({ receive, hosts, credentialLabel }: Readonly<Record<string, unknown>>, at: string): string | undefined {
  if (receive !== undefined && !RECEIVE_MODES.has(receive)) return `${at}.receive must be "co-hosted" or "external"`;
  if (hosts !== undefined && !isHostList(hosts)) return `${at}.hosts must be an array of hosting target ids`;
  if (receive === "co-hosted" && !(hosts as string[] | undefined)?.length) return `${at}.hosts must name at least one hosting target for a co-hosted receiver`;
  if (credentialLabel !== undefined && !isLabel(credentialLabel)) return `${at}.credentialLabel must be a non-empty string`;
  return undefined;
}

function isHostList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isId);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_ID_LENGTH && DESTINATION_ID_PATTERN.test(value);
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= MAX_LABEL_LENGTH;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

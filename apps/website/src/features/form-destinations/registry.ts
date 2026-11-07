import { asFormDestinationModule, formDestinationMissingMethods, parseFormDestinationsFile as parseFormDestinationDescriptors } from "@jini-ai/cms/forms";
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

const destinationContribution = defineExecutablePluginContribution<FormDestinationDescriptor, FormDestinationModule>({
  filename: FORM_DESTINATIONS_FILENAME, contribution: "form destinations",
  parse: ({ raw }) => parseFormDestinationsFile(raw), modulePath: ({ descriptor }) => descriptor.module,
  validate: ({ exported }) => asFormDestinationModule({ exported }),
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
    const missing = formDestinationMissingMethods({ entry });
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
 * The parser lives in `@jini-ai/cms/forms`; this keeps the host's positional signature.
 *
 * @complexity O(d) in the declared destination count.
 */
export function parseFormDestinationsFile(raw: string): ReturnType<typeof parseFormDestinationDescriptors> {
  return parseFormDestinationDescriptors({ raw });
}

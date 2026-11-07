import { contributeProviders, type LoadedProviderContribution } from "@jini-ai/agent-plugins/lifecycle";
import type { MailAdapterCreateContext as JiniCreateContext, MailProviderModule, MailProviderRegistry } from "@jini-ai/platform/mail";
import type { MailAdapterCreateContext, MailAdapterModule } from "#src/platform/mail/index";
import { toJiniMailer } from "#src/platform/mail/purpose-scoped-mailer";
import { asMailAdapterModule, parseMailAdaptersFile as parseMailAdapterDescriptors, type MailAdapterDescriptor, type MailCredentialCard } from "@jini-ai/agent-plugins/lifecycle/mail";

import { bundledContributionSources } from "./bundled-contribution-sources.js";
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
 * there; absent, it is {@link defaultCredentialLabel}. v1 keeps its create-only module format; both
 * versions use the keyed registry's provider ID grammar. 2026-10-22: v2
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

export type { MailAdapterDescriptor, MailCredentialCard };

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

const adapterContribution = defineExecutablePluginContribution<MailAdapterDescriptor, MailAdapterModule>({
  filename: MAIL_ADAPTERS_FILENAME, contribution: "mail adapters",
  parse: ({ raw }) => parseMailAdaptersFile(raw), modulePath: ({ descriptor }) => descriptor.module,
  validate: ({ exported }) => asMailAdapterModule<MailAdapterModule>({ exported }),
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

/**
 * Parses a plugin's {@link MAIL_ADAPTERS_FILENAME}. Pure. Unknown keys are ignored.
 * The parser lives in `@jini-ai/agent-plugins/lifecycle/mail`; this keeps the host's positional
 * signature and supplies this host's {@link defaultCredentialLabel}.
 *
 * @complexity O(a) in the declared adapter count.
 */
export function parseMailAdaptersFile(raw: string): ReturnType<typeof parseMailAdapterDescriptors> {
  return parseMailAdapterDescriptors({ raw }, { defaultCredentialLabel });
}

/** The credential label a v2 descriptor without one uses; matches the v1 bundled label shape (`Tovu Mail — <label> API`). */
export function defaultCredentialLabel({ label }: { label: string }): string {
  return `Tovu Mail — ${label} API`;
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

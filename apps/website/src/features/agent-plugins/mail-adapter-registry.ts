import { createMailContributions, parseMailAdaptersFile as parseMailAdapterDescriptors, type MailAdapterDescriptor, type MailCredentialCard } from "@jini-ai/agent-plugins/lifecycle/mail";
import { fromPositionalMailer, toPluginHttpClient, parseMailProviderSetupProperty } from "@jini-ai/platform/mail";
import { loadPluginContributionsFromSource } from "./lifecycle.js";
import { bundledContributionSources } from "./bundled-contribution-sources.js";
export type { MailAdapterDescriptor, MailCredentialCard, LoadedMailAdapter, MailAdapterRegistry } from "@jini-ai/agent-plugins/lifecycle/mail";
import type { LoadedMailAdapter, MailAdapterRegistry } from "@jini-ai/agent-plugins/lifecycle/mail";
/** The file a plugin ships at its root to contribute mail adapters. */
export const MAIL_ADAPTERS_FILENAME = "tovu-mail-adapters.json";
/** The credential label a v2 descriptor without one uses; matches the v1 bundled label shape (`Tovu Mail — <label> API`). */
export function defaultCredentialLabel({ label }: { label: string }): string { return `Tovu Mail — ${label} API`; }
const contributions = createMailContributions({ filename: MAIL_ADAPTERS_FILENAME, parseSetup: parseMailProviderSetupProperty,
  defaultCredentialLabel, abi: { fromPositionalMailer, toPluginHttpClient }, loadFromSource: loadPluginContributionsFromSource });
export const { loadMailAdapterRegistry, loadMailAdapterRegistryFromSource, contributeMailProviders } = contributions;
/**
 * Parses a plugin's {@link MAIL_ADAPTERS_FILENAME}. Pure. Unknown keys are ignored.
 * The parser lives in `@jini-ai/agent-plugins/lifecycle/mail`; this keeps the host's positional
 * signature and supplies this host's {@link defaultCredentialLabel}.
 *
 * @complexity O(a) in the declared adapter count.
 */
export function parseMailAdaptersFile(raw: string): ReturnType<typeof parseMailAdapterDescriptors> {
  return parseMailAdapterDescriptors({ raw, parseSetup: parseMailProviderSetupProperty }, { defaultCredentialLabel });
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


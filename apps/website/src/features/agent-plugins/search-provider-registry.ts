import type { SearchProvider } from "@jini-ai/search";
import { defineSearchProviderContribution } from "@jini-ai/search/contribution";
import type { LoadedProviderContribution, PluginContributionResult } from "@jini-ai/agent-plugins/lifecycle";

import { type LoadPluginContributions, loadPluginContributionsFromSource, type TrustedPluginPackage } from "./lifecycle.js";

/**
 * @file Loads the site-search providers Agent Plugins contribute — the seam that lets a plugin (the
 * bundled `meilisearch` one today) add a search backend without core naming one. The sibling of
 * `mail-adapter-registry.ts`.
 *
 * A plugin opts in by shipping {@link SEARCH_PROVIDERS_FILENAME} at its root: a data-only list of
 * `{ id, label, module }` (parsed by `@jini-ai/search/contribution`). `module` is a plain-JS `.mjs`
 * file inside the plugin whose default export is a `SearchProvider`.
 *
 * TRUST RULE (fail closed), Jini's one executable loader: a module runs in this process, so it loads
 * only when the plugin is ACTIVE, its installed digest is the one `bundled-digests.json` records
 * (only plugins Tovu shipped), and the module path stays inside the plugin root and ends in `.mjs`.
 * Jini's contribution also refuses a provider declaring `acceptsRestricted` (vendors get public
 * content only) and one whose own id differs from its manifest id. Every drop is a refusal line,
 * never a throw. The result goes to `contributeProviders` (`@jini-ai/search/contribution`), which
 * offers it to the site-search provider registry and appends that registry's own refusals.
 */

/** The file a plugin ships at its root to contribute search providers. */
export const SEARCH_PROVIDERS_FILENAME = "tovu-search-providers.json";

export type LoadedSearchProviders = PluginContributionResult<LoadedProviderContribution<SearchProvider>>;

const searchProviderContribution = defineSearchProviderContribution({ filename: SEARCH_PROVIDERS_FILENAME });

/**
 * The search providers this workspace's installed, active, Tovu-shipped Agent Plugins contribute.
 * Read fresh on each call; Node caches each module import per file URL, and installed digest
 * directories never change.
 *
 * @throws Nothing for a plugin-level fault; only a filesystem fault listing the package directory itself.
 * @param required - Contribution loader from this boot's lifecycle; no site-dependent module default.
 * @complexity O(p) installed plugins, one small read plus one import per declared provider.
 */
export async function loadSearchProviderContributions(ctx: { readonly workspaceId: string }, required: { readonly loadContributions: LoadPluginContributions }): Promise<LoadedSearchProviders> {
  return required.loadContributions({ ...ctx, definition: searchProviderContribution }, { orderByPluginId: true });
}

/**
 * The providers read straight from a plugin's SOURCE directory, with no install, activation or
 * digest gate. For tests only, where the directory is this product's own `content/agent-plugins/<id>/`.
 *
 * @complexity O(p) providers, one import each.
 */
export async function loadSearchProviderContributionsFromSource(plugin: TrustedPluginPackage, _optional: Record<string, never> = {}): Promise<LoadedSearchProviders> {
  return loadPluginContributionsFromSource({ plugin, definition: searchProviderContribution });
}

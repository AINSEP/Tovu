import path from "node:path";

import { contributeProviders, defineProviderContribution, type ProviderContributionDescriptor } from "@jini-ai/agent-plugins/lifecycle";
import { createObjectStoreRegistry, OBJECT_STORE_CONTRACT, objectStoreProviderFault, type ObjectStoreProvider } from "@jini-ai/core/object-store";
import type { ProviderRegistry } from "@jini-ai/core/provider-registry";
import { createLocalFsObjectStoreProvider } from "@jini-ai/platform/object-store";

import { bundledContributionSources } from "../agent-plugins/bundled-contribution-sources.js";
import { loadPluginContributionsFromSource, type LoadPluginContributions } from "../agent-plugins/lifecycle.js";
import type { DeployHostKit } from "../deployments/deploy-targets/types.js";

/**
 * @file The site's object-store providers: the built-in `local` filesystem provider (the registry
 * default) plus every provider a trusted Agent Plugin contributes through
 * {@link OBJECT_STORES_FILENAME} — today the bundled s3-compatible plugin's `s3_compatible`.
 *
 * Plugin providers load through Jini's `defineProviderContribution`, so a provider module passes the
 * same gates as every executable seam (active plugin, bundled digest, contained `.mjs`); a bad one is
 * a refusal line, never a boot crash. Core owns the generic contract (`@jini-ai/core/object-store`);
 * this file is only Tovu's wiring.
 */

/** The file a plugin ships at its root to contribute object-store providers. */
export const OBJECT_STORES_FILENAME = "tovu-object-stores.json";

/** What a plain-JS provider module cannot import: SigV4 signing, plus optional request tracing. */
export interface ObjectStoreHost {
  readonly createSigV4Client: DeployHostKit["createSigV4Client"];
  readonly wrapFetch?: (fetchFn: typeof fetch) => typeof fetch;
}

export type TovuObjectStoreProvider = ObjectStoreProvider<ObjectStoreHost>;

export interface LoadedObjectStoreRegistry {
  readonly registry: ProviderRegistry<TovuObjectStoreProvider>;
  /** Log-safe, one line per provider that was not loaded and why. */
  readonly refusals: readonly string[];
}

const MAX_LABEL_LENGTH = 100;

type ParseResult = { readonly ok: true; readonly descriptors: readonly ProviderContributionDescriptor[] } | { readonly ok: false; readonly reason: string };

const objectStoreContribution = defineProviderContribution<ProviderContributionDescriptor, TovuObjectStoreProvider>({
  contract: OBJECT_STORE_CONTRACT, filename: OBJECT_STORES_FILENAME,
  parse: ({ raw }) => parseObjectStoresFile(raw),
  validate: ({ exported }) => objectStoreProviderFault({ provider: exported }) ?? exported as TovuObjectStoreProvider,
});

/**
 * A registry seeded with `local` (rooted at the site's uploads folder), without plugin providers.
 * @complexity O(1).
 */
function seededRegistry(required: { readonly uploadsDir: string }): ProviderRegistry<TovuObjectStoreProvider> {
  return createObjectStoreRegistry<ObjectStoreHost>({}, { seed: [{ id: "local", label: "This server's disk", provider: createLocalFsObjectStoreProvider({ rootDir: required.uploadsDir }) }] });
}

/**
 * This workspace's providers from its installed, activated Agent Plugins. Read fresh per call.
 * @complexity O(p) installed plugins, one import per declared provider.
 */
export async function loadObjectStoreRegistry(
  required: { readonly workspaceId: string; readonly uploadsDir: string; readonly loadContributions: LoadPluginContributions },
  _optional: Record<string, never> = {}
): Promise<LoadedObjectStoreRegistry> {
  const registry = seededRegistry(required);
  const loaded = await required.loadContributions({ workspaceId: required.workspaceId, definition: objectStoreContribution }, { orderByPluginId: true });
  return { registry, refusals: contributeProviders({ registry, loaded }).refusals };
}

/**
 * Providers read straight from this product's own bundled plugin SOURCE (`content/agent-plugins`),
 * with no install/activation gate — for the operator env override, which must not depend on a
 * plugin being switched on, exactly as `TOVU_MEDIA_BLOB_STORE=s3` never did. Never point
 * `sourceRoot` at anything an operator or third party can write.
 * @complexity O(t) bundled providers, one import each.
 */
export async function loadBundledObjectStoreRegistry(
  required: { readonly uploadsDir: string; readonly sourceRoot: string },
  _optional: Record<string, never> = {}
): Promise<LoadedObjectStoreRegistry> {
  const registry = seededRegistry(required);
  const refusals: string[] = [];
  for (const plugin of bundledContributionSources({ sourceRoot: required.sourceRoot, filename: OBJECT_STORES_FILENAME })) {
    const loaded = await loadPluginContributionsFromSource({ plugin, definition: objectStoreContribution });
    refusals.push(...contributeProviders({ registry, loaded }).refusals);
  }
  return { registry, refusals };
}

/**
 * Parses `tovu-object-stores.json`: `{ schemaVersion: 1, providers: [{ id, module, label? }] }`. Ids
 * are checked against the shared grammar by the loader before any module is imported.
 * @complexity O(n) entries.
 */
export function parseObjectStoresFile(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!isPlainObject(value) || value.schemaVersion !== 1) return { ok: false, reason: "schemaVersion must be 1" };
  if (!Array.isArray(value.providers)) return { ok: false, reason: "providers must be an array" };
  const descriptors: ProviderContributionDescriptor[] = [];
  for (const [index, entry] of value.providers.entries()) {
    const result = parseDescriptor(entry, `providers[${index}]`);
    if (typeof result === "string") return { ok: false, reason: result };
    if (descriptors.some((seen) => seen.id === result.id)) return { ok: false, reason: `providers[${index}].id '${result.id}' is declared twice` };
    descriptors.push(result);
  }
  return { ok: true, descriptors };
}

/** One manifest entry, or why it is malformed. @complexity O(1). */
function parseDescriptor(entry: unknown, at: string): ProviderContributionDescriptor | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { id, label, module } = entry;
  if (typeof id !== "string") return `${at}.id must be a string`;
  if (typeof module !== "string" || !module.endsWith(".mjs") || path.posix.isAbsolute(module)) return `${at}.module must be a relative path ending in .mjs`;
  if (label === undefined) return { id, module };
  if (typeof label !== "string" || label.trim() === "" || label.length > MAX_LABEL_LENGTH) return `${at}.label must be a non-empty string of at most ${MAX_LABEL_LENGTH} characters`;
  return { id, module, label };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

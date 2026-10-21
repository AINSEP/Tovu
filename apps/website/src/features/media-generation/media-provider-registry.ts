import path from "node:path";

import { contributeProviders, defineProviderContribution, type LoadedProviderContribution, type ProviderContributionDescriptor } from "@jini-ai/agent-plugins/lifecycle";
import {
  createMediaProviderRegistry,
  MEDIA_PROVIDER_CONTRACT,
  mediaProviderRegistryId,
  type MediaProviderContribution,
  type MediaProviderRegistry,
} from "@jini-ai/integrations/media-providers";

import type { LoadPluginContributions } from "../agent-plugins/lifecycle.js";

/**
 * @file Builds this workspace's media-generation provider registry ONCE at composition: the built-in
 * vendors (`@jini-ai/integrations/media-providers`'s default contribution set) plus every vendor an
 * Agent Plugin contributes — the same seam the mail adapters use
 * (`features/agent-plugins/mail-adapter-registry.ts`), on the shared `defineProviderContribution`.
 *
 * A plugin opts in by shipping {@link MEDIA_PROVIDERS_FILENAME} at its root: a data-only
 * `{ schemaVersion: 1, providers: [{ id, module, label? }] }`. `module` is a plain-JS `.mjs` inside the
 * plugin whose default export is one `MediaProviderContribution` — `{ provider, models, adapters }`.
 * `id` is the registry key (the public `provider.id` with `-` -> `_`), so a mismatch is refused.
 *
 * TRUST RULE (fail closed), identical to mail: a module runs in this process, so it loads only when the
 * plugin is ACTIVE, its digest is one Tovu shipped, and the module stays inside the plugin root. Every
 * drop — a bad manifest, a bad module, a duplicate vendor or model — is a refusal line, never a throw.
 * Plugin vendors get credentials the same way built-ins do (saved workspace credential, resolved per
 * call by the tool); the registry itself never holds a secret.
 */

/** The file a plugin ships at its root to contribute media-generation vendors. */
export const MEDIA_PROVIDERS_FILENAME = "tovu-media-providers.json";

export interface LoadedMediaProviderRegistry {
  readonly registry: MediaProviderRegistry;
  /** Log-safe, one sentence per plugin or vendor that was NOT loaded, and why. */
  readonly refusals: readonly string[];
}

type ParseResult = { readonly ok: true; readonly descriptors: readonly ProviderContributionDescriptor[] } | { readonly ok: false; readonly reason: string };

const mediaProviderContribution = defineProviderContribution<ProviderContributionDescriptor, MediaProviderContribution>({
  contract: MEDIA_PROVIDER_CONTRACT,
  filename: MEDIA_PROVIDERS_FILENAME,
  parse: ({ raw }) => parseMediaProvidersFile({ raw }),
  validate: ({ exported }) => asContribution(exported),
}, {
  // Per-plugin recovery: an unreadable manifest or a module/containment I/O fault costs only that
  // plugin's vendors. Without these the fault reaches loadMediaProviderRegistry's outer catch, which
  // drops every other plugin's otherwise valid vendors with it.
  onReadError: ({ plugin }) => [`media providers from '${plugin.pluginId}' were not loaded: ${MEDIA_PROVIDERS_FILENAME} could not be read`],
  importErrorReason: "module could not be read or imported",
});

/**
 * Loads plugin vendors into a fresh built-in registry. Call once per composition root (boot awaits it).
 *
 * @throws Nothing: even a filesystem fault listing the plugin directory degrades to the built-in
 *   vendors plus one refusal line, because image generation must not take boot down with it.
 * @complexity O(p) installed plugins, one small read plus one import per declared vendor.
 */
export async function loadMediaProviderRegistry(ctx: { readonly workspaceId: string }, required: { readonly loadContributions: LoadPluginContributions }): Promise<LoadedMediaProviderRegistry> {
  const registry = createMediaProviderRegistry();
  let loaded: Awaited<ReturnType<typeof loadPluginVendors>>;
  try {
    loaded = await loadPluginVendors(ctx, required);
  } catch (error) {
    return { registry, refusals: [`plugin media providers were not loaded: ${(error as Error).message}`] };
  }
  const refusals = [...loaded.refusals];
  for (const item of loaded.items) refusals.push(...contributeOne({ registry, item }));
  return { registry, refusals };
}

/**
 * Offers one plugin's vendor to the registry. A throw anywhere in that (a hostile getter in its
 * module's data, a registry fault) is that vendor's refusal line, so later plugins still load.
 * @complexity O(m) in the vendor's model count plus the registered models.
 */
function contributeOne(
  { registry, item }: { readonly registry: MediaProviderRegistry; readonly item: LoadedProviderContribution<MediaProviderContribution> },
  _optional: Record<string, never> = {},
): readonly string[] {
  try {
    const matching = keepMatchingIds([item]);
    return contributeProviders({ registry: registry.providers, loaded: matching }).refusals;
  } catch {
    return [`media provider '${item.definition.id}' from '${item.pluginId}' was not loaded: its contribution could not be registered`];
  }
}

function loadPluginVendors(ctx: { readonly workspaceId: string }, required: { readonly loadContributions: LoadPluginContributions }) {
  return required.loadContributions({ ...ctx, definition: mediaProviderContribution }, { orderByPluginId: true });
}

/** Drops items whose manifest id is not the registry key of the vendor they export. @complexity O(n). */
function keepMatchingIds(items: readonly LoadedProviderContribution<MediaProviderContribution>[]): { items: LoadedProviderContribution<MediaProviderContribution>[]; refusals: string[] } {
  const kept: LoadedProviderContribution<MediaProviderContribution>[] = [];
  const refusals: string[] = [];
  for (const item of items) {
    const expected = mediaProviderRegistryId({ id: item.definition.provider.provider.id });
    if (expected === item.definition.id) kept.push({ ...item, definition: { ...item.definition, label: item.definition.label ?? item.definition.provider.provider.label } });
    else refusals.push(`media provider '${item.definition.id}' from '${item.pluginId}' was not loaded: its module exports provider '${item.definition.provider.provider.id}' (registry id '${expected}')`);
  }
  return { items: kept, refusals };
}

/** Light structural check after the contained import; the registry's own validate does the rest. @complexity O(1). */
function asContribution(candidate: unknown): MediaProviderContribution | string {
  if (!isPlainObject(candidate) || !isPlainObject(candidate.provider) || typeof candidate.provider.id !== "string") return "its module must export { provider, models, adapters }";
  return candidate as unknown as MediaProviderContribution;
}

/**
 * Parses a plugin's {@link MEDIA_PROVIDERS_FILENAME}. Pure. Unknown keys are ignored; the id grammar is
 * checked by the shared contribution before any module is imported.
 *
 * @complexity O(a) in the declared vendor count.
 */
export function parseMediaProvidersFile({ raw }: { readonly raw: string }, _optional: Record<string, never> = {}): ParseResult {
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

/** One descriptor entry, or the reason it is invalid. @complexity O(1). */
function parseDescriptor(entry: unknown, at: string): ProviderContributionDescriptor | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { id, module, label } = entry;
  if (typeof id !== "string") return `${at}.id must be a string`;
  if (typeof module !== "string" || !module.endsWith(".mjs") || path.posix.isAbsolute(module)) return `${at}.module must be a relative path ending in .mjs`;
  if (label !== undefined && (typeof label !== "string" || label.trim() === "")) return `${at}.label must be a non-empty string when present`;
  return { id, module, ...(label === undefined ? {} : { label }) };
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

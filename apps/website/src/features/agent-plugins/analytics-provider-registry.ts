import path from "node:path";

import {
  ANALYTICS_FORWARDER_CONTRACT, ANALYTICS_INGEST_HOOK_CONTRACT, asAnalyticsForwarderModule, asAnalyticsIngestHook,
  createAnalyticsForwarderRegistry, type AnalyticsForwarderModule, type AnalyticsHooks,
} from "@jini-ai/analytics";
import type { ProviderRegistry } from "@jini-ai/core/provider-registry";

import { contributeProviders, defineProviderContribution, type LoadPluginContributions } from "./lifecycle.js";

/**
 * @file Loads the analytics providers Agent Plugins contribute: vendor FORWARDERS (Plausible /
 * PostHog / GA4-style, selected per site by `core.analytics.sink`) and `beforeIngest` HOOKS. The
 * generic seam that lets a plugin add a vendor without core naming one — same trust gate as mail
 * adapters (`mail-adapter-registry.ts`): a module runs in this process, so it loads only from an
 * ACTIVE plugin whose installed digest is a bundled one, from a contained `.mjs` path. A bad plugin
 * drops only its own providers and every drop is a refusal line, never a throw.
 *
 * Manifests are data-only: `{ schemaVersion: 1, providers: [{ id, module, label? }] }`. A
 * forwarder module's default export is an `AnalyticsForwarderModule` (it may declare its own
 * `credentialLabel`); a hook module's default export has `beforeIngest({ hit })`.
 */

/** The file a plugin ships at its root to contribute analytics vendor forwarders. */
export const ANALYTICS_FORWARDERS_FILENAME = "tovu-analytics-forwarders.json";

/** The file a plugin ships at its root to contribute analytics `beforeIngest` hooks. */
export const ANALYTICS_HOOKS_FILENAME = "tovu-analytics-hooks.json";

export interface AnalyticsProviderDescriptor {
  readonly id: string;
  /** Plugin-relative path of the `.mjs` module. */
  readonly module: string;
  readonly label?: string;
}

type ParseResult = { readonly ok: true; readonly descriptors: readonly AnalyticsProviderDescriptor[] } | { readonly ok: false; readonly reason: string };

const MAX_LABEL_LENGTH = 100;

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One descriptor entry, or why it is invalid. The id grammar is the registry's (checked before import). @complexity O(1). */
function parseDescriptor(entry: unknown, at: string): AnalyticsProviderDescriptor | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { id, module, label } = entry;
  if (typeof id !== "string") return `${at}.id must be a string`;
  if (typeof module !== "string" || !module.endsWith(".mjs") || path.posix.isAbsolute(module)) return `${at}.module must be a relative path ending in .mjs`;
  if (label === undefined) return { id, module };
  if (typeof label !== "string" || label.trim() === "" || label.length > MAX_LABEL_LENGTH) return `${at}.label must be a non-empty string`;
  return { id, module, label };
}

/**
 * Parses an analytics provider manifest. Pure; unknown keys are ignored.
 * @complexity O(p) declared providers.
 */
export function parseAnalyticsProvidersFile(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!isPlainObject(value) || value.schemaVersion !== 1) return { ok: false, reason: "schemaVersion must be 1" };
  if (!Array.isArray(value.providers)) return { ok: false, reason: "providers must be an array" };
  const descriptors: AnalyticsProviderDescriptor[] = [];
  for (const [index, entry] of value.providers.entries()) {
    const result = parseDescriptor(entry, `providers[${index}]`);
    if (typeof result === "string") return { ok: false, reason: result };
    if (descriptors.some((seen) => seen.id === result.id)) return { ok: false, reason: `providers[${index}].id '${result.id}' is declared twice` };
    descriptors.push(result);
  }
  return { ok: true, descriptors };
}

const parse = ({ raw }: { readonly raw: string }) => parseAnalyticsProvidersFile(raw);

export const analyticsForwarderContribution = defineProviderContribution<AnalyticsProviderDescriptor, AnalyticsForwarderModule>({
  contract: ANALYTICS_FORWARDER_CONTRACT, filename: ANALYTICS_FORWARDERS_FILENAME, parse,
  validate: ({ exported }) => asAnalyticsForwarderModule({ exported }),
});

export const analyticsIngestHookContribution = defineProviderContribution<AnalyticsProviderDescriptor, AnalyticsHooks>({
  contract: ANALYTICS_INGEST_HOOK_CONTRACT, filename: ANALYTICS_HOOKS_FILENAME, parse,
  validate: ({ exported }) => asAnalyticsIngestHook({ exported }),
});

export interface AnalyticsProviders {
  /** Keyed vendor forwarders; `core.analytics.sink` selects one per site. */
  readonly forwarders: ProviderRegistry<AnalyticsForwarderModule>;
  /** `beforeIngest` handlers in a stable order (plugin id, then declaration order). */
  readonly hooks: readonly AnalyticsHooks[];
  /** Log-safe, one sentence per provider or plugin that was NOT loaded, and why. */
  readonly refusals: readonly string[];
}

/**
 * Builds this workspace's analytics providers from its installed Agent Plugins.
 * @throws Nothing for a plugin-level fault; only a fault listing the package directory itself.
 * @complexity O(p) installed plugins: two small reads plus one import per declared provider.
 */
export async function loadAnalyticsProviders(
  ctx: { readonly workspaceId: string },
  required: { readonly loadContributions: LoadPluginContributions },
): Promise<AnalyticsProviders> {
  const [forwarderLoad, hookLoad] = await Promise.all([
    required.loadContributions({ ...ctx, definition: analyticsForwarderContribution }, { orderByPluginId: true }),
    required.loadContributions({ ...ctx, definition: analyticsIngestHookContribution }, { orderByPluginId: true }),
  ]);
  const forwarders = createAnalyticsForwarderRegistry();
  const contributed = contributeProviders({ registry: forwarders, loaded: forwarderLoad });
  return {
    forwarders,
    hooks: hookLoad.items.map((item) => item.definition.provider),
    refusals: [...contributed.refusals, ...hookLoad.refusals],
  };
}

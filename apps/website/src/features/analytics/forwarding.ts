import {
  composeBeforeIngestHooks, selectAnalyticsForwarder,
  type AnalyticsForwarderCredential, type AnalyticsForwarderModule, type AnalyticsHooks as EngineAnalyticsHooks,
  type BoundAnalyticsForwarder,
} from "@jini-ai/analytics";
import type { Clock as ClockPort, HttpClientPort as EngineHttpClientPort } from "@jini-ai/core/primitives";
import type { ProviderRegistry } from "@jini-ai/core/provider-registry";
import type { AnalyticsConfigPort, AnalyticsHooks } from "./ports.js";

/**
 * @file Host wiring for analytics vendor forwarding and `beforeIngest` hooks
 * (`.cloud-coord/analytics-DESIGN.md`). The mechanism — registry, fan-out sink, hook chain, the
 * minimised forwarded hit — is `@jini-ai/analytics`; this file only decides, per beacon request,
 * WHICH forwarder (if any) the site's `core.analytics.sink` names and WHETHER this visitor's
 * cookie consent allows it, and binds the vendor to its credential.
 *
 * Every function here fails toward NOT sending data to a vendor and never throws into the beacon:
 * the built-in sink must keep receiving hits whatever a vendor, plugin or credential does.
 */

/** What forwarding needs from the plugin-contributed provider set. */
export interface AnalyticsProviderSet {
  readonly forwarders: ProviderRegistry<AnalyticsForwarderModule>;
  readonly hooks: readonly EngineAnalyticsHooks[];
  readonly refusals: readonly string[];
}

/** Plugin providers are re-read at most this often: a beacon is high-volume, a plugin change is not. */
export const ANALYTICS_PROVIDERS_TTL_MS = 60_000;

/**
 * Memoises the provider load for `ttlMs`. A failed load is not cached (the next beacon retries);
 * refusals are reported once per successful load.
 * @complexity O(1) per call; one plugin load per TTL window.
 */
export function cacheAnalyticsProviders(
  required: { load: () => Promise<AnalyticsProviderSet>; clock: Pick<ClockPort, "nowMs"> },
  optional: { ttlMs?: number; warn?: (message: string) => void } = {},
): () => Promise<AnalyticsProviderSet> {
  const { load, clock } = required;
  const { ttlMs = ANALYTICS_PROVIDERS_TTL_MS, warn = (message: string) => console.warn(message) } = optional;
  let cached: { at: number; value: Promise<AnalyticsProviderSet> } | undefined;
  return () => {
    const now = clock.nowMs();
    if (cached && now - cached.at < ttlMs) return cached.value;
    const value = load().then((set) => {
      for (const refusal of set.refusals) warn(`[analytics] ${refusal}`);
      return set;
    });
    cached = { at: now, value };
    value.catch(() => { if (cached?.value === value) cached = undefined; });
    return value;
  };
}

export interface AnalyticsForwardingRequired<R> {
  workspaceId: string;
  config: AnalyticsConfigPort;
  loadProviders: () => Promise<AnalyticsProviderSet>;
  /** The site's cookie-consent decision for this request's visitor (the consent engine's own reader). */
  consentAllowsAnalytics: (required: { request: R }) => Promise<boolean>;
  /** Resolves a vendor key from the host credential store; null when none is saved. */
  resolveCredential: (required: { label: string }) => Promise<AnalyticsForwarderCredential | null>;
  httpClient: EngineHttpClientPort;
}

/** The forwarder this site names and this visitor allows, or none. @complexity O(1) + I/O. */
async function resolveForwarders<R>(required: AnalyticsForwardingRequired<R>, request: R, warn: (message: string) => void): Promise<BoundAnalyticsForwarder[]> {
  const { sink } = await required.config.get({ workspaceId: required.workspaceId });
  const { forwarders } = await required.loadProviders();
  const { entry, warning } = selectAnalyticsForwarder({ registry: forwarders, sinkId: sink });
  if (warning) warn(`[analytics] ${warning}`);
  if (!entry || !(await required.consentAllowsAnalytics({ request }))) return [];
  const label = entry.provider.credentialLabel;
  const credential = label === undefined ? null : await required.resolveCredential({ label });
  if (label !== undefined && credential === null) {
    warn(`[analytics] analytics sink '${entry.id}' has no saved "${label}" credential; hits stay in the built-in sink only`);
    return [];
  }
  const forwarder = entry.provider.create({ credential, kit: { httpClient: required.httpClient } });
  return [{ id: entry.id, forwarder, context: { workspaceId: required.workspaceId, mode: "live" } }];
}

/**
 * Builds the per-request forwarder resolver the beacon route hands to the fan-out sink.
 * `"local"` short-circuits before any plugin load or consent read. Any failure → no forwarders.
 * @complexity O(1) per request: one cached config read, one cached provider load, at most one
 * consent receipt read and one credential read.
 */
export function createAnalyticsForwarding<R>(
  required: AnalyticsForwardingRequired<R>,
  optional: { warn?: (message: string) => void } = {},
): (required: { request: R }) => Promise<readonly BoundAnalyticsForwarder[]> {
  const warn = optional.warn ?? ((message: string) => console.warn(message));
  return async ({ request }) => {
    try {
      return await resolveForwarders(required, request, warn);
    } catch (error) {
      warn(`[analytics] vendor forwarding skipped: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  };
}

/**
 * Host-shaped (`beforeIngest(hit)`) hooks over the plugin-contributed chain. The chain is read per
 * hit through the cached loader, so hooks need no boot-time await; with no handlers (or a failed
 * load) the hit passes through unchanged — exactly the hook-free path.
 * @complexity O(h) handlers per hit.
 */
export function createPluginAnalyticsHooks(
  required: { loadProviders: () => Promise<AnalyticsProviderSet> },
  optional: { warn?: (message: string) => void } = {},
): AnalyticsHooks {
  const warn = optional.warn ?? ((message: string) => console.warn(message));
  const report = ({ index, message }: { index: number; message: string }) => warn(`[analytics] beforeIngest hook #${index} failed and was skipped: ${message}`);
  return {
    beforeIngest: async (hit) => {
      let hooks: readonly EngineAnalyticsHooks[];
      try {
        hooks = (await required.loadProviders()).hooks;
      } catch {
        return hit;
      }
      const chain = composeBeforeIngestHooks({ hooks }, { report });
      return chain ? chain.beforeIngest({ hit }) : hit;
    },
  };
}

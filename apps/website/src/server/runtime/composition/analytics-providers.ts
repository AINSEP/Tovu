import type { Request } from "express";
import type { Clock as ClockPort, UUID } from "@jini-ai/core/primitives";
import { readRequestAnalyticsProof } from "@jini-ai/cms/consent/express";

import { loadAnalyticsProviders } from "#src/features/agent-plugins/analytics-provider-registry";
import type { LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import type { AnalyticsForwarderCredential } from "@jini-ai/analytics";
import { ANALYTICS_PROVIDERS_TTL_MS, cacheAnalyticsProviders, createAnalyticsForwarding, createPluginAnalyticsHooks } from "#src/features/analytics/forwarding";
import type { AnalyticsIngestRouteDeps } from "#src/features/analytics/jini-adapters";
import type { HttpClientPort } from "#src/platform/http/ports";
import type { RouteDeps } from "#src/server/routes/types";
import { createSiteConsentPorts } from "../../inbound/public-http/middleware/site-consent.js";
import { readSiteVisitorConsent } from "../../inbound/public-http/middleware/site-cookie-consent.js";

/**
 * @file Composition glue for analytics vendor forwarding (`.cloud-coord/analytics-DESIGN.md`):
 * `buildAnalyticsProviders` is what the real root (`deps.ts`) puts on `RouteDeps`, and
 * `analyticsProviderRouteDeps` is what `createApp` adds to the public beacon route. The consent
 * decision is the consent engine's own per-request reader over the SAME ports the consent
 * middleware mounts — not a second gate.
 */

/**
 * The real root's `analyticsProviders`: plugin providers and vendor credentials (both cached per TTL) from the
 * custom-credential store, and the guarded egress client adapted to the engine's object-shaped port.
 * @complexity O(1) at build; loads are lazy and cached.
 */
export function buildAnalyticsProviders(
  required: {
    workspaceId: UUID;
    loadContributions: LoadPluginContributions;
    clock: Pick<ClockPort, "nowMs">;
    /** `resolveCustomCredentialByLabel` bound to the site's credential repo + sealer. */
    findCredential: (required: { workspaceId: UUID; label: string }) => Promise<{ baseUrl: string; connection: { token: string; username?: string } } | null>;
    httpClient: HttpClientPort;
  },
  _optional: Record<string, never> = {},
): NonNullable<RouteDeps["analyticsProviders"]> {
  const { workspaceId, loadContributions, clock, findCredential, httpClient } = required;
  const resolve = async (label: string): Promise<AnalyticsForwarderCredential | null> => {
    const resolved = await findCredential({ workspaceId, label });
    if (!resolved) return null;
    const { token, username } = resolved.connection;
    return { token, baseUrl: resolved.baseUrl, ...(username ? { username } : {}) };
  };
  // A beacon is high-volume: decrypt a vendor key at most once per TTL per label. A rotated key
  // takes effect within the TTL; a failed lookup is not cached (the next beacon retries).
  const credentials = new Map<string, { at: number; value: Promise<AnalyticsForwarderCredential | null> }>();
  return {
    load: cacheAnalyticsProviders({ load: () => loadAnalyticsProviders({ workspaceId }, { loadContributions }), clock }),
    resolveCredential: ({ label }) => {
      const now = clock.nowMs();
      const hit = credentials.get(label);
      if (hit && now - hit.at < ANALYTICS_PROVIDERS_TTL_MS) return hit.value;
      const value = resolve(label);
      credentials.set(label, { at: now, value });
      value.catch(() => { if (credentials.get(label)?.value === value) credentials.delete(label); });
      return value;
    },
    httpClient: { send: ({ request }) => httpClient.send(request) },
  };
}

/**
 * Beacon-route additions: per-request forwarders and the plugin `beforeIngest` chain. Empty when
 * the root supplied no providers (hermetic root), keeping the built-in-only, hook-free path.
 * @complexity O(1) at registration.
 */
export function analyticsProviderRouteDeps(
  routeDeps: RouteDeps,
  _optional: Record<string, never> = {},
): Pick<AnalyticsIngestRouteDeps, "forwarders" | "hooks"> {
  const providers = routeDeps.analyticsProviders;
  if (!providers) return {};
  const trustedRegionHeader = routeDeps.consentTrustedRegionHeader;
  const consentPorts = createSiteConsentPorts({ deps: routeDeps }, trustedRegionHeader ? { trustedRegionHeader } : {});
  return {
    forwarders: createAnalyticsForwarding<unknown>({
      workspaceId: routeDeps.workspaceId,
      config: routeDeps.analyticsConfig,
      loadProviders: providers.load,
      consentAllowsAnalytics: async ({ request }) => routeDeps.cookieConsent
        ? (await readSiteVisitorConsent({ deps: routeDeps, req: request as Request })).allowed.analytics
        : Boolean(await readRequestAnalyticsProof({ ports: consentPorts, request: request as Request })),
      resolveCredential: providers.resolveCredential,
      httpClient: providers.httpClient,
    }),
    hooks: createPluginAnalyticsHooks({ loadProviders: providers.load }),
  };
}

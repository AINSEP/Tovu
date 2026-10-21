import type { Request } from "express";
import type { Clock as ClockPort, UUID } from "@jini-ai/core/primitives";
import { readRequestConsentChoices } from "@jini-ai/cms/consent/express";

import { loadAnalyticsProviders } from "#src/features/agent-plugins/analytics-provider-registry";
import type { LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import { cacheAnalyticsProviders, createAnalyticsForwarding, createPluginAnalyticsHooks } from "#src/features/analytics/forwarding";
import type { AnalyticsIngestRouteDeps } from "#src/features/analytics/jini-adapters";
import { resolveCustomCredentialByLabel, type CustomCredentialResolveDeps } from "#src/features/custom-credentials/store";
import type { HttpClientPort } from "#src/platform/http/ports";
import type { RouteDeps } from "#src/server/routes/types";
import { createSiteConsentPorts } from "../../inbound/public-http/middleware/site-consent.js";

/**
 * @file Composition glue for analytics vendor forwarding (`.cloud-coord/analytics-DESIGN.md`):
 * `buildAnalyticsProviders` is what the real root (`deps.ts`) puts on `RouteDeps`, and
 * `analyticsProviderRouteDeps` is what `createApp` adds to the public beacon route. The consent
 * decision is the consent engine's own per-request reader over the SAME ports the consent
 * middleware mounts — not a second gate.
 */

/**
 * The real root's `analyticsProviders`: plugin providers (cached), vendor credentials from the
 * custom-credential store, and the guarded egress client adapted to the engine's object-shaped port.
 * @complexity O(1) at build; loads are lazy and cached.
 */
export function buildAnalyticsProviders(
  required: {
    workspaceId: UUID;
    loadContributions: LoadPluginContributions;
    clock: Pick<ClockPort, "nowMs">;
    credentials: CustomCredentialResolveDeps;
    httpClient: HttpClientPort;
  },
  _optional: Record<string, never> = {},
): NonNullable<RouteDeps["analyticsProviders"]> {
  const { workspaceId, loadContributions, clock, credentials, httpClient } = required;
  return {
    load: cacheAnalyticsProviders({ load: () => loadAnalyticsProviders({ workspaceId }, { loadContributions }), clock }),
    resolveCredential: async ({ label }) => {
      const resolved = await resolveCustomCredentialByLabel(credentials, { workspaceId, label });
      if (!resolved) return null;
      const { token, username } = resolved.connection;
      return { token, baseUrl: resolved.baseUrl, ...(username ? { username } : {}) };
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
      consentAllowsAnalytics: async ({ request }) =>
        (await readRequestConsentChoices({ ports: consentPorts, request: request as Request })).analytics,
      resolveCredential: providers.resolveCredential,
      httpClient: providers.httpClient,
    }),
    hooks: createPluginAnalyticsHooks({ loadProviders: providers.load }),
  };
}

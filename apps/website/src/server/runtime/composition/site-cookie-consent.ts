/** @file Composition for `@jini-ai/cookie-consent`: the one engine switch and the server analytics gate.
 * P4 cleanup: the old engine goes, `selectCookieConsent` always returns the deps and the env switch is deleted. */
import type { Request } from 'express';
import type { RegionResolver } from '@jini-ai/cookie-consent';
import type { LoadPluginContributions } from '#src/features/agent-plugins/lifecycle';
import { loadSiteRegionResolvers } from '#src/features/consent/region-plugins';
import type { RouteDeps } from '#src/server/routes/types';
import { readSiteAnalyticsProof, siteReceiptAllowsAnalytics, type SiteCookieConsentDeps } from '../../inbound/public-http/middleware/site-cookie-consent.js';

/** Region readers are re-read at most once a minute, so switching a host plugin on or off applies
 * without a restart and a page view never waits on the plugin directory. */
const REGION_TTL_MS = 60_000;

/**
 * THE switch. `TOVU_CONSENT_ENGINE=cookie-consent` selects the new engine; anything else keeps the old
 * one. `TOVU_CONSENT_INGRESS` names the host plugin in front of this server (e.g. `cloudflare`); only
 * its region readers are trusted. `TOVU_CONSENT_REGION_HEADER` (older setting) still works as one
 * more trusted header. Neither set = strict for everyone (Fly, Electron).
 * @complexity O(1); region readers load lazily.
 */
export function selectCookieConsent(
  { workspaceId, loadContributions }: { workspaceId: string; loadContributions: LoadPluginContributions },
  { env = process.env, nowMs = Date.now }: { env?: NodeJS.ProcessEnv; nowMs?: () => number } = {},
): SiteCookieConsentDeps | undefined {
  if (env.TOVU_CONSENT_ENGINE?.trim() !== 'cookie-consent') return undefined;
  const ingress = env.TOVU_CONSENT_INGRESS?.trim() || undefined;
  const legacyHeader = env.TOVU_CONSENT_REGION_HEADER?.trim() || undefined;
  let cached: { at: number; value: Promise<readonly RegionResolver[]> } | undefined;
  return {
    regionResolvers: () => {
      if (cached && nowMs() - cached.at < REGION_TTL_MS) return cached.value;
      cached = { at: nowMs(), value: loadSiteRegionResolvers({ workspaceId, loadContributions }, { ingress, legacyHeader }) };
      return cached.value;
    },
  };
}

/** Replace the visitor analytics proof/delivery ports with the cookie-consent reading of the same rule:
 * a server receipt for an analytics grant under the current policy. Excluded visitors are never captured.
 * @complexity O(cookie header) plus one policy read per call. */
export function bindCookieConsentAnalyticsGate(
  { deps }: { deps: RouteDeps },
  { isExcluded = async () => false }: { isExcluded?: (required: { request: Request }) => Promise<boolean> } = {},
): void {
  deps.visitorAnalyticsProof = async ({ request }) => {
    try { return await isExcluded({ request }) ? undefined : await readSiteAnalyticsProof({ deps, req: request }); }
    catch { return undefined; }
  };
  // Rechecked at delivery: a withdrawn (retired) or forged receipt, or one from before the latest
  // publication, no longer counts.
  deps.visitorAnalyticsDeliveryAllowed = async ({ proof }) => {
    try { return await siteReceiptAllowsAnalytics({ deps, proof }); }
    catch { return false; }
  };
}

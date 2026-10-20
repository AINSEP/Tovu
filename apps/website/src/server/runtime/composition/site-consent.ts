/** @file Composition-only bindings for site consent administration and public delivery. */
import { createSiteConsentService } from '#src/features/consent/service';
import { readSiteConsentAuthoringSettings } from '#src/features/consent/settings';
import { fetchPublishedPage, resolveSameOriginPath } from '#src/features/site-inspection/published-page';
import type { RouteDeps } from '#src/server/routes/types';
import { createPrivacyPageCheck, createSiteConsentAutoEnable, TOVU_NECESSARY_SCRIPTS } from '../../inbound/public-http/middleware/site-consent.js';

/** Reuse the existing local-render owner (bounded reads, timeout, finally-close, no external URL).
 * @example bindSiteConsentService({ deps })
 * @complexity O(1) setup; operations inherit the shared renderer/repository bounds. */
export function bindSiteConsentService({ deps }: { deps: RouteDeps }, _options = {}) {
  return createSiteConsentService({ ports: {
    workspaceId: deps.workspaceId, authorize: deps.authorize, store: deps.consentStore,
    ready: deps.siteTitleReady ?? deps.settingsReady, clock: deps.clock, ids: deps.idGen,
    trustedRegion: Boolean(deps.consentTrustedRegionHeader),
    readLegacy: async () => readSiteConsentAuthoringSettings({ settingsRepo: deps.settingsRepo, workspaceId: deps.workspaceId }, { autoEnable: createSiteConsentAutoEnable({ deps }) }),
    privacyPageExists: createPrivacyPageCheck({ deps }),
    necessaryScripts: TOVU_NECESSARY_SCRIPTS,
    renderPage: async ({ path }) => {
      const localPath = resolveSameOriginPath(path, 'http://127.0.0.1');
      const page = await fetchPublishedPage({ createSiteApp: () => deps.createSiteApp({ consentAudit: true }), observability: deps.observability }, { path: localPath }, { maxBytes: 1_000_000, timeoutMs: 15_000 });
      return { html: page.body ?? '', ok: page.ok, truncated: page.truncated };
    },
  } });
}

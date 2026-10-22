/** @file Composition-only bindings for site consent administration and public delivery. */
import path from 'node:path';
import { readConsentReceiptStorage } from '@jini-ai/cms/consent/node';
import { createSiteConsentService } from '#src/features/consent/service';
import { readSiteConsentAuthoringSettings } from '#src/features/consent/settings';
import { fetchPublishedPage, resolveSameOriginPath } from '#src/features/site-inspection/published-page';
import type { RouteDeps } from '#src/server/routes/types';
import { CONSENT_RECEIPTS_DIR_NAME, createPrivacyPageCheck, createSiteConsentAutoEnable, TOVU_NECESSARY_SCRIPTS } from '../../inbound/public-http/middleware/site-consent.js';

/** Reuse the existing local-render owner (bounded reads, timeout, finally-close, no external URL).
 * @example bindSiteConsentService({ deps })
 * @complexity O(1) setup; operations inherit the shared renderer/repository bounds. */
export function bindSiteConsentService({ deps }: { deps: RouteDeps }, _options = {}) {
  return createSiteConsentService({ ports: siteConsentPorts({ deps }) });
}

/** The consent service's ports bound to one site's deps; split from {@link bindSiteConsentService}
 * so each port's fallback and failure arm is unit-testable without building the service.
 * @complexity O(1) setup. */
export function siteConsentPorts({ deps }: { deps: RouteDeps }, _options = {}): Parameters<typeof createSiteConsentService>[0]["ports"] {
  return {
    workspaceId: deps.workspaceId, authorize: deps.authorize, store: deps.consentStore,
    ready: deps.siteTitleReady ?? deps.settingsReady, clock: deps.clock, ids: deps.idGen,
    trustedRegion: Boolean(deps.consentTrustedRegionHeader),
    readLegacy: async () => readSiteConsentAuthoringSettings({ settingsRepo: deps.settingsRepo, workspaceId: deps.workspaceId }, { autoEnable: createSiteConsentAutoEnable({ deps }) }),
    privacyPageExists: createPrivacyPageCheck({ deps }),
    necessaryScripts: TOVU_NECESSARY_SCRIPTS,
    receiptStorage: async () => {
      try { return await readConsentReceiptStorage({ directory: path.join(deps.siteBinding.dir, CONSENT_RECEIPTS_DIR_NAME) }); }
      catch (error) { console.error('[consent] receipt storage check failed'); throw error; }
    },
    renderPage: async ({ path }) => {
      const localPath = resolveSameOriginPath(path, 'http://127.0.0.1');
      const page = await fetchPublishedPage({ createSiteApp: () => deps.createSiteApp({ consentAudit: true }), observability: deps.observability }, { path: localPath }, { maxBytes: 1_000_000, timeoutMs: 15_000 });
      return { html: page.body ?? '', ok: page.ok, truncated: page.truncated };
    },
  };
}

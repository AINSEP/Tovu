import { useMemo } from 'react';
import { CONSENT_PREVIEW_DESKTOP_WIDTH, ConsentBannerFields, ConsentLookFields, ConsentPreviewFrame, ConsentRulesFields, consentPreviewScale } from '@jini-ai/cookie-consent/react';
import type { ConsentScreenUi } from '@jini-ai/admin/screens/consent/CookieConsent';
import { consentTranslation, type ConsentTranslation } from '@jini-ai/admin/screens/consent/consent-i18n';
import type { ConsentErrors } from '@jini-ai/admin/screens/consent/rules';
import { createConsentRevisionsPort } from '@jini-ai/admin/screens/consent/settings.hooks';
import { useAdminLocale } from '@/hooks/use-admin-locale.hooks';
import { WORKSPACE_ID } from '../../lib/admin-http/config';
import { ApiError, authenticatedAdminRequest, describeApiError } from '@/lib/admin-http/request';

/**
 * @file The host half of Administration → Cookie Consent (`@jini-ai/admin/screens/consent`): the
 * revisions port over this admin's authenticated API, the error reader over its `ApiError`, the
 * locale-bound translation hook, and the consent engine's sections the page renders.
 */

/** The page's port onto this workspace's consent revisions routes
 * (`apps/website/src/server/inbound/admin-http/routes/consent/routes.ts`, contract in
 * `apps/website/src/features/consent/README.md`). */
export const defaultConsentRevisionsPort = createConsentRevisionsPort({ request: (required, _optional = {}) => authenticatedAdminRequest(required), workspaceId: WORKSPACE_ID });

export const consentErrors: ConsentErrors = {
  /** A stale draft/published revision (HTTP 409): reload and review, never retry over it. */
  isConflict: ({ error }, _optional = {}) => error instanceof ApiError && error.status === 409,
  describe: ({ error, fallback }, _optional = {}) => describeApiError({ e: error, fallback }),
};

export const consentUi: ConsentScreenUi = {
  BannerFields: ConsentBannerFields, LookFields: ConsentLookFields, RulesFields: ConsentRulesFields, PreviewFrame: ConsentPreviewFrame,
  previewDesktopWidth: CONSENT_PREVIEW_DESKTOP_WIDTH, previewScale: consentPreviewScale,
};

/** Binds the consent copy to the admin's resolved locale. @complexity O(1) per lookup. */
export function useConsentTranslate(): ConsentTranslation {
  const locale = useAdminLocale();
  return useMemo(() => consentTranslation({ locale }), [locale]);
}

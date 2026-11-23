import { CookieConsent as ConsentPage } from '@jini-ai/admin/screens/consent/CookieConsent';
import { consentErrors, consentUi, defaultConsentRevisionsPort, useConsentTranslate } from './consent-ports';
import '@jini-ai/admin/screens/consent/consent-settings.css';

/** @file Mounts the Jini Cookie Consent page with this admin's port, error reader, locale and the
 * consent engine's sections. `panel-pages.ts` lazy-loads it. */
export function CookieConsent({ tabId }: { tabId?: string | null }) {
  return <ConsentPage tabId={tabId} port={defaultConsentRevisionsPort} useTranslate={useConsentTranslate} errors={consentErrors} ui={consentUi} />;
}

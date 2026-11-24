import { CookieConsent as ConsentPage } from '@jini-ai/admin/screens/consent/CookieConsent';
import { useConsentPage, useConsentPreview, useConsentPreviewScale, useConsentReadiness } from '@jini-ai/admin/screens/consent/use-consent-page.hooks';
import { useAdminKit } from '@jini-ai/admin/react/kit';
import { agentHandle } from '@jini-ai/core/agent-handles';
import { consentErrors, consentUi, defaultConsentRevisionsPort, useConsentTranslate } from './consent-ports';
import type { CookieConsentHooks } from '@jini-ai/admin/screens/consent/CookieConsent';
import '@jini-ai/admin/screens/consent/consent-settings.css';
import './consent-screen.css';

const consentHooks: CookieConsentHooks = { useConsentPage, useConsentReadiness, useConsentPreview, useConsentPreviewScale, useAdminKit };

/** @file Mounts the Jini Cookie Consent page with this admin's port, error reader, locale and the
 * consent engine's sections. `panel-pages.ts` lazy-loads it. */
export function CookieConsent({ tabId }: { tabId?: string | null }) {
  return <ConsentPage tabId={tabId} port={defaultConsentRevisionsPort} useTranslate={useConsentTranslate} errors={consentErrors} ui={consentUi} hooks={consentHooks} agentHandle={agentHandle} />;
}

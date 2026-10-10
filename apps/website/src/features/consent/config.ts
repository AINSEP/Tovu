/** Host-owned site copy/policy linkage; shared by server registration and its admin adapter. */
export const SITE_CONSENT_NAMESPACE = 'core.consent';
export const SITE_CONSENT_DEFAULTS = {
  enabled: false,
  regionMode: 'auto' as 'auto' | 'opt-in' | 'opt-out',
  policyVersion: '1',
  privacyPolicyUrl: '',
  title: 'Your cookie choices',
  message: 'We use necessary cookies to run this site. You can choose whether to allow functional, analytics, and marketing cookies.',
  acceptLabel: 'Accept all',
  rejectLabel: 'Reject non-essential',
  preferencesLabel: 'Cookie preferences',
};
export type SiteConsentSettings = typeof SITE_CONSENT_DEFAULTS;

/** Host-owned site copy/policy linkage; shared by server registration and its admin adapter.
 * Kept free of Node and engine imports: the admin bundle imports this file directly. */
export const SITE_CONSENT_NAMESPACE = 'core.consent';

/** Where the first-visit banner sits; the engine owns the matching CSS. */
export const SITE_CONSENT_PLACEMENTS = ['bottom-bar', 'bottom-left', 'bottom-right', 'top-bar'] as const;
export type SiteConsentPlacement = typeof SITE_CONSENT_PLACEMENTS[number];

export const SITE_CONSENT_REGION_MODES = ['auto', 'opt-in', 'opt-out'] as const;
export type SiteConsentRegionMode = typeof SITE_CONSENT_REGION_MODES[number];

export const SITE_CONSENT_DEFAULTS = {
  enabled: false,
  // Opt-in everywhere is the safe default: "auto" only differs once a trusted region header exists.
  regionMode: 'opt-in' as SiteConsentRegionMode,
  policyVersion: '1',
  privacyPolicyUrl: '',
  secondaryLinkLabel: '',
  secondaryLinkUrl: '',
  title: 'Your cookie choices',
  message: 'We use necessary cookies to run this site. You can choose whether to allow functional, analytics, and marketing cookies.',
  acceptLabel: 'Accept all',
  rejectLabel: 'Reject non-essential',
  preferencesLabel: 'Cookie preferences',
  placement: 'bottom-bar' as SiteConsentPlacement,
};
export type SiteConsentSettings = typeof SITE_CONSENT_DEFAULTS;

/** Plain-text fields and their limits; config text is always rendered as text, never HTML. */
export const SITE_CONSENT_TEXT_LIMITS: Readonly<Record<'title' | 'message' | 'acceptLabel' | 'rejectLabel' | 'preferencesLabel' | 'secondaryLinkLabel', number>> = {
  title: 120, message: 600, acceptLabel: 40, rejectLabel: 40, preferencesLabel: 40, secondaryLinkLabel: 60,
};

/** Mirrors the engine's consentPolicyHref so the admin can say why a link is refused before saving:
 * a local path (/privacy) or an https URL without credentials. Empty means "no link".
 * @returns null when acceptable, else a sentence naming the fix. @complexity O(url length). */
export function siteConsentLinkProblem({ url }: { url: string }, _options = {}): string | null {
  if (url === '') return null;
  if (/^\/(?!\/)/.test(url)) return /[\\\x00-\x20]/.test(url) ? 'Remove spaces and backslashes from the link.' : null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return 'Use a page on this site, like /privacy, or an https:// address.';
    return parsed.username || parsed.password ? 'Remove the user name or password from the link.' : null;
  } catch {
    return 'Use a page on this site, like /privacy, or an https:// address.';
  }
}

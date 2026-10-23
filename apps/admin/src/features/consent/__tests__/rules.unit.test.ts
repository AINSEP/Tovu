import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { compileConsentCss } from '@jini-ai/cms/consent';
import { canPublishConsent, canSuggestConsentCss, consentProblemTab, consentStatusKey, isConsentConflict, pausedByCategory, resolveConsentTabId, SUGGESTED_CONSENT_CSS } from '../rules';

describe('resolveConsentTabId', () => {
  it('opens the named tab, and Overview for an absent or unknown one', () => {
    expect(resolveConsentTabId({ tabId: 'look' })).toBe('look');
    expect(resolveConsentTabId({ tabId: null })).toBe('overview');
    expect(resolveConsentTabId({ tabId: 'records' })).toBe('overview');
  });
});

describe('isConsentConflict', () => {
  it('is true only for an HTTP 409', () => {
    expect(isConsentConflict({ error: new ApiError('x', 409) })).toBe(true);
    expect(isConsentConflict({ error: new ApiError('x', 400) })).toBe(false);
    expect(isConsentConflict({ error: new Error('409') })).toBe(false);
  });
});

describe('consentProblemTab', () => {
  it('routes each readiness code to the tab that fixes it', () => {
    expect(consentProblemTab({ problem: { code: 'PRIVACY_LINK_REQUIRED', field: 'privacyPolicyUrl', message: '' } })).toBe('banner');
    expect(consentProblemTab({ problem: { code: 'PRIVACY_PAGE_MISSING', field: 'privacyPolicyUrl', message: '' } })).toBe('banner');
    expect(consentProblemTab({ problem: { code: 'SECONDARY_LINK_INVALID', field: 'secondaryLinkUrl', message: '' } })).toBe('banner');
    expect(consentProblemTab({ problem: { code: 'contrast', field: 'appearance', message: '' } })).toBe('look');
    expect(consentProblemTab({ problem: { code: 'TRUSTED_REGION_REQUIRED', field: 'regionMode', message: '' } })).toBe('rules');
  });

  it('gives no tab for problems that are not a setting on this page', () => {
    expect(consentProblemTab({ problem: { code: 'RECEIPT_STORAGE_UNAVAILABLE', message: '' } })).toBeNull();
    expect(consentProblemTab({ problem: { field: 'somethingNew', message: '' } })).toBeNull();
  });
});

describe('pausedByCategory', () => {
  it('counts repeated categories once each, in the engine order, unknown ones last by name', () => {
    const item = (category: string) => ({ tag: 'script', category, source: null });
    expect(pausedByCategory({ detected: [item('marketing'), item('zeta'), item('analytics'), item('marketing'), item('blocked'), item('functional')] })).toEqual([
      { category: 'functional', count: 1 }, { category: 'analytics', count: 1 }, { category: 'marketing', count: 2 }, { category: 'blocked', count: 1 }, { category: 'zeta', count: 1 },
    ]);
    expect(pausedByCategory({ detected: [] })).toEqual([]);
  });
});

describe('consentStatusKey', () => {
  it('names the one state that matters most', () => {
    const base = { hasUnpublished: true, everPublished: true };
    expect(consentStatusKey({ ...base, saveState: 'conflict' })).toBe('Someone else changed this. Reload to see it.');
    expect(consentStatusKey({ ...base, saveState: 'saving' })).toBe('Saving…');
    expect(consentStatusKey({ ...base, saveState: 'error' })).toBe("Couldn't save. Your edits are still here.");
    expect(consentStatusKey({ ...base, saveState: 'saved' })).toBe('Draft saved. Not live yet.');
    expect(consentStatusKey({ saveState: 'idle', hasUnpublished: false, everPublished: true })).toBe('Live.');
    expect(consentStatusKey({ saveState: 'idle', hasUnpublished: false, everPublished: false })).toBe('Not published yet.');
  });
});

describe('canPublishConsent', () => {
  const ready = { saveState: 'saved' as const, settled: true, hasUnpublished: true, problems: [], publishing: false };
  it('allows a settled, problem-free, unpublished draft', () => {
    expect(canPublishConsent(ready)).toBe(true);
    expect(canPublishConsent({ ...ready, saveState: 'idle' })).toBe(true);
  });
  it.each([
    ['problems exist', { problems: [{ field: 'appearance', message: 'contrast' }] }],
    ['edits are unsaved', { settled: false }],
    ['nothing is unpublished', { hasUnpublished: false }],
    ['a publish is running', { publishing: true }],
    ['a save is running', { saveState: 'saving' as const }],
    ['the last save failed', { saveState: 'error' as const }],
    ['another editor won', { saveState: 'conflict' as const }],
  ])('refuses when %s', (_reason, change) => {
    expect(canPublishConsent({ ...ready, ...change })).toBe(false);
  });
});

describe('SUGGESTED_CONSENT_CSS', () => {
  it('passes the engine CSS policy unchanged and sets no colors, so the banner keeps the theme colors', () => {
    const { css, problems } = compileConsentCss({ css: SUGGESTED_CONSENT_CSS, tokens: {} });
    expect(problems).toEqual([]);
    expect(css).toContain('#jini-consent[data-has-record="false"]{border-radius:16px;padding:24px}');
    expect(css).toContain('#jini-consent[data-has-record="false"] button{border-radius:10px}');
    expect(SUGGESTED_CONSENT_CSS).not.toMatch(/(^|[^-])color\s*:/m);
  });
});

describe('canSuggestConsentCss', () => {
  it('offers the suggestion only into an empty field, never over the owner\'s own CSS', () => {
    expect(canSuggestConsentCss({ customCss: undefined })).toBe(true);
    expect(canSuggestConsentCss({ customCss: '  \n' })).toBe(true);
    expect(canSuggestConsentCss({ customCss: '#jini-consent { padding: 12px; }' })).toBe(false);
  });
});

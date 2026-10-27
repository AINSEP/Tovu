import { describe, expect, it, vi } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import { ConsentBannerFields, ConsentLookFields, ConsentPreviewFrame, ConsentRulesFields } from '@jini-ai/admin/consent/react';
import { CONSENT_DICT, translate } from '../consent-dictionary';
import { useConsentTranslate } from '../consent-i18n';
import { CONSENT_CONFIG } from './consent-fixtures';

const locale = vi.hoisted(() => ({ current: 'de' }));
vi.mock('@/hooks/use-admin-locale.hooks', () => ({ useAdminLocale: () => locale.current }));

/** @file The consent dictionary ships every key in all 21 admin locales, and it covers every label
 * the Jini field sections render, so no English leaks into a translated page. */

const EXPECTED_LOCALES = ['ar', 'bn', 'de', 'es', 'fa', 'fr', 'hi', 'hu', 'id', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'ru', 'th', 'tr', 'uk', 'ur', 'zh-CN', 'zh-TW'];

describe('CONSENT_DICT', () => {
  it('covers the same 21 locales as the other admin dictionaries', () => {
    expect(Object.keys(CONSENT_DICT).sort()).toEqual(EXPECTED_LOCALES);
  });

  it('has the same non-empty keys in every locale', () => {
    const keys = Object.keys(CONSENT_DICT.es).sort();
    for (const locale of EXPECTED_LOCALES) {
      expect(Object.keys(CONSENT_DICT[locale]).sort(), locale).toEqual(keys);
      for (const [key, value] of Object.entries(CONSENT_DICT[locale])) expect(value.trim(), `${locale} ${key}`).not.toBe('');
    }
  });

  it.each(EXPECTED_LOCALES)('translates the dynamic-code help trigger in %s', locale => {
    expect(translate({ locale, key: 'About dynamic code' })).not.toBe('About dynamic code');
  });

  it('translates every label, legend, option, hint and button the Jini sections render', () => {
    const dictionary = CONSENT_DICT.de;
    const props = { value: { ...CONSENT_CONFIG, appearance: { backgroundColor: '#ffffff' } }, onChange: () => {}, dictionary };
    const { container } = render(<>
      <ConsentBannerFields {...props} bannerModes={['jini', 'headless', 'off']} />
      <ConsentLookFields {...props} />
      <ConsentRulesFields {...props} />
      <ConsentPreviewFrame html="<p>page</p>" dictionary={dictionary} />
    </>);
    const translated = new Set(Object.values(dictionary));
    const texts = [...container.querySelectorAll('label, legend, option, p.jini-hint, button:not(.jini-toggle-row), .jini-toggle-row-label, .jini-toggle-row-hint')]
      .map(node => node.textContent ?? '').filter(text => text !== '');
    const ariaNames = [...container.querySelectorAll('[aria-label], iframe[title]')].map(node => node.getAttribute('aria-label') ?? node.getAttribute('title') ?? '');
    // A reset button is named "<Default>: <token label>", both halves translated.
    const untranslated = [...texts, ...ariaNames.flatMap(name => name.split(': '))].filter(text => !translated.has(text));
    expect(texts.length).toBeGreaterThan(30);
    expect(untranslated).toEqual([]);
  });
});

describe('useConsentTranslate', () => {
  it('translates page copy and hands the same locale block to the Jini sections', () => {
    locale.current = 'fr';
    const { result } = renderHook(() => useConsentTranslate());
    expect(result.current.t('Cookie Consent')).toBe('Consentement aux cookies');
    expect(result.current.dictionary).toBe(CONSENT_DICT.fr);
  });

  it('falls through to English, with an empty dictionary, for a locale it does not ship', () => {
    locale.current = 'en';
    const { result } = renderHook(() => useConsentTranslate());
    expect(result.current.t('Cookie Consent')).toBe('Cookie Consent');
    expect(result.current.dictionary).toEqual({});
  });
});

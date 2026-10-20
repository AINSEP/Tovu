/** @file Pin host copy validation and error precedence before splitting the text loop. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SITE_CONSENT_DEFAULTS, SITE_CONSENT_TEXT_LIMITS } from '../config.js';
import { parseConsentConfig } from '../validation.js';

for (const [key, max] of Object.entries(SITE_CONSENT_TEXT_LIMITS)) {
  test(`${key} preserves its exact bound, whitespace rule and optional empty secondary label`, () => {
    const valid = { ...SITE_CONSENT_DEFAULTS, [key]: 'x'.repeat(max) };
    assert.deepEqual(parseConsentConfig({ value: valid }), valid);
    for (const text of ['x'.repeat(max + 1), '   ']) {
      assert.throws(() => parseConsentConfig({ value: { ...valid, [key]: text } }), { message: `${key} must contain 1–${max} characters.` });
    }
    const empty = { ...valid, [key]: '' };
    if (key === 'secondaryLinkLabel') assert.deepEqual(parseConsentConfig({ value: empty }), empty);
    else assert.throws(() => parseConsentConfig({ value: empty }), { message: `${key} must contain 1–${max} characters.` });
  });
}

for (const key of ['regionMode', 'placement']) {
  test(`invalid ${key} takes precedence over invalid policy and text`, () => {
    assert.throws(() => parseConsentConfig({ value: { ...SITE_CONSENT_DEFAULTS, [key]: 'unknown', policyVersion: '', title: '' } }),
      { message: 'Choose a supported region mode and placement.' });
  });
}

test('policy version bounds preserve whitespace and precede text errors', () => {
  for (const policyVersion of ['', '   ', 'x'.repeat(65)]) {
    assert.throws(() => parseConsentConfig({ value: { ...SITE_CONSENT_DEFAULTS, policyVersion, title: '' } }), { message: 'policyVersion must contain 1–64 characters.' });
  }
  const policyVersion = ` ${'x'.repeat(62)} `;
  assert.equal(parseConsentConfig({ value: { ...SITE_CONSENT_DEFAULTS, policyVersion } }).policyVersion, policyVersion);
});

for (const key of ['privacyPolicyUrl', 'secondaryLinkUrl']) {
  test(`${key} permits 2000 characters and copy validation precedes link bounds`, () => {
    assert.equal(parseConsentConfig({ value: { ...SITE_CONSENT_DEFAULTS, [key]: 'x'.repeat(2000) } })[key as 'privacyPolicyUrl' | 'secondaryLinkUrl']?.length, 2000);
    assert.throws(() => parseConsentConfig({ value: { ...SITE_CONSENT_DEFAULTS, [key]: 'x'.repeat(2001) } }), { message: 'Policy links must be at most 2000 characters.' });
    assert.throws(() => parseConsentConfig({ value: { ...SITE_CONSENT_DEFAULTS, [key]: 'x'.repeat(2001), title: '' } }), { message: 'title must contain 1–120 characters.' });
  });
}

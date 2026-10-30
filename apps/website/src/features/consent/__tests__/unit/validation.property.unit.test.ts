/** Owner request 2026-10-20: strict consent input and publication readiness properties. */
import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import fc from 'fast-check';
import { ToolInputError } from '@jini-ai/core';
import { SITE_CONSENT_DEFAULTS, SITE_CONSENT_TEXT_LIMITS } from '../../config.js';
import { consentConfigProblems, parseConsentConfig } from '../../validation.js';

const parameters = { numRuns: 150, seed: 20261021 };
const copyField = fc.constantFrom(...Object.keys(SITE_CONSENT_TEXT_LIMITS) as (keyof typeof SITE_CONSENT_TEXT_LIMITS)[]);

before(t => {
  if ("diagnostic" in t) t.diagnostic(`fast-check seed=${parameters.seed}, numRuns=${parameters.numRuns}`);
});

test('bounded nonblank consent copy survives parsing unchanged', () => {
  fc.assert(fc.property(copyField, fc.string({ maxLength: 38 }), (field, suffix) => {
    const value = { ...SITE_CONSENT_DEFAULTS, [field]: `x${suffix}` };
    assert.deepEqual(parseConsentConfig({ value }), value);
  }), parameters);
});

test('every copy field accepts its limit and rejects longer input', () => {
  fc.assert(fc.property(copyField, fc.integer({ min: 1, max: 80 }), (field, excess) => {
    const limit = SITE_CONSENT_TEXT_LIMITS[field];
    const value = { ...SITE_CONSENT_DEFAULTS, [field]: 'x'.repeat(limit) };
    assert.deepEqual(parseConsentConfig({ value }), value);
    assert.throws(() => parseConsentConfig({ value: { ...value, [field]: 'x'.repeat(limit + excess) } }), ToolInputError);
  }), parameters);
});

test('missing required fields and unknown fields never cross the configuration boundary', () => {
  fc.assert(fc.property(fc.constantFrom(...Object.keys(SITE_CONSENT_DEFAULTS)), fc.string({ maxLength: 50 }), (field, suffix) => {
    const incomplete: Record<string, unknown> = { ...SITE_CONSENT_DEFAULTS };
    delete incomplete[field];
    assert.throws(() => parseConsentConfig({ value: incomplete }), ToolInputError);
    assert.throws(() => parseConsentConfig({ value: { ...SITE_CONSENT_DEFAULTS, [`unknown_${suffix}`]: true } }), ToolInputError);
  }), parameters);
});

test('custom CSS accepts the boundary and rejects oversize input before compilation', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), excess => {
    const value = { ...SITE_CONSENT_DEFAULTS, customCss: ' '.repeat(16384) };
    assert.deepEqual(parseConsentConfig({ value }), value);
    assert.throws(() => parseConsentConfig({ value: { ...value, customCss: ' '.repeat(16384 + excess) } }), ToolInputError);
  }), parameters);
});

test('enabled consent requires a safe policy link; auto is available with or without a header', () => {
  fc.assert(fc.property(fc.nat({ max: 100000 }), fc.boolean(), (id, trustedRegion) => {
    const config = parseConsentConfig({ value: {
      ...SITE_CONSENT_DEFAULTS, enabled: true, regionMode: 'auto', privacyPolicyUrl: `https://policy-${id}.example/privacy`,
    } });
    assert.deepEqual(consentConfigProblems({ config, trustedRegion }).map(problem => problem.code), []);
    assert.deepEqual(consentConfigProblems({ config: { ...config, regionMode: 'opt-out' }, trustedRegion }).map(problem => problem.code), ['GLOBAL_OPT_OUT_REFUSED']);
    for (const privacyPolicyUrl of [`http://policy-${id}.example/privacy`, `https://user-${id}@policy.example/privacy`, `javascript:alert(${id})`]) {
      const unsafe = { ...config, privacyPolicyUrl };
      assert.ok(consentConfigProblems({ config: unsafe, trustedRegion: true }).some(problem => problem.code === 'PRIVACY_LINK_REQUIRED'));
    }
  }), parameters);
});

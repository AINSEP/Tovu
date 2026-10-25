/** @file Metadata must reach crawlers and rejecting visitors without a consent grant.
 * These contracts deliberately exercise the published Jini gate, which owns classification. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { gateConsentHtml } from '@jini-ai/cms/consent/html';
import { JSDOM } from 'jsdom';
import { SITE_CONSENT_DEFAULTS } from '#src/features/consent/config';
import { serializeHeadElements } from '../../http/site/page-head.js';

const rejected = {
  id: 'rejected_0123456789012345', timestamp: '2026-10-24T00:00:00Z', policyVersion: '1',
  regionMode: 'opt-in' as const, gpc: false, action: 'reject' as const,
  choices: { necessary: true as const, functional: false, analytics: false, marketing: false },
};

const metadata = [
  ['canonical', '<link rel="canonical" href="https://site.example/about">', 'link[rel="canonical"]'],
  ['hreflang', '<link rel="alternate" hreflang="fr" href="https://site.example/fr/about">', 'link[hreflang="fr"]'],
  ['icon', '<link rel="icon" href="/favicon.ico">', 'link[rel="icon"]'],
  ['manifest', '<link rel="manifest" href="/site.webmanifest">', 'link[rel="manifest"]'],
  ['local preload', '<link rel="preload" as="font" href="/fonts/site.woff2">', 'link[rel="preload"]'],
  ['description', '<meta name="description" content="About this site">', 'meta[name="description"]'],
  ['robots', '<meta name="robots" content="index,follow">', 'meta[name="robots"]'],
  ['Open Graph', '<meta property="og:url" content="https://site.example/about">', 'meta[property="og:url"]'],
  ['Twitter', '<meta name="twitter:card" content="summary">', 'meta[name="twitter:card"]'],
  ['JSON-LD', '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script>', 'script[type="application/ld+json"]'],
] as const;

for (const [name, source, selector] of metadata) {
  for (const label of [null, 'marketing', 'analytics', 'functional', 'necessary', 'invalid']) {
    test(`${name} stays live with ${label ?? 'no'} label before choice and after reject`, () => {
      const markup = source.replace('>', ` data-seo-probe="metadata"${label === null ? '' : ` data-consent-category="${label}"`}>`);
      for (const record of [null, rejected]) {
        const dom = new JSDOM(gateConsentHtml({ html: `<html><head>${markup}</head><body></body></html>`,
          config: { ...SITE_CONSENT_DEFAULTS, enabled: true }, record, regionMode: 'opt-in', gpc: false, endpoint: '/api/site-consent' }));
        try {
          assert.ok(dom.window.document.head.querySelector(`${selector}[data-seo-probe="metadata"]`),
            `${name} must be present in the live head, outside inert consent templates`);
          assert.equal(dom.window.document.querySelectorAll('template[data-jini-consent-resource], template[data-jini-consent-script]').length, 0);
        } finally { dom.window.close(); }
      }
    });
  }
}

test('the actual Tovu head serializer needs no category label to expose the canonical regression', () => {
  const head = serializeHeadElements([{ kind: 'link', rel: 'canonical', href: 'https://site.example/docs', priority: 120 }]);
  assert.equal(head.includes('data-consent-category'), false);
  const dom = new JSDOM(gateConsentHtml({ html: `<html><head>${head}</head><body></body></html>`,
    config: { ...SITE_CONSENT_DEFAULTS, enabled: true }, record: null, regionMode: 'opt-in', gpc: false, endpoint: '/api/site-consent' }));
  try { assert.equal(dom.window.document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'), 'https://site.example/docs'); }
  finally { dom.window.close(); }
});

test('metadata exemptions do not release trackers, refresh navigation, or remote preloads', () => {
  const head = '<meta http-equiv="refresh" content="0;url=https://tracker.example/redirect">' +
    '<link rel="preload" as="script" href="https://tracker.example/track.js">' +
    '<link rel="stylesheet" href="https://tracker.example/track.css">' +
    '<script data-consent-category="analytics">window.tracking=1</script>' +
    '<script src="https://tracker.example/track.js"></script>';
  for (const record of [null, rejected]) {
    const dom = new JSDOM(gateConsentHtml({ html: `<html><head>${head}</head><body></body></html>`,
      config: { ...SITE_CONSENT_DEFAULTS, enabled: true }, record, regionMode: 'opt-in', gpc: false, endpoint: '/api/site-consent' }));
    try {
      const document = dom.window.document;
      assert.equal(document.querySelector('meta[http-equiv="refresh"]'), null);
      assert.equal(document.querySelector('link[rel="preload"]'), null);
      assert.equal(document.querySelector('link[rel="stylesheet"]'), null);
      assert.equal(document.querySelector('script[data-consent-category="analytics"]'), null);
      assert.equal(document.querySelector('script[src="https://tracker.example/track.js"]'), null);
      assert.equal(document.querySelectorAll('template[data-jini-consent-script]').length, 2);
      assert.equal(document.querySelectorAll('template[data-jini-consent-resource]').length, 1);
    } finally { dom.window.close(); }
  }
});

/** Managed document assets leave crawler metadata in its ordinary head slot. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { renderBanner } from '@jini-ai/cookie-consent/render';
import { consentDeclarationReadiness } from '#src/features/consent/readiness';
import { pageShell } from '../../http/site/render.js';
import { serializeHeadElements } from '../../http/site/page-head.js';

function documentWithAssets(head: string): string {
  const assets = renderBanner({ mode: 'jini', client: { contract: 1, policy: 'metadata', regionMode: 'opt-in' }, copy: {} });
  return pageShell({ title: 'Metadata', theme: null, body: '', extraHead: head, documentAssets: assets });
}

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
    test(`${name} stays in the live head slot with ${label ?? 'no'} authored label`, () => {
      const markup = source.replace('>', ` data-seo-probe="metadata"${label === null ? '' : ` data-consent-category="${label}"`}>`);
      const dom = new JSDOM(documentWithAssets(markup));
      try {
        assert.ok(dom.window.document.head.querySelector(`${selector}[data-seo-probe="metadata"]`));
        assert.equal(dom.window.document.querySelectorAll('template[data-jini-consent-resource], template[data-jini-consent-script]').length, 0);
      } finally { dom.window.close(); }
    });
  }
}

test('the actual Tovu head serializer preserves canonical metadata beside consent assets', () => {
  const head = serializeHeadElements([{ kind: 'link', rel: 'canonical', href: 'https://site.example/docs', priority: 120 }]);
  assert.equal(head.includes('data-consent-category'), false);
  const dom = new JSDOM(documentWithAssets(head));
  try { assert.equal(dom.window.document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'), 'https://site.example/docs'); }
  finally { dom.window.close(); }
});

test('unmanaged tracker scripts are diagnostics, never an implied resource conversion', () => {
  const html = '<html><head><meta http-equiv="refresh" content="0;url=https://tracker.example/redirect">' +
    '<link rel="preload" as="script" href="https://tracker.example/track.js">' +
    '<script data-consent-category="analytics">window.tracking=1</script>' +
    '<script src="https://tracker.example/track.js"></script></head><body></body></html>';
  const result = consentDeclarationReadiness({ html, scripts: [], runtimeSlot: true });
  assert.equal(result.warnings.filter(warning => warning.code === 'UNMANAGED_CONTENT').length, 2);
  assert.equal('gatedHtml' in result, false);
});

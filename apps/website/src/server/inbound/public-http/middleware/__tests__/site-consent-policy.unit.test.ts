/** Public origin and preview integration retained after consent HTML rewriting was retired. */
import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type Request } from 'express';
import { JSDOM } from 'jsdom';
import { decoratePreviewPage } from '#src/features/theme/preview-switcher-html';
import { resolveSiteConsentOrigin } from '../site-consent.js';

test('consent origin uses the request\'s own loopback Host alias when the configured origin is loopback', t => {
  const original = process.env.TOVU_PUBLIC_URL;
  t.after(() => {
    if (original === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = original;
  });
  process.env.TOVU_PUBLIC_URL = 'https://localhost:3000';
  for (const [host, protocol, expected] of [
    ['127.0.0.1:3000', 'https', 'https://127.0.0.1:3000'],
    ['127.45.67.89:3000', 'https', 'https://127.45.67.89:3000'],
    ['localhost:3000', 'https', 'https://localhost:3000'],
    ['[::1]:3000', 'https', 'https://[::1]:3000'],
    // A local dev site may be served over plain HTTP or on another port than a copied loopback
    // TOVU_PUBLIC_URL names (owner 11-02: the cookie banner 403'd on http://localhost:3002).
    ['127.0.0.1:3001', 'https', 'https://127.0.0.1:3001'],
    ['127.0.0.1:3000', 'http', 'http://127.0.0.1:3000'],
    ['localhost:3002', 'http', 'http://localhost:3002'],
    ['site.example:3000', 'https', 'https://localhost:3000'],
    ['localhost.attacker.example:3000', 'https', 'https://localhost:3000'],
    ['[invalid', 'https', 'https://localhost:3000'],
  ]) {
    const request: Request = Object.create(express.request, {
      protocol: { value: protocol }, headers: { value: { host, 'x-forwarded-host': 'localhost:3000' } },
    });
    assert.equal(resolveSiteConsentOrigin({ request }), expected, `${protocol}://${host}`);
  }
  process.env.TOVU_PUBLIC_URL = 'https://127.0.0.1:3000';
  const request = { protocol: 'https', headers: {}, get: () => 'localhost:3000' } as unknown as Request;
  assert.equal(resolveSiteConsentOrigin({ request }), 'https://localhost:3000');
  process.env.TOVU_PUBLIC_URL = 'https://site.example:3000';
  assert.equal(resolveSiteConsentOrigin({ request }), 'https://site.example:3000');
});

test('the real preview-switcher mounts its shadow UI without a consent page transform', () => {
  const html = decoratePreviewPage({ html: '<html><head></head><body>Site</body></html>',
    config: { enabled: true, position: 'top', themes: [{ themeId: 'active', label: 'Active' }, { themeId: 'preview', label: 'Preview' }] },
    activeThemeId: 'active', currentThemeId: 'preview', path: '/', preview: true, delivery: 'live' });
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://site.example/' });
  try {
    const host = dom.window.document.querySelector('.tovu-theme-preview-host');
    assert.ok(host);
    const shadowRoot = host.shadowRoot;
    assert.ok(shadowRoot);
    assert.ok(shadowRoot.querySelector('nav[aria-label="Theme preview"]'));
    assert.equal(shadowRoot.querySelectorAll('a').length, 2);
    assert.equal(host.querySelector('template'), null, 'BANNER_SCRIPT consumes the fallback shadow template');
    assert.equal(dom.window.document.documentElement.style.getPropertyValue('--tovu-theme-preview-height'), '0px');
  } finally { dom.window.close(); }
});

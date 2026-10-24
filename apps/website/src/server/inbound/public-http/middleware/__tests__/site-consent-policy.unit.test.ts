/** @file Regression contract for the owner's 2026-10-23 consent origin and theme-script bugs. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import { gateConsentHtml } from '@jini-ai/cms/consent/html';
import { JSDOM } from 'jsdom';
import { decoratePreviewPage } from '#src/features/theme/preview-switcher-html';
import { injectPublishedWebMcp } from '#src/features/webmcp/published-html';
import { renderLazySiteChatMarkup } from '../../http/site/site-chat-markup.js';
import { SITE_CONSENT_DEFAULTS } from '#src/features/consent/config';
import { resolveSiteConsentOrigin } from '../site-consent.js';

test('consent origin uses only same-scheme, same-port loopback Host aliases', t => {
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
    ['127.0.0.1:3001', 'https', 'https://localhost:3000'],
    ['127.0.0.1:3000', 'http', 'https://localhost:3000'],
    ['site.example:3000', 'https', 'https://localhost:3000'],
    ['localhost.attacker.example:3000', 'https', 'https://localhost:3000'],
    ['[invalid', 'https', 'https://localhost:3000'],
  ]) {
    const request = { protocol, headers: { 'x-forwarded-host': 'localhost:3000' },
      get: (name: string) => name === 'host' ? host : 'localhost:3000' } as Request;
    assert.equal(resolveSiteConsentOrigin({ request }), expected, `${protocol}://${host}`);
  }
  process.env.TOVU_PUBLIC_URL = 'https://127.0.0.1:3000';
  const request = { protocol: 'https', headers: {}, get: () => 'localhost:3000' } as unknown as Request;
  assert.equal(resolveSiteConsentOrigin({ request }), 'https://localhost:3000');
  process.env.TOVU_PUBLIC_URL = 'https://site.example:3000';
  assert.equal(resolveSiteConsentOrigin({ request }), 'https://site.example:3000');
});

test('active and preview theme script sources survive rejection without a theme exemption list', () => {
  const html = '<html><head></head><body><script src="/theme-assets/active/scripts/nav.js"></script>' +
    '<script src="/theme-assets/preview/scripts/nav.js"></script><script src="https://tracker.example/track.js"></script>' +
    '<script data-consent-category="analytics" src="/theme-assets/preview/scripts/analytics.js"></script></body></html>';
  const record = { id: 'rejected_0123456789012345', timestamp: '2026-10-24T00:00:00Z', policyVersion: '1',
    regionMode: 'opt-in' as const, gpc: false, action: 'reject' as const,
    choices: { necessary: true as const, functional: false, analytics: false, marketing: false } };
  for (const choice of [null, record]) {
    const gated = gateConsentHtml({ html, config: { ...SITE_CONSENT_DEFAULTS, enabled: true },
      record: choice, regionMode: 'opt-in', gpc: false, endpoint: '/api/site-consent' });
    const dom = new JSDOM(gated);
    try {
      const document = dom.window.document;
      assert.ok(document.querySelector('script[src="/theme-assets/active/scripts/nav.js"]'));
      assert.ok(document.querySelector('script[src="/theme-assets/preview/scripts/nav.js"]'));
      assert.equal(document.querySelector('script[src="https://tracker.example/track.js"]'), null);
      assert.equal(document.querySelector('script[src="/theme-assets/preview/scripts/analytics.js"]'), null);
      assert.equal(document.querySelectorAll('template[data-jini-consent-script]').length, 2);
    } finally { dom.window.close(); }
  }
});

test('the real preview-switcher banner script mounts its shadow UI after reject', () => {
  const html = decoratePreviewPage({ html: '<html><head></head><body>Site</body></html>',
    config: { enabled: true, position: 'top', themes: [{ themeId: 'active', label: 'Active' }, { themeId: 'preview', label: 'Preview' }] },
    activeThemeId: 'active', currentThemeId: 'preview', path: '/', preview: true, delivery: 'live' });
  const record = { id: 'rejected_0123456789012345', timestamp: '2026-10-24T00:00:00Z', policyVersion: '1',
    regionMode: 'opt-in' as const, gpc: false, action: 'reject' as const,
    choices: { necessary: true as const, functional: false, analytics: false, marketing: false } };
  const dom = new JSDOM(gateConsentHtml({ html, config: { ...SITE_CONSENT_DEFAULTS, enabled: true },
    record, regionMode: 'opt-in', gpc: false, endpoint: '/api/site-consent' }), { runScripts: 'dangerously', url: 'https://site.example/' });
  try {
    const host = dom.window.document.querySelector('.tovu-theme-preview-host');
    assert.ok(host?.shadowRoot?.querySelector('nav[aria-label="Theme preview"]'));
    assert.equal(host.shadowRoot.querySelectorAll('a').length, 2);
    assert.equal(host.querySelector('template'), null, 'BANNER_SCRIPT consumes the fallback shadow template');
    assert.equal(dom.window.document.documentElement.style.getPropertyValue('--tovu-theme-preview-height'), '0px');
  } finally { dom.window.close(); }
});

test('WebMCP and site chat remain functional-category features under first-party defaults', () => {
  const chat = renderLazySiteChatMarkup({ enabled: true, variant: 'vanilla', assetsReady: true, mountId: 'tovu-site-assistant-root' });
  assert.ok(chat);
  const html = injectPublishedWebMcp({ html: `<html><head>${chat.head}</head><body>${chat.body}</body></html>`, enabled: true });
  const dom = new JSDOM(gateConsentHtml({ html, config: { ...SITE_CONSENT_DEFAULTS, enabled: true },
    record: null, regionMode: 'opt-in', gpc: false, endpoint: '/api/site-consent' }));
  try {
    const document = dom.window.document;
    assert.equal(document.querySelector('[data-tovu-webmcp-script]'), null);
    assert.equal(document.querySelector('script[src="/site-chat/site-assistant-loader.js"]'), null);
    const scripts = [...document.querySelectorAll<HTMLTemplateElement>('template[data-jini-consent-script]')];
    assert.equal(scripts.length, 2);
    assert.ok(scripts.every(script => script.dataset.category === 'functional'));
  } finally { dom.window.close(); }
});

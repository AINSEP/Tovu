/** @file Regression contract for the owner's 2026-10-23 consent origin and theme-script bugs. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import { InMemoryPresentationSettingsRepo } from '@jini-ai/cms/presentation';
import { gateConsentHtml } from '@jini-ai/cms/consent/html';
import { JSDOM } from 'jsdom';
import type { DiscoveredTheme } from '#src/features/theme/index';
import { SITE_CONSENT_DEFAULTS } from '#src/features/consent/config';
import { resolveSiteConsentOrigin, resolveSiteConsentNecessaryScripts } from '../site-consent.js';

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

test('only active theme script sources survive the denied-visitor gate, including after a theme switch', async () => {
  const theme = (id: string): DiscoveredTheme => ({
    manifest: { id, apiVersion: 2 }, status: 'valid',
    pages: { index: '<script src="../scripts/nav.js"></script>' },
    partials: { footer: `<script src="/theme-assets/${id}/scripts/mode.js"></script>
      <script src="https://tracker.example/track.js"></script>
      <script src="//tracker.example/theme-assets/${id}/scripts/remote.js"></script>
      <script src="/theme-assets/other/scripts/other.js"></script>
      <script src="/theme-assets/${id}/scripts/../../other/scripts/escape.js"></script>` },
    liquidTemplates: {}, handlebarsTemplates: {},
  } as DiscoveredTheme);
  const presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [
    { workspaceId: 'ws', activeThemeId: 'active', updatedAt: '2026-10-23T00:00:00Z' },
  ] });
  const deps = { workspaceId: 'ws', presentationRepo, themes: [theme('active'), theme('other')] };
  const html = `<html><head></head><body>
    <script src="/theme-assets/active/scripts/nav.js"></script>
    ${deps.themes[0].partials.footer}</body></html>`;
  const necessaryScripts = await resolveSiteConsentNecessaryScripts({ deps });
  assert.deepEqual(necessaryScripts.flatMap(entry => entry.src === undefined ? [] : [entry.src]).sort(), [
    '/theme-assets/active/scripts/mode.js', '/theme-assets/active/scripts/nav.js',
  ]);
  const gated = gateConsentHtml({ html, config: { ...SITE_CONSENT_DEFAULTS, enabled: true },
    record: null, regionMode: 'opt-in', gpc: false, endpoint: '/api/site-consent' }, { necessaryScripts });
  const dom = new JSDOM(gated);
  try {
    const document = dom.window.document;
    assert.ok(document.querySelector('script[src="/theme-assets/active/scripts/nav.js"]'));
    assert.ok(document.querySelector('script[src="/theme-assets/active/scripts/mode.js"]'));
    const blocked = [...document.querySelectorAll('template[data-jini-consent-script]')].map(node => node.innerHTML);
    assert.ok(blocked.some(script => script.includes('https://tracker.example/track.js')));
    assert.ok(blocked.some(script => script.includes('//tracker.example/theme-assets/active/scripts/remote.js')));
    assert.ok(blocked.some(script => script.includes('/theme-assets/other/scripts/other.js')));
    assert.ok(blocked.some(script => script.includes('/../../other/scripts/escape.js')));
  } finally { dom.window.close(); }
  await presentationRepo.save({ workspaceId: 'ws', activeThemeId: 'other', updatedAt: '2026-10-23T01:00:00Z' });
  assert.ok((await resolveSiteConsentNecessaryScripts({ deps })).some(entry => entry.src === '/theme-assets/other/scripts/nav.js'));
  assert.ok(!(await resolveSiteConsentNecessaryScripts({ deps })).some(entry => entry.src === '/theme-assets/active/scripts/nav.js'));
  await presentationRepo.save({ workspaceId: 'ws', activeThemeId: 'none', updatedAt: '2026-10-23T02:00:00Z' });
  assert.ok(!(await resolveSiteConsentNecessaryScripts({ deps })).some(entry => 'src' in entry));
});

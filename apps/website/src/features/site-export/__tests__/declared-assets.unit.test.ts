import '../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createNoopObservabilityPort } from '@jini-ai/diagnostics/observability';
import type { DiscoveredTheme } from '../../theme/theme.js';
import { exportSite, type ExportSiteRouteDeps } from '../site-exporter.js';

test('export copies JSON-declared local scripts and mounted consent assets once, without collectors', async t => {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'declared-export-'));
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));
  const themeDir = mkdtempSync(path.join(tmpdir(), 'declared-export-theme-'));
  t.after(() => rmSync(themeDir, { recursive: true, force: true }));
  const theme: DiscoveredTheme = { manifest: { id: 'declared', name: 'Declared', version: '1.0.0', tier: 'declarative', engine: 1 },
    dir: themeDir, source: 'site', status: 'valid', errors: [], tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {},
    handlebarsTemplates: {}, pages: {}, partials: {}, css: '' };
  const local = `/theme-assets/${theme.manifest.id}/scripts/declared.js`;
  theme.manifest.scripts = [{ src: local, consent: ['analytics'] }, { src: local }, { src: 'https://example.com/external.js' }];
  const consent = { regionResolvers: async () => [] as const, exportAssets: undefined as (() => Promise<readonly string[]>) | undefined };
  const requests: string[] = [];
  let assetReads = 0;
  const createSiteApp: ExportSiteRouteDeps['createSiteApp'] = () => {
    consent.exportAssets = async () => { assetReads++; return ['/_consent/runtime.js']; };
    return (req, res) => {
      const url = req.url ?? '/';
      requests.push(url);
      if (url === local || url === '/_consent/runtime.js') { res.setHeader('Content-Type', 'application/javascript'); res.end('window.declared = true;'); return; }
      res.statusCode = url.includes('tovu-export-404-check') ? 404 : 200;
      res.setHeader('Content-Type', 'text/html');
      res.end(`<html><head><script type="application/json">${JSON.stringify({ scripts: theme.manifest.scripts })}</script></head><body>Original content</body></html>`);
    };
  };
  const deps = { workspaceId: 'declarations', themes: [theme], cookieConsent: consent, createSiteApp,
    resolveActiveThemeId: async () => theme.manifest.id, listPublishedPosts: async () => ({ posts: [] }),
    resolveStorefrontProducts: async () => [], redirectRepo: { list: async () => [] },
    clock: { nowIso: () => '2026-11-05T00:00:00Z' }, observability: createNoopObservabilityPort({}),
    originRegistry: { canonicalOrigin: async () => { throw new Error('No public identity'); } },
  } as unknown as ExportSiteRouteDeps;
  const report = await exportSite({ routeDeps: deps, outputDir });
  assert.deepEqual(report.assets.failed, []);
  assert.equal(readFileSync(path.join(outputDir, local.slice(1)), 'utf8'), 'window.declared = true;');
  assert.equal(readFileSync(path.join(outputDir, '_consent/runtime.js'), 'utf8'), 'window.declared = true;');
  assert.equal(requests.filter(url => url === local).length, 1);
  assert.equal(requests.filter(url => url === '/_consent/runtime.js').length, 1);
  assert.equal(assetReads, 1);
  assert.equal(requests.some(url => url.includes('external.js') || url.includes('/p/')), false);
});

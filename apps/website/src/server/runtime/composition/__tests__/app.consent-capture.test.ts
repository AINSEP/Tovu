import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRouteDeps } from '../app.js';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { consentFixture } from '#src/features/consent/__tests__/fixture';

/**
 * @file The assistant's own-site screenshots render through `routeDeps.createSiteApp({ consentAudit })`,
 * which leaves out the cookie consent layer so the picture shows the page, not the banner over it
 * (2026-10-27: the zoran build's assistant could not judge layouts). The serving app, which every
 * visitor reaches, is built without that option and must still deliver the banner.
 */

async function homeHtml(t: test.TestContext, optional: { consentAudit?: true }, { publishConsent = true, themeId = 'none', inspect }: { publishConsent?: boolean; themeId?: string; inspect?: (baseUrl: string, deps: ReturnType<typeof createRouteDeps>) => Promise<void> } = {}): Promise<string> {
  const deps = createRouteDeps();
  // The renderer owns the unstyled page shell. An authored static theme owns its document bytes.
  deps.presentationRepo.findByWorkspaceId = async () => ({ workspaceId: deps.workspaceId, activeThemeId: themeId, updatedAt: '2026-11-05T00:00:00.000Z' });
  // The in-memory root has no attached banner plugin; the site composition supplies this port.
  deps.cookieConsent = { regionResolvers: async () => [] };
  await deps.siteConsentReady;
  if (publishConsent) {
    // The product default is off (owner, 2026-11-02), so the owner's published policy turns it on.
    const consent = consentFixture({ t });
    const saved = await consent.service.saveDraft({ principalId: "owner", config: consent.config, expectedDraftId: null });
    await consent.service.publish({ principalId: "owner", draftId: saved.revision.id, expectedPublishedId: null });
    deps.consentStore = consent.store;
  }
  const baseUrl = await startTestServer(deps.createSiteApp(optional), t);
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();
  await inspect?.(baseUrl, deps);
  return html;
}

test('a visitor-facing site app delivers the cookie banner once the owner turns it on', async t => {
  assert.match(await homeHtml(t, {}), /id="jini-consent"/);
});

test('a site that never chose shows visitors no cookie banner (off by default, owner 2026-11-02)', async t => {
  assert.doesNotMatch(await homeHtml(t, {}, { publishConsent: false }), /id="jini-consent"/);
});

test('a screenshot site app (consentAudit) renders the same page without the cookie banner', async t => {
  const html = await homeHtml(t, { consentAudit: true });
  assert.match(html, /<body/i);
  assert.doesNotMatch(html, /jini-consent/);
});


test('a real static theme authors the consent loading tag', async t => {
  const html = await homeHtml(t, {}, { themeId: 'tovu-starter', inspect: async (baseUrl, deps) => {
    const response = await fetch(`${baseUrl}/_consent/load.js`);
    assert.equal(response.status, 200);
    const source = await response.text();
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<html><head></head><body>Authored static page</body></html>', { url: baseUrl, runScripts: 'outside-only' });
    try {
      dom.window.eval(source);
      assert.ok(dom.window.document.getElementById('jini-consent'));
      assert.ok(dom.window.document.querySelector('[data-consent-open]'));
      assert.ok(dom.window.document.querySelector('script[src*="/_consent/client-"]'));
      const config = JSON.parse(dom.window.document.getElementById('jini-consent-config')!.textContent!);
      assert.equal(config.context, '/_consent/context');
      assert.equal(config.evidence.mode, 'durable');
      const exported = await fetch(`${baseUrl}/_consent/load.js`, { headers: { 'x-tovu-static-export': '1' } });
      const copy = new JSDOM('<html><head></head><body>Exported static page</body></html>', { url: baseUrl, runScripts: 'outside-only' });
      try {
        copy.window.eval(await exported.text());
        const exportedConfig = JSON.parse(copy.window.document.getElementById('jini-consent-config')!.textContent!);
        assert.equal(exportedConfig.evidence.mode, 'local');
        assert.equal(exportedConfig.context, undefined);
      } finally { copy.window.close(); }
    } finally { dom.window.close(); }
    const { exportSite } = await import('#src/features/site-export/site-exporter');
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const outputDir = await mkdtemp(join(tmpdir(), 'consent-static-export-'));
    t.after(() => rm(outputDir, { recursive: true, force: true }));
    const report = await exportSite({ routeDeps: deps, outputDir, includeThemePreviews: false });
    const loader = report.assets.succeeded.find(asset => asset.url === '/_consent/load.js');
    assert.ok(loader, 'the static export copies the authored loading tag asset');
    const copy = new JSDOM('<html><head></head><body>Copied export</body></html>', { url: baseUrl, runScripts: 'outside-only' });
    try {
      copy.window.eval(Buffer.from(loader.data).toString('utf8'));
      assert.ok(copy.window.document.querySelector('[data-consent-open]'));
      assert.equal(JSON.parse(copy.window.document.getElementById('jini-consent-config')!.textContent!).evidence.mode, 'local');
    } finally { copy.window.close(); }
  } });
  assert.match(html, /theme-assets\/tovu-starter/);
  assert.match(html, /<script[^>]*src="\/_consent\/load.js"[^>]*defer/);
});

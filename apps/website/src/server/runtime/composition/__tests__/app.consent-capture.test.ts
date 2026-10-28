import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRouteDeps } from '../app.js';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';

/**
 * @file The assistant's own-site screenshots render through `routeDeps.createSiteApp({ consentAudit })`,
 * which leaves out the cookie consent layer so the picture shows the page, not the banner over it
 * (2026-10-27: the zoran build's assistant could not judge layouts). The serving app, which every
 * visitor reaches, is built without that option and must still deliver the banner.
 */

async function homeHtml(t: test.TestContext, optional: { consentAudit?: true }): Promise<string> {
  const deps = createRouteDeps();
  const baseUrl = await startTestServer(deps.createSiteApp(optional), t);
  const response = await fetch(`${baseUrl}/`);
  return response.text();
}

test('a visitor-facing site app delivers the cookie banner by default', async t => {
  assert.match(await homeHtml(t, {}), /id="jini-consent"/);
});

test('a screenshot site app (consentAudit) renders the same page without the cookie banner', async t => {
  const html = await homeHtml(t, { consentAudit: true });
  assert.match(html, /<body/i);
  assert.doesNotMatch(html, /jini-consent/);
});

/** @file Host withdrawal placement uses the published gate and preserves theme/SEO bytes. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { gateConsentHtml } from '@jini-ai/cms/consent/html';
import { SITE_CONSENT_DEFAULTS } from '../config.js';
import { withSiteConsentSettingsLink } from '../settings-link.js';

for (const footer of ['', '<footer><a href="/privacy">Privacy</a></footer>', '<template><footer>Inert</footer></template>']) {
  test(`withdrawal link survives reject and goes in the live footer or body: ${footer}`, () => {
    const record = { id: 'receipt_012345678901234', timestamp: '2026-10-24T00:00:00Z', policyVersion: '1', regionMode: 'opt-in' as const, gpc: false, action: 'reject' as const,
      choices: { necessary: true as const, functional: false, analytics: false, marketing: false } };
    for (const choice of [null, record]) {
      const gated = gateConsentHtml({ html: `<html><head><link rel="canonical" href="https://site.example/about"></head><body><main>About</main>${footer}</body></html>`,
        config: { ...SITE_CONSENT_DEFAULTS, reopen: 'link' }, record: choice, regionMode: 'opt-in', gpc: false, endpoint: '/api/site-consent' });
      const html = withSiteConsentSettingsLink({ html: gated });
      const dom = new JSDOM(html);
      try {
        const doc = dom.window.document;
        const link = doc.querySelector('a[data-jini-consent-open]');
        assert.equal(link?.textContent, 'Cookie settings');
        assert.equal(link?.getAttribute('href'), '#jini-consent');
        assert.equal(link?.closest('footer') !== null, footer.startsWith('<footer>'));
        assert.equal(doc.querySelector('#jini-consent')?.getAttribute('data-reopen'), 'link');
        assert.equal(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), 'https://site.example/about');
      } finally { dom.window.close(); }
    }
  });
}

test('disabled consent and arbitrary assets are byte-identical; script and template lookalikes do not activate a link', () => {
  for (const html of ['<html><body><footer>Off</footer></body></html>',
    '<script>var fake = \'data-jini-consent-runtime <section id="jini-consent" data-reopen="link">\';</script>',
    '<template><script data-jini-consent-runtime></script><section id="jini-consent" data-reopen="link"></section></template>',
    '{"asset":true}']) assert.equal(withSiteConsentSettingsLink({ html }), html);
});

test('missing closing body markup still receives the control', () => {
  const html = '<script data-jini-consent-runtime></script><section id="jini-consent" data-reopen="link"></section><main>Page';
  assert.match(withSiteConsentSettingsLink({ html }), /data-jini-consent-open/);
});

test('the page footer hosts the control, not an earlier article footer; a theme control is never duplicated', () => {
  const gate = (body: string) => gateConsentHtml({ html: `<html><body>${body}</body></html>`,
    config: { ...SITE_CONSENT_DEFAULTS, reopen: 'link' }, record: null, regionMode: 'opt-in', gpc: false, endpoint: '/api/site-consent' });
  const post = new JSDOM(withSiteConsentSettingsLink({ html: gate('<main><article>Post<footer id="byline">By Ana</footer></article></main><footer id="site">Site</footer>') }));
  const themed = new JSDOM(withSiteConsentSettingsLink({ html: gate('<footer><a href="#jini-consent" data-jini-consent-open>Privacy choices</a></footer>') }));
  try {
    assert.equal(post.window.document.querySelector('a[data-jini-consent-open]')?.closest('footer')?.id, 'site');
    assert.deepEqual([...themed.window.document.querySelectorAll('a[data-jini-consent-open]')].map(a => a.textContent), ['Privacy choices']);
  } finally { post.window.close(); themed.window.close(); }
});

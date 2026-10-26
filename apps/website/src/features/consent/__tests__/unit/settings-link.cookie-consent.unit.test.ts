/** @file The footer "Cookie settings" link on cookie-consent pages: once, in the live footer (or body),
 * using the new client's opener, and never next to a theme's own control. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { withSiteConsentSettingsLink } from '../../settings-link.js';

const CONFIG = '<script type="application/json" id="jini-consent-config">{}</script>';
const page = (body: string) => `<html><head>${CONFIG}</head><body><main>Hi</main>${body}</body></html>`;

test('the link joins the footer last row with the cookie-consent opener', () => {
  const html = withSiteConsentSettingsLink({ html: page('<footer><div class="row">© Site</div></footer>') }, { engine: 'cookie-consent' });
  assert.match(html, /<div class="row">© Site<span data-tovu-consent-settings[^>]*><a href="#privacy-choices" data-consent-open>Cookie settings<\/a><\/span><\/div>/);
  assert.doesNotMatch(html, /data-jini-consent-open/);
});

test('no footer: a centred row before </body>; no config script: nothing', () => {
  assert.match(withSiteConsentSettingsLink({ html: page('') }, { engine: 'cookie-consent' }), /<p data-tovu-consent-settings[^>]*><a href="#privacy-choices" data-consent-open>/);
  const bare = '<html><body><footer>x</footer></body></html>';
  assert.equal(withSiteConsentSettingsLink({ html: bare }, { engine: 'cookie-consent' }), bare);
});

test("a theme's own opener (or the corner button) means no second link", () => {
  for (const own of ['<button data-consent-open>Privacy</button>', '<a href="#privacy-choices">Privacy choices</a>']) {
    const html = page(`<footer>${own}</footer>`);
    assert.equal(withSiteConsentSettingsLink({ html }, { engine: 'cookie-consent' }), html);
  }
});

test('the legacy engine ignores cookie-consent pages and openers (paired with the same page)', () => {
  const html = page('<footer><button data-consent-open>x</button></footer>');
  assert.equal(withSiteConsentSettingsLink({ html }), html);
});

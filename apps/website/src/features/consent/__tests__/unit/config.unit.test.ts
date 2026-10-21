/** siteConsentLinkProblem: the admin's pre-save explanation of why a policy link is refused. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { siteConsentLinkProblem } from '../../config.js';

const SITE_OR_HTTPS = 'Use a page on this site, like /privacy, or an https:// address.';

test('an empty link means "no link" and is acceptable', () => {
  assert.equal(siteConsentLinkProblem({ url: '' }), null);
});

test('a local path is accepted unless it carries spaces, control characters or backslashes', () => {
  assert.equal(siteConsentLinkProblem({ url: '/privacy' }), null);
  for (const url of ['/privacy policy', '/privacy\\x', '/privacy\tx', '/a\u0000b']) {
    assert.equal(siteConsentLinkProblem({ url }), 'Remove spaces and backslashes from the link.', url);
  }
});

test('a protocol-relative //host link is not a local path and must be a full https address', () => {
  assert.equal(siteConsentLinkProblem({ url: '//evil.example/privacy' }), SITE_OR_HTTPS);
});

test('an https URL without credentials is accepted; other schemes are refused', () => {
  assert.equal(siteConsentLinkProblem({ url: 'https://example.com/privacy' }), null);
  for (const url of ['http://example.com/privacy', 'javascript:alert(1)', 'mailto:privacy@example.com']) {
    assert.equal(siteConsentLinkProblem({ url }), SITE_OR_HTTPS, url);
  }
});

test('credentials embedded in an https URL are refused, user name or password alike', () => {
  const credentialed = ['https://user@example.com/privacy', `https://:${'p'.repeat(3)}@example.com/privacy`];
  for (const url of credentialed) assert.equal(siteConsentLinkProblem({ url }), 'Remove the user name or password from the link.', url);
});

test('text that is neither a local path nor a parseable URL gets the same fix sentence', () => {
  assert.equal(siteConsentLinkProblem({ url: 'privacy' }), SITE_OR_HTTPS);
});

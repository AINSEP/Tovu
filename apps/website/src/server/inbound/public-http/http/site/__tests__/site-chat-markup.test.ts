import assert from 'node:assert/strict';
import test from 'node:test';
import { createSiteChatAssetReadiness, renderLazySiteChatMarkup } from '../site-chat-markup.js';
import { injectSiteAssistantIntoStaticPage } from '../render.js';
import { useSiteChatBuild } from './site-chat.fixture.js';

for (const variant of ['react', 'vanilla'] as const) test(`${variant}: enabled public markup includes only bubble CSS and the tiny loader`, () => {
  const markup = renderLazySiteChatMarkup({ enabled: true, variant, assetsReady: true, mountId: 'tovu-site-assistant-root' })!;
  assert.match(markup.head, /data-jini-chat-bubble/);
  assert.doesNotMatch(markup.head, /<link/);
  assert.match(markup.body, /<button type="button" class="jini-chat-bubble"/);
  assert.match(markup.body, new RegExp(`data-widget="${variant}"`));
  assert.match(markup.body, /aria-haspopup="dialog"/);
  assert.match(markup.body, /aria-label="Chat with this site"/);
  assert.match(markup.head, /--jini-chat-accent:oklch\(55\.29% 0\.1129 43\.4\)/);
  assert.match(markup.body, /<script defer src="\/site-chat\/site-assistant-loader\.js" data-consent-category="functional"><\/script>/);
  assert.doesNotMatch(markup.head + markup.body, /remixicon|src="\/site-chat\/site-assistant(?:-vanilla)?\.js"/);
});
test('disabled emits nothing; missing build artifacts signal the existing React fallback', () => {
  assert.deepEqual(renderLazySiteChatMarkup({ enabled: false, variant: 'vanilla', assetsReady: true, mountId: 'tovu-site-assistant-root' }), { head: '', body: '' });
  assert.equal(renderLazySiteChatMarkup({ enabled: true, variant: 'react', assetsReady: false, mountId: 'tovu-site-assistant-root' }), null);
});

for (const variant of ['react', 'vanilla'] as const) test(`server wiring selects the site's ${variant} choice with ready assets`, t => {
  useSiteChatBuild({ test: t, ready: true });
  const html = injectSiteAssistantIntoStaticPage('<html><head></head><body>Page</body></html>', variant);
  assert.match(html, new RegExp(`data-widget="${variant}"`));
  assert.match(html, /src="\/site-chat\/site-assistant-loader\.js"/);
  assert.doesNotMatch(html, /<link rel="stylesheet"/);
  assert.equal(html.indexOf('data-jini-chat-bubble') < html.indexOf('</head>'), true);
  assert.equal(html.indexOf('data-jini-chat-loader') < html.indexOf('</body>'), true);
});

test('legacy boolean callers keep the default React widget', t => {
  useSiteChatBuild({ test: t, ready: true });
  const html = injectSiteAssistantIntoStaticPage('<html><head></head><body>Page</body></html>', true);
  assert.match(html, /data-widget="react"/);
});


test('chat bubble and loader share functional consent so rejection cannot leave a dead control', () => {
  const markup = renderLazySiteChatMarkup({ enabled: true, variant: 'vanilla', assetsReady: true, mountId: 'tovu-site-assistant-root' })!;
  assert.equal(markup.body.includes('<button type="button" class="jini-chat-bubble" data-consent-category="functional" data-jini-chat-loader'), true);
  assert.equal(markup.body.includes('<script defer src="/site-chat/site-assistant-loader.js" data-consent-category="functional"></script>'), true);
});

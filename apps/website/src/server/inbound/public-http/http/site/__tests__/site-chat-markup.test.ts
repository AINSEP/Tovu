import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createSiteChatAssetReadiness, renderLazySiteChatMarkup } from '../site-chat-markup.js';
import { renderSite } from '../render-site.js';
import { injectSiteAssistantIntoStaticPage } from '../render/site-assistant-mount.js';
import { useSiteChatBuild } from './site-chat.fixture.js';

for (const variant of ['react', 'vanilla'] as const) test(`${variant}: enabled public markup includes only bubble CSS and the tiny loader`, () => {
  const markup = renderLazySiteChatMarkup({ enabled: true, variant, assetsReady: true, mountId: 'tovu-site-assistant-root' })!;
  assert.match(markup.head, /data-jini-chat-bubble/);
  assert.doesNotMatch(markup.head, /<link/);
  assert.match(markup.body, /<button type="button" class="jini-chat-bubble"/);
  assert.match(markup.body, new RegExp(`data-widget="${variant}"`));
  assert.doesNotMatch(markup.body, /data-consent-category/);
  assert.match(markup.body, /aria-haspopup="dialog"/);
  assert.match(markup.body, /aria-label="Chat with this site"/);
  assert.match(markup.head, /--jini-chat-accent:oklch\(55\.29% 0\.1129 43\.4\)/);
  assert.match(markup.body, /<script defer src="\/site-chat\/site-assistant-loader\.js"><\/script>/);
  assert.doesNotMatch(markup.head + markup.body, /remixicon|src="\/site-chat\/site-assistant(?:-vanilla)?\.js"/);
});
test('disabled emits nothing; missing build artifacts signal an unavailable lazy widget', () => {
  assert.deepEqual(renderLazySiteChatMarkup({ enabled: false, variant: 'vanilla', assetsReady: true, mountId: 'tovu-site-assistant-root' }), { head: '', body: '' });
  assert.equal(renderLazySiteChatMarkup({ enabled: true, variant: 'react', assetsReady: false, mountId: 'tovu-site-assistant-root' }), null);
});

for (const selection of [true, 'react', 'vanilla'] as const) {
  for (const proxy of [false, true]) test(`${selection}, proxy=${proxy}: legacy assets cannot trigger an eager fallback`, async t => {
    useSiteChatBuild({ test: t, ready: proxy });
    if (proxy) process.env.TOVU_SITE_CHAT_DEV_PROXY_URL = 'http://localhost:5174';
    else {
      // Simulate a rolling deployment containing the old React bundle but no lazy loader.
      for (const name of ['site-assistant.js', 'site-assistant.css']) {
        writeFileSync(path.join(process.env.TOVU_SITE_CHAT_DIST!, name), 'legacy fixture');
      }
    }
    const page = '<html><head></head><body>Page</body></html>';
    assert.equal(injectSiteAssistantIntoStaticPage({ html: page, enabled: selection }), page);
    const html = await renderSite({ theme: null, route: 'home', siteTitle: 'Page', posts: [], siteAssistantEnabled: selection });
    assert.doesNotMatch(html, /tovu-site-assistant-root|site-assistant[^"']*\.(?:js|css)|modulepreload/i);
  });
}

for (const variant of ['react', 'vanilla'] as const) test(`server wiring selects the site's ${variant} choice with ready assets`, t => {
  useSiteChatBuild({ test: t, ready: true });
  const html = injectSiteAssistantIntoStaticPage({ html: '<html><head></head><body>Page</body></html>', enabled: variant });
  assert.match(html, new RegExp(`data-widget="${variant}"`));
  assert.match(html, /src="\/site-chat\/site-assistant-loader\.js"/);
  assert.doesNotMatch(html, /<link rel="stylesheet"/);
  assert.equal(html.indexOf('data-jini-chat-bubble') < html.indexOf('</head>'), true);
  assert.equal(html.indexOf('data-jini-chat-loader') < html.indexOf('</body>'), true);
});

test('legacy boolean callers keep the default React widget', t => {
  useSiteChatBuild({ test: t, ready: true });
  const html = injectSiteAssistantIntoStaticPage({ html: '<html><head></head><body>Page</body></html>', enabled: true });
  assert.match(html, /data-widget="react"/);
});


test('the host chat bubble and loader are untagged necessary features', () => {
  const markup = renderLazySiteChatMarkup({ enabled: true, variant: 'vanilla', assetsReady: true, mountId: 'tovu-site-assistant-root' })!;
  assert.equal(markup.body.includes('<button type="button" class="jini-chat-bubble" data-jini-chat-loader'), true);
  assert.equal(markup.body.includes('<script defer src="/site-chat/site-assistant-loader.js"></script>'), true);
});

test('successful asset probes are bounded to the sixteen newest deployments', () => {
  const expectedFiles = ['site-assistant-loader.js', 'site-assistant.js', 'site-assistant.css'];
  const available = new Map(Array.from({ length: 17 }, (_, index) =>
    [`/deploy/${index}`, new Set(expectedFiles)] as const));
  const probes: string[] = [];
  const isReady = createSiteChatAssetReadiness({
    exists: ({ directory, name }) => {
      probes.push(`${directory}/${name}`);
      return available.get(directory)?.has(name) ?? false;
    },
  });
  const ready = (index: number) => isReady({ directory: `/deploy/${index}`, variant: 'react' });

  for (let index = 0; index < 16; index++) assert.equal(ready(index), true);
  available.get('/deploy/0')?.delete('site-assistant.css');
  probes.length = 0;
  assert.equal(ready(0), true);
  assert.deepEqual(probes, [], 'the first deployment remains cached at exactly sixteen');

  assert.equal(ready(16), true);
  probes.length = 0;
  assert.equal(ready(1), true);
  assert.deepEqual(probes, [], 'inserting one deployment did not evict the whole cache');
  assert.equal(ready(0), false, 'the evicted deployment is checked against its current files');
  assert.deepEqual(probes, [
    '/deploy/0/site-assistant-loader.js', '/deploy/0/site-assistant.js', '/deploy/0/site-assistant.css',
  ]);
});

test('a completed React build does not mark the lightweight build ready, and missing assets are retried', () => {
  const files = new Set(['site-assistant-loader.js', 'site-assistant.js', 'site-assistant.css', 'site-assistant-vanilla.js']);
  const probes: string[] = [];
  const isReady = createSiteChatAssetReadiness({
    exists: ({ directory, name }) => {
      probes.push(name);
      return directory === '/new-release' && files.has(name);
    },
  });
  assert.equal(isReady({ directory: '/new-release', variant: 'react' }), true);
  probes.length = 0;
  assert.equal(isReady({ directory: '/new-release', variant: 'vanilla' }), false);
  assert.deepEqual(probes, ['site-assistant-loader.js', 'site-assistant-vanilla.js', 'site-assistant-vanilla.css']);

  files.add('site-assistant-vanilla.css');
  probes.length = 0;
  assert.equal(isReady({ directory: '/new-release', variant: 'vanilla' }), true);
  assert.deepEqual(probes, ['site-assistant-loader.js', 'site-assistant-vanilla.js', 'site-assistant-vanilla.css']);
});

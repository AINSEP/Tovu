import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderSite } from '../render.js';
import type { DeclaredScript } from '@jini-ai/cookie-consent';

test('managed document constructs contribution slots after body asset collection', async () => {
  const scripts: DeclaredScript[] = [];
  let collected: readonly DeclaredScript[] = [];
  const html = await renderSite({ theme: null, route: 'home', siteTitle: 'Assets', posts: [], scripts,
    transformBody: async ({ html }) => { scripts.push({ src: '/comments.js', consent: ['functional'] }); return html + '<p data-test="unchanged">stored body</p>'; },
    renderAssets: async ({ scripts }) => { collected = scripts; return { head: '<meta name="asset-slot" content="head">', body: '<div data-asset-slot="body"></div>' }; },
  });
  assert.deepEqual(collected, [{ src: '/comments.js', consent: ['functional'] }]);
  assert.ok(html.indexOf('name="asset-slot"') < html.indexOf('</head>'));
  assert.ok(html.indexOf('data-asset-slot="body"') < html.indexOf('</body>'));
  assert.ok(html.includes('<p data-test="unchanged">stored body</p>'));
});

test('ordinary declared assets use normal script delivery without a consent runtime', async () => {
  const html = await renderSite({ theme: null, route: 'home', siteTitle: 'Assets', posts: [], scripts: [{ src: '/menu.js' }, { src: 'https://example.com/pixel.js', consent: ['analytics'] }] });
  assert.ok(html.includes('<script data-jini-declared-script src="/menu.js" defer></script>'));
  assert.ok(!html.includes('<script data-jini-declared-script src="https://example.com/pixel.js" defer></script>'));
  assert.ok(!html.includes('/_consent'));
});


test('without the consent construction hook only declarations without consent run', async () => {
  const html = await renderSite({ theme: null, route: 'home', siteTitle: 'Assets', posts: [], scripts: [
    { src: '/plain.js' }, { src: '/declared.js', consent: ['analytics'] }, { src: '/necessary.js', consent: ['necessary'] },
  ] });
  assert.match(html, /src="\/plain.js"/);
  assert.doesNotMatch(html, /src="\/(?:declared|necessary).js"/);
});

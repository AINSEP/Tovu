import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createSiteVanillaArgs } from '../vanilla-host';

test('visitor markdown supports GFM, escapes raw HTML and rejects executable links', () => {
  const dom = new JSDOM('<div id="root"></div>');
  const element = dom.window.document.getElementById('root')!;
  const args = createSiteVanillaArgs({ element }, { document: dom.window.document });
  args.renderMarkdown({ element, content: '**Strong** and [About](/about)\n\n~~old~~\n\n| A | B |\n| - | - |\n| a | b |\n\n<script>alert(1)</script>\n\n[Bad](javascript:alert%281%29)' });
  assert.equal(element.querySelector('strong')!.textContent, 'Strong');
  assert.equal(element.querySelector('del')!.textContent, 'old');
  assert.equal(element.querySelectorAll('table').length, 1);
  assert.equal(element.querySelector('a')!.getAttribute('href'), '/about');
  assert.equal(element.querySelector('a')!.rel, 'noopener noreferrer');
  assert.equal(element.querySelector('script'), null);
  assert.equal(element.querySelector('a[href^="javascript:"]'), null);
  assert.match(element.textContent!, /<script>alert\(1\)<\/script>/);
  dom.window.close();
});

test('page effects accept only server-resolved same-origin absolute paths', () => {
  const dom = new JSDOM('<div id="root"></div>');
  const args = createSiteVanillaArgs({ element: dom.window.document.getElementById('root')! }, { document: dom.window.document });
  for (const path of ['/about', '/posts/example?x=1']) assert.equal(args.pageActions.allows({ action: { type: 'navigate', auto: true, target: { path, title: 'About', slug: 'about' } } }), true);
  for (const path of ['//evil.test', '/\\evil.test', 'javascript:alert(1)', 'https://evil.test', '/ bad']) assert.equal(args.pageActions.allows({ action: { type: 'navigate', auto: true, target: { path, title: 'About', slug: 'about' } } }), false);
  dom.window.close();
});

for (const source of ['https://evil.test/beacon?q=private', '//evil.test/beacon', 'data:image/png;base64,AAAA', 'http://[invalid']) {
  test(`model image ${source} never enters the rendered DOM`, () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/about' });
    const element = dom.window.document.getElementById('root')!;
    const args = createSiteVanillaArgs({ element }, { document: dom.window.document });
    args.renderMarkdown({ element, content: `![Private](${source})\n\n![Local](/uploads/public.png)\n\n![Relative](image.png)\n\n![Absolute](https://example.test/media/image.png)` });
    assert.deepEqual(Array.from(element.querySelectorAll('img')).map(img => img.getAttribute('src')),
      ['/uploads/public.png', 'image.png', 'https://example.test/media/image.png']);
    dom.window.close();
  });
}

test('encoded executable links and GFM footnotes cannot introduce active links or repeated IDs', () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/' });
  const element = dom.window.document.getElementById('root')!;
  const args = createSiteVanillaArgs({ element }, { document: dom.window.document });
  args.renderMarkdown({ element, content: '[Bad](jav&#x61;script:alert%281%29)\n\nFootnote[^1]\n\n[^1]: Same ID in every reply.' });
  assert.equal(element.querySelector('a[href^="javascript:"]'), null);
  assert.equal(element.querySelector('[id]'), null);
  dom.window.close();
});

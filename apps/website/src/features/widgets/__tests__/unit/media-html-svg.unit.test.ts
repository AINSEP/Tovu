/** Inline SVG icons in page HTML (the landing carousel's arrow/play/pause buttons) must survive the
 * page-body sanitizer, while executable SVG (script, foreignObject, on*, javascript: hrefs) drops. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePageHtml } from '#src/features/widgets/media-html';

test('sanitizePageHtml keeps the landing carousel buttons\' inline SVG icons', () => {
  const prev = `<button type="button" class="deck-arrow deck-prev" aria-label="Previous video"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19" /></svg></button>`;
  const play = `<button type="button" class="reel-play" aria-label="Play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4 L20 12 L6 20 Z" /></svg></button>`;
  const pause = `<button type="button" class="rings-pause" aria-pressed="false"><svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1" width="3" height="10" rx="1" /><rect x="7" y="1" width="3" height="10" rx="1" /></svg></button>`;
  assert.equal(sanitizePageHtml({ html: prev }), '<button type="button" class="deck-arrow deck-prev" aria-label="Previous video"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19"></path></svg></button>');
  assert.equal(sanitizePageHtml({ html: play }), '<button type="button" class="reel-play" aria-label="Play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4 L20 12 L6 20 Z"></path></svg></button>');
  assert.equal(sanitizePageHtml({ html: pause }), '<button type="button" class="rings-pause" aria-pressed="false"><svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1" width="3" height="10" rx="1"></rect><rect x="7" y="1" width="3" height="10" rx="1"></rect></svg></button>');
});

test('sanitizePageHtml keeps SVG presentation attributes (fill, stroke, transform, gradients)', () => {
  const html = `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"></stop></linearGradient></defs><g transform="translate(1 1)"><circle cx="5" cy="5" r="4" fill="url(#g)"></circle><polygon points="0,0 1,1"></polygon></g></svg>`;
  assert.equal(sanitizePageHtml({ html }), html);
});

test('sanitizePageHtml strips executable SVG: script, foreignObject, handlers, use/image/a hrefs', () => {
  const html = `<svg onload="evil()" viewBox="0 0 1 1"><script>alert(1)</script><foreignObject><p>x</p></foreignObject><path d="M0 0" onclick="evil()" /><use href="javascript:evil()"></use><use xlink:href="https://evil.example/x.svg#a"></use><image href="https://evil.example/x.png"></image><a href="javascript:evil()"><rect width="1" height="1" /></a><animate attributeName="href" to="javascript:evil()"></animate><set attributeName="onclick" to="evil()"></set><style>*{}</style></svg>`;
  assert.equal(sanitizePageHtml({ html }), '<svg viewBox="0 0 1 1"><path d="M0 0"></path></svg>');
});

test('sanitizePageHtml rejects javascript: URLs smuggled through SVG paint attributes', () => {
  assert.equal(sanitizePageHtml({ html: `<svg><path fill="javascript:evil()" d="M0 0"></path></svg>` }), '<svg><path d="M0 0"></path></svg>');
});

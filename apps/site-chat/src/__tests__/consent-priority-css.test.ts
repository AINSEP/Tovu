import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { renderLazySiteChatMarkup } from '../../../website/src/server/inbound/public-http/http/site/site-chat-markup.js';

for (const variant of ['react', 'vanilla'] as const) {
  test(`${variant}: consent controls both the pre-load bubble and the mounted chat container`, () => {
    const markup = renderLazySiteChatMarkup({ enabled: true, variant, assetsReady: true, mountId: 'tovu-site-assistant-root' })!;
    const dom = new JSDOM(`<!doctype html><html><head>${markup.head}</head><body>${markup.body}</body></html>`);
    try {
      const rules = Array.from(dom.window.document.querySelector('style')!.sheet!.cssRules) as CSSStyleRule[];
      assert.equal(rules.find(rule => rule.selectorText === '#tovu-site-assistant-root')?.style.getPropertyValue('display'), 'var(--jini-floating-ui-display,block)');
      assert.equal(rules.find(rule => rule.selectorText === '.jini-chat-bubble')?.style.getPropertyValue('display'), 'var(--jini-floating-ui-display,grid)');
      assert.equal(dom.window.document.querySelector('#tovu-site-assistant-root')?.tagName, 'DIV');
      assert.equal(dom.window.document.querySelector('[data-jini-chat-loader]')?.tagName, 'BUTTON');
    } finally { dom.window.close(); }
  });
}

test('branding yields to the same consent state at desktop and stacked mobile widths', () => {
  const css = readFileSync(new URL('../../../../content/themes/static/tovu-theme/css/theme.css', import.meta.url), 'utf8');
  const dom = new JSDOM('<!doctype html><style></style>');
  try {
    const style = dom.window.document.querySelector('style')!;
    style.textContent = css;
    const rules = Array.from(style.sheet!.cssRules);
    const desktop = (rules as CSSStyleRule[]).find(rule => rule.selectorText === '.tv .made-with-corner');
    assert.equal(desktop?.style.getPropertyValue('display'), 'var(--jini-floating-ui-display, inline-flex)');
    const mobile = (rules as CSSMediaRule[]).find(rule => rule.conditionText === '(max-width: 900px)' && Array.from(rule.cssRules).some(child => (child as CSSStyleRule).selectorText === '.tv .made-with-corner'));
    const pill = Array.from(mobile!.cssRules).find(rule => (rule as CSSStyleRule).selectorText === '.tv .made-with-corner') as CSSStyleRule;
    assert.equal(pill.style.getPropertyValue('display'), 'var(--jini-floating-ui-display, flex)');
    assert.equal(pill.style.getPropertyValue('position'), 'static');
  } finally { dom.window.close(); }
});

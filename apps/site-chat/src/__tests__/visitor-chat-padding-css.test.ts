import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

// Regression (cb186d089): a flat `padding: 12px 16px` here out-specified Jini's bottom reserve for
// the absolutely-positioned composer, so a long answer's tail sat under it with no way to scroll.
test('the visitor message list keeps the composer-height reserve as its bottom padding', () => {
  const dom = new JSDOM('<!doctype html><style></style>');
  try {
    const style = dom.window.document.querySelector('style')!;
    style.textContent = readFileSync(new URL('../widget.css', import.meta.url), 'utf8');
    const rules = Array.from(style.sheet!.cssRules) as CSSStyleRule[];
    const list = rules.find(rule => rule.selectorText === '.tovu-site-assistant .jini-chat-pane .jini-message-list');
    assert.equal(list?.style.getPropertyValue('padding'), '12px 16px calc(var(--jini-chat-controls-height, 240px) + 24px)');
  } finally {
    dom.window.close();
  }
});

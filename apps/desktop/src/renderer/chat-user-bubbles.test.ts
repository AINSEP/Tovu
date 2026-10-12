import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const desktopCss = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

for (const theme of ['light', 'dark']) {
  test(`desktop ${theme} uses fixed bubble tokens for ordinary and nested mid-run messages`, () => {
    const dom = new JSDOM(`<!doctype html><html data-theme="${theme}"><head></head><body></body></html>`);
    try {
      const style = dom.window.document.createElement('style') as HTMLStyleElement;
      style.textContent = desktopCss;
      dom.window.document.head.appendChild(style);
      // This host CSS contract needs both nesting shapes, not React. The real renderer shapes
      // and shared var() bubble rule are covered by Jini's styles-user-bubbles.test.tsx; rendering
      // the linked package here pairs Jini's React hooks with desktop's separate React renderer.
      dom.window.document.body.innerHTML = `<div class="runner-chat-pane"><div class="jini-chat-pane">
        <div class="jini-message-list">
          <div class="jini-message-user"><div class="jini-message-content">An ordinary message</div></div>
          <div class="jini-message-assistant">
            <div class="jini-message-user jini-message-user--mid-run"><div class="jini-message-content">A nested message</div></div>
          </div>
        </div>
      </div></div>`;
      const pane = dom.window.document.querySelector('.jini-chat-pane') as HTMLElement;
      const bubbles = Array.from(pane.querySelectorAll('.jini-message-user .jini-message-content'));
      assert.equal(bubbles.length, 2);
      assert.ok(pane.querySelector('.jini-message-assistant .jini-message-user--mid-run'));
      const hostRules = Array.from(style.sheet!.cssRules) as CSSStyleRule[];
      const paneRule = hostRules.find(rule => rule.selectorText === '.runner-chat-pane .jini-chat-pane')!;
      assert.ok(pane.matches(paneRule.selectorText));
      assert.equal(paneRule.style.getPropertyValue('--jini-chat-user-bubble'), '#1a1b1c');
      assert.equal(paneRule.style.getPropertyValue('--jini-chat-user-bubble-ink'), '#fff');
      const paneStyle = dom.window.getComputedStyle(pane);
      assert.equal(paneStyle.getPropertyValue('--jini-chat-user-bubble'), '#1a1b1c');
      assert.equal(paneStyle.getPropertyValue('--jini-chat-user-bubble-ink'), '#fff');
      // Direct background overrides used to reach only top-level rows. Both now use the shared
      // package rule and host tokens. CSSOM checks the host seam without faking CSS resolution.
      for (const bubble of bubbles) {
        const overrides = hostRules.filter(rule => rule.selectorText && bubble.matches(rule.selectorText)
          && (rule.style.getPropertyValue('background') || rule.style.getPropertyValue('background-color')));
        assert.equal(overrides.length, 0, 'desktop must theme both shapes through the pane tokens');
      }
    } finally {
      dom.window.close();
    }
  });
}

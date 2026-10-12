import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { React, act, createRoot, installDom } from './react-dom-harness';
import type { ChatTransport } from '@jini-ai/chat/react';

const { ChatPane } = await import('@jini-ai/chat/react');
const widgetCss = readFileSync(new URL('../widget.css', import.meta.url), 'utf8');

test('public widget accent override beats the later injected user-bubble defaults', async () => {
  const { dom, restore } = installDom();
  const container = dom.window.document.getElementById('root')!;
  const root = createRoot(container);
  const transport: ChatTransport = {
    startRun: async () => ({ runId: 'unused' }), reattachRun: async () => {},
    fetchRunStatus: async () => null, stopRun: async () => {},
  };
  const hostStyle = dom.window.document.createElement('style');
  hostStyle.textContent = widgetCss;
  dom.window.document.head.appendChild(hostStyle);
  try {
    await act(async () => root.render(React.createElement('div', { className: 'tovu-site-assistant' },
      React.createElement(ChatPane, { transport, agents: [{ id: 'site', name: 'Site assistant' }],
        initialMessages: [{ id: 'user', role: 'user', content: 'Ask the public site' }],
      }),
    )));
    const bubble = container.querySelector('.jini-message-user .jini-message-content')!;
    const hostRules = Array.from(hostStyle.sheet!.cssRules) as CSSStyleRule[];
    const hostRule = hostRules.find(rule => rule.selectorText === '.tovu-site-assistant .jini-message-list > .jini-message-user .jini-message-content')!;
    assert.ok(bubble.matches(hostRule.selectorText));
    assert.equal(hostRule.style.getPropertyValue('background'), 'var(--accent)');
    assert.equal(hostRule.style.getPropertyValue('color'), 'var(--accent-ink)');
    const injectedStyle = container.querySelector('style[data-jini-chat-pane-styles]') as HTMLStyleElement;
    const rules = Array.from(injectedStyle.sheet!.cssRules) as CSSStyleRule[];
    const injectedRule = rules.find(rule => rule.selectorText === '.jini-chat-pane .jini-message-user .jini-message-content')!;
    assert.ok(bubble.matches(injectedRule.selectorText));
    assert.equal(injectedRule.style.getPropertyValue('background'), 'var(--jini-chat-user-bubble, #1a1b1c)');
    // Both selectors consist solely of class selectors and combinators: four classes beat three,
    // even though ChatPane appends its defaults later. No !important can overturn that contract.
    assert.equal(hostRule.selectorText.match(/\.[\w-]+/g)?.length, 4);
    assert.equal(injectedRule.selectorText.match(/\.[\w-]+/g)?.length, 3);
    assert.equal(injectedRule.style.getPropertyPriority('background'), '');
    assert.equal(injectedRule.style.getPropertyPriority('color'), '');
    assert.ok(hostStyle.compareDocumentPosition(injectedStyle) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  } finally {
    await act(async () => root.unmount());
    hostStyle.remove();
    restore();
  }
});

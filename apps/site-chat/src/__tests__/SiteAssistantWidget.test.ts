import assert from 'node:assert/strict';
import test from 'node:test';
import { React, act, createRoot, installDom } from './react-dom-harness';
import { loadSiteAssistantState, saveSiteAssistantState } from '../session-store';

const { SiteAssistantWidget } = await import('../SiteAssistantWidget');

for (const restored of [false, true]) test(`public widget dialog: ${restored ? 'restored thread' : 'empty greeting'}`, async () => {
  const { dom, restore } = installDom({ html: '<input id="page"><div id="tovu-site-assistant-root"></div>' },
    { url: 'https://example.test/' });
  const container = dom.window.document.getElementById('tovu-site-assistant-root')!;
  if (restored) saveSiteAssistantState({ open: false, messages: [{ id: 'old', role: 'assistant', content: 'Saved reply', runStatus: 'succeeded' }] });
  const root = createRoot(container);
  const findButton = (name: string) => Array.from(container.querySelectorAll('button'))
    .find(node => (node.getAttribute('aria-label') ?? node.textContent) === name);
  const button = (name: string) => {
    const result = findButton(name);
    assert.ok(result, `missing ${name}`);
    return result;
  };
  const press = (element: Element, key: string, shiftKey = false) => act(() => {
    element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
  });
  try {
    await act(async () => root.render(React.createElement(SiteAssistantWidget)));
    const bubble = button('Chat with this site');
    assert.equal(bubble.getAttribute('aria-expanded'), 'false');
    bubble.focus();
    press(bubble, 'Enter');
    const panel = container.querySelector<HTMLElement>('[role="dialog"]')!;
    assert.equal(panel.hidden, false);
    assert.equal(panel.getAttribute('aria-modal'), 'true');
    assert.equal(panel.getAttribute('aria-label'), 'Ask this site');
    assert.equal(bubble.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(panel.id, bubble.getAttribute('aria-controls'));
    assert.equal(bubble.getAttribute('aria-expanded'), 'true');
    assert.equal(bubble.getAttribute('aria-label'), 'Chat with this site');
    const textarea = container.querySelector('textarea')!;
    assert.equal(dom.window.document.activeElement, textarea);
    for (const name of ['Set working directory', 'Choose AI runtime', 'Add context', 'Attach files']) {
      assert.equal(container.querySelector(`button[aria-label="${name}"]`), null, `visitor must not render ${name}`);
    }
    assert.equal(container.textContent?.includes('Workspace chat'), false);
    if (restored) {
      assert.ok(container.textContent?.includes('Saved reply'));
      assert.equal(panel.querySelector('[aria-label="Example prompts"]'), null, 'restored threads hide greeting suggestions');
    } else {
      const prompts = panel.querySelector('[aria-label="Example prompts"]');
      assert.ok(prompts, 'empty chat offers example prompts');
      // Pin the greeting/chip relationship without depending on Jini's styling classes.
      assert.equal(prompts.previousElementSibling?.textContent, 'Ask about posts, pages or docs on this site.');
      assert.deepEqual(Array.from(prompts.querySelectorAll('button'), node => node.textContent),
        ['What can I find on this site?', 'Show me the latest posts']);
      for (const suggestion of ['What can I find on this site?', 'Show me the latest posts']) {
        act(() => button(suggestion).click());
        assert.equal(textarea.value, suggestion);
        assert.equal(dom.window.document.activeElement, textarea, 'suggestion returns focus to the composer');
        assert.equal(button('Send').disabled, false);
        assert.equal(prompts.previousElementSibling?.textContent, 'Ask about posts, pages or docs on this site.', 'suggestion fills a draft without sending');
        assert.deepEqual(loadSiteAssistantState().messages, [], 'suggestion must not create a transcript');
      }
    }
    const first = button('New thread');
    const last = restored ? textarea : button('Send');
    last.focus();
    press(last, 'Tab');
    assert.equal(dom.window.document.activeElement, first);
    press(first, 'Tab', true);
    assert.equal(dom.window.document.activeElement, last);
    const messagesBeforeReset = loadSiteAssistantState().messages;
    for (const cancel of [() => press(button('Cancel'), 'Escape'), () => act(() => button('Cancel').click())]) {
      act(() => button('New thread').click());
      assert.equal(dom.window.document.activeElement, button('Cancel'), 'confirmation focuses the safe action');
      assert.equal(button('Discard chat?').closest('[role="dialog"]'), panel, 'confirmation stays inline');
      assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
      assert.equal(findButton('New thread'), undefined, 'confirmation replaces the reset action');
      assert.deepEqual(loadSiteAssistantState().messages, messagesBeforeReset, 'requesting reset must not discard messages');
      cancel();
      assert.equal(panel.hidden, false, 'cancelling discard keeps the chat open');
      assert.equal(dom.window.document.activeElement, button('New thread'));
      assert.equal(findButton('Cancel'), undefined);
      assert.equal(findButton('Discard chat?'), undefined);
      assert.deepEqual(loadSiteAssistantState().messages, messagesBeforeReset);
      if (!restored) assert.equal(textarea.value, 'Show me the latest posts', 'Cancel and Escape preserve the draft');
    }
    act(() => button('New thread').click());
    act(() => button('Discard chat?').click());
    const freshComposer = container.querySelector('textarea')!;
    assert.equal(freshComposer.value, '');
    assert.equal(dom.window.document.activeElement, freshComposer, 'focus stays inside after reset');
    assert.deepEqual(loadSiteAssistantState().messages, []);
    assert.equal(panel.textContent?.includes('Saved reply'), false, 'discard removes the old transcript');
    assert.equal(panel.querySelector('[aria-label="Example prompts"]')?.previousElementSibling?.textContent,
      'Ask about posts, pages or docs on this site.', 'reset restores the greeting and its suggestions');
    assert.equal(button('Send').disabled, true, 'fresh chat has no draft to send');
    act(() => button('New thread').click());
    assert.equal(findButton('Cancel'), undefined, 'empty chat resets without confirmation');
    assert.equal(findButton('Discard chat?'), undefined);
    assert.equal(dom.window.document.activeElement, container.querySelector('textarea'));
    press(dom.window.document.activeElement!, 'Escape');
    assert.equal(panel.hidden, true);
    assert.equal(bubble.getAttribute('aria-expanded'), 'false');
    assert.equal(dom.window.document.activeElement, bubble);
    press(bubble, 'Enter');
    act(() => button('Close chat').click());
    assert.equal(panel.hidden, true);
    assert.equal(dom.window.document.activeElement, bubble);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

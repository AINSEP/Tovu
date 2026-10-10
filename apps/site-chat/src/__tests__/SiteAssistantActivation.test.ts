import assert from 'node:assert/strict';
import test from 'node:test';
import { React, act, createRoot, installDom } from './react-dom-harness';

const { useSiteAssistantActivation } = await import('../SiteAssistantActivation.hooks');

for (const restored of [false, true]) test(`React activation preserves page focus on ${restored ? 'resume' : 'closed mount'} and focuses explicit opens`, async () => {
  const { dom, restore } = installDom({ html: '<input id="page"><div id="root"></div>' }, { url: 'https://example.test/' });
  const container = dom.window.document.getElementById('root')!;
  const pageInput = dom.window.document.getElementById('page')!;
  if (restored) container.dataset.chatOpen = 'true';
  pageInput.focus();
  let mounted = 0;
  container.addEventListener('jini-chat-mounted', () => mounted++);
  const root = createRoot(container);
  function Probe() {
    const [open, setOpen] = React.useState(restored);
    const { toggleOpen } = useSiteAssistantActivation({ root: container, open, setOpen });
    return React.createElement(React.Fragment, null,
      React.createElement('button', { onClick: toggleOpen }, 'Toggle chat'),
      React.createElement('section', { hidden: !open }, React.createElement('textarea')));
  }
  try {
    await act(async () => { root.render(React.createElement(Probe)); });
    assert.equal(dom.window.document.activeElement, pageInput);
    assert.equal(container.dataset.chatMounted, 'true');
    assert.equal(mounted, 1);
    if (restored) act(() => container.querySelector('button')!.click());
    act(() => container.querySelector('button')!.click());
    assert.equal(dom.window.document.activeElement, container.querySelector('textarea'));
    pageInput.focus();
    container.dataset.chatFocus = 'true';
    act(() => container.dispatchEvent(new dom.window.Event('jini-chat-open')));
    assert.equal(dom.window.document.activeElement, container.querySelector('textarea'));
    assert.equal(container.dataset.chatFocus, undefined);
    pageInput.focus();
    await act(async () => { root.render(React.createElement(Probe)); });
    assert.equal(dom.window.document.activeElement, pageInput);
  } finally {
    await act(async () => root.unmount());
    assert.equal(container.dataset.chatMounted, undefined);
    restore();
  }
});

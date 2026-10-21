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

test('React activation without a mount root still toggles, and touches no page element', async () => {
  const { dom, restore } = installDom({ html: '<div id="host"></div>' }, { url: 'https://example.test/' });
  const host = dom.window.document.getElementById('host')!;
  const root = createRoot(host);
  const seen: boolean[] = [];
  function Probe() {
    const [open, setOpen] = React.useState(false);
    const { toggleOpen } = useSiteAssistantActivation({ root: null, open, setOpen });
    seen.push(open);
    return React.createElement('button', { onClick: toggleOpen }, 'Toggle chat');
  }
  try {
    await act(async () => { root.render(React.createElement(Probe)); });
    act(() => host.querySelector('button')!.click());
    assert.equal(seen.at(-1), true);
    assert.equal(host.dataset.chatMounted, undefined);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

test('a focus request while already open and with no enabled composer leaves focus where it was', async () => {
  const { dom, restore } = installDom({ html: '<input id="page"><div id="root"></div>' }, { url: 'https://example.test/' });
  const container = dom.window.document.getElementById('root')!;
  const pageInput = dom.window.document.getElementById('page')!;
  container.dataset.chatOpen = 'true';
  const root = createRoot(container);
  function Probe() {
    const [open, setOpen] = React.useState(true);
    useSiteAssistantActivation({ root: container, open, setOpen });
    return React.createElement('textarea', { disabled: true });
  }
  try {
    await act(async () => { root.render(React.createElement(Probe)); });
    pageInput.focus();
    container.dataset.chatFocus = 'true';
    act(() => container.dispatchEvent(new dom.window.Event('jini-chat-open')));
    assert.equal(dom.window.document.activeElement, pageInput, 'a disabled composer is never focused');
    assert.equal(container.dataset.chatFocus, undefined, 'the focus intent is consumed');
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

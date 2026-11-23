import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { React, act, createRoot, installDom } from './react-dom-harness';

const { SiteAssistantModelLabel, SiteAssistantRetryBar } = await import('../SiteAssistantStatus');
const t = (key: string) => key;

async function render(node: React.ReactElement) {
  const { dom, restore } = installDom({ html: '<div id="r"></div>' }, { url: 'https://example.test/' });
  const root = createRoot(dom.window.document.getElementById('r')!);
  await act(async () => root.render(node));
  return { dom, container: dom.window.document.getElementById('r')!, done: async () => { await act(async () => root.unmount()); restore(); } };
}

test('model label names the answering model, politely, and is not announced on its own', async () => {
  const view = await render(React.createElement(SiteAssistantModelLabel, { model: 'gemini-flash-latest', t }));
  try {
    const label = view.container.querySelector('.tovu-site-assistant__model')!;
    assert.equal(label.textContent, 'Answered by gemini-flash-latest');
    assert.equal(label.getAttribute('aria-live'), null, 'the streamed reply is the live region; a model note must not interrupt it');
  } finally { await view.done(); }
});

test('model label renders nothing when the model is unknown', async () => {
  for (const model of [null, '']) {
    const view = await render(React.createElement(SiteAssistantModelLabel, { model, t }));
    try { assert.equal(view.container.innerHTML, ''); } finally { await view.done(); }
  }
});

test('retry bar offers one labelled button that calls onRetry, and renders nothing without a failed prompt', async () => {
  let retried = 0;
  const view = await render(React.createElement(SiteAssistantRetryBar, { prompt: 'what is new?', onRetry: () => { retried += 1; }, t }));
  try {
    const bar = view.container.querySelector('[role="group"]')!;
    assert.ok(bar, 'a failed prompt shows the bar');
    const buttons = bar.querySelectorAll('button');
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0]!.textContent, 'Try again');
    assert.equal(buttons[0]!.getAttribute('type'), 'button');
    act(() => buttons[0]!.click());
    assert.equal(retried, 1);
  } finally { await view.done(); }
  const empty = await render(React.createElement(SiteAssistantRetryBar, { prompt: null, onRetry: () => {}, t }));
  try { assert.equal(empty.container.innerHTML, ''); } finally { await empty.done(); }
});

function rulesOf(css: string) {
  const dom = new JSDOM('<!doctype html><style></style>');
  const style = dom.window.document.querySelector('style')!;
  style.textContent = css;
  return { rules: Array.from(style.sheet!.cssRules) as CSSStyleRule[], close: () => dom.window.close() };
}
const widgetCss = readFileSync(new URL('../widget.css', import.meta.url), 'utf8');
const prop = (rules: CSSStyleRule[], selector: string, name: string) => rules.find(r => r.selectorText === selector)?.style.getPropertyValue(name);
const SEND = '.tovu-site-assistant .jini-chat-pane .jini-composer-send';

test('send button: enabled is solid primary, disabled is a visibly different neutral, with hover and focus-visible states', () => {
  const { rules, close } = rulesOf(widgetCss);
  try {
    assert.equal(prop(rules, SEND, 'background'), 'var(--primary)');
    const disabled = `${SEND}:disabled`;
    assert.notEqual(prop(rules, disabled, 'background'), 'var(--primary)', 'disabled must not be the enabled colour at lower opacity');
    assert.equal(prop(rules, disabled, 'opacity') || '1', '1', 'no opacity fade: the neutral colours carry the state');
    assert.equal(prop(rules, disabled, 'cursor'), 'not-allowed');
    assert.ok(prop(rules, `${SEND}:not(:disabled):hover`, 'background'), 'enabled hover is defined');
    assert.match(prop(rules, `${SEND}:focus-visible`, 'outline') ?? '', /2px solid/, 'keyboard focus is visible');
  } finally { close(); }
});

test('jump-to-latest button never covers a message: the list reserves a band for it above the composer', () => {
  const { rules, close } = rulesOf(widgetCss);
  try {
    // Button: 40px tall, floated 8px above the composer by the library. Messages must end above that.
    assert.equal(prop(rules, '.tovu-site-assistant .jini-chat-pane .jini-message-list', 'padding'),
      '12px 16px calc(var(--jini-chat-controls-height, 240px) + 56px)');
  } finally { close(); }
});

const { useSiteAssistantWidget } = await import('../SiteAssistantWidget.hooks');

test('widget hook: a failed send exposes the prompt, retry puts it back in the composer; the model is set by the reply', async () => {
  const { dom, restore } = installDom({ html: '<div id="tovu-site-assistant-root"></div>' }, { url: 'https://example.test/' });
  const root = createRoot(dom.window.document.getElementById('tovu-site-assistant-root')!);
  const saved = globalThis.fetch;
  let widget!: ReturnType<typeof useSiteAssistantWidget>;
  function Probe() { widget = useSiteAssistantWidget({}); return null; }
  const run = async (history: string, response: Response) => {
    globalThis.fetch = (async () => response) as typeof fetch;
    let done!: () => void; const finished = new Promise<void>(r => { done = r; });
    await act(async () => {
      await widget.transport.startRun({ history: [{ id: 'u', role: 'user', content: history }], signal: new AbortController().signal },
        { onEvent: () => {}, onError: () => {}, onDone: () => done() });
      await finished;
    });
  };
  try {
    await act(async () => root.render(React.createElement(Probe)));
    const inserted: string[] = [];
    widget.composerHandle.current = { insertText: (text: string) => inserted.push(text), addFolders: () => {} };
    await run('what is new?', Response.json({ error: 'Too many requests' }, { status: 429 }));
    assert.equal(widget.failedPrompt, 'what is new?');
    act(() => widget.retryFailedPrompt());
    assert.deepEqual(inserted, ['what is new?']);
    assert.equal(widget.failedPrompt, null, 'the bar goes away once the question is back in the box');
    const sse = 'event: text\ndata: {"delta":"Hi"}\n\nevent: meta\ndata: {"model":"gemini-flash-latest"}\n\nevent: end\ndata: {"reason":"stop"}\n\n';
    await run('hello', new Response(sse, { status: 200 }));
    assert.equal(widget.model, 'gemini-flash-latest');
    assert.equal(widget.failedPrompt, null);
    act(() => widget.resetConversation());
    assert.equal(widget.model, null, 'a new thread forgets the model note');
  } finally { await act(async () => root.unmount()); globalThis.fetch = saved; restore(); }
});

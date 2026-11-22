import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createVanillaToolConfirmation } from '../vanilla-tool-confirmation';

const directive = { kind: 'tool_confirmation' as const, challengeId: 'a'.repeat(22), title: 'Allow search?', summary: '<script>approved</script>' };
function fixture(confirm: (input: { challengeId: string; allow: boolean }) => Promise<boolean> = async () => true) {
  // dfea76018 (Jini 7b4d99636) retired the navigation proposal in favour of a human-only strip.
  const dom = new JSDOM('<button id="previous">Stop</button><form><main><div class="jini-chat-vanilla__tool-confirmation" hidden><span></span><button type="button">Allow</button></div></main></form>', { pretendToBeVisual: true });
  const document = dom.window.document, element = document.querySelector('main')!, strip = element.querySelector<HTMLElement>('div')!;
  const previous = document.getElementById('previous')!;
  previous.focus();
  let navigations = 0;
  element.querySelector('button')!.addEventListener('click', () => { navigations++; });
  element.addEventListener('click', () => { navigations++; });
  let submits = 0;
  document.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); submits++; });
  const clicks: Event[] = [];
  document.addEventListener('click', event => { clicks.push(event); }, true);
  const decisions: unknown[] = [];
  const show = createVanillaToolConfirmation({ element, document }, { confirm: input => { decisions.push(input); return confirm(input); } });
  return { dom, document, element, strip, previous, show, decisions, clicks, navigations: () => navigations, submits: () => submits };
}

for (const allow of [true, false]) test(`vanilla confirmation strip click allow=${allow} cannot activate navigation or submit`, async t => {
  const f = fixture(); t.after(() => f.dom.window.close());
  f.show({ directive });
  assert.equal(f.strip.hidden, false);
  assert.equal(f.strip.getAttribute('role'), 'group');
  assert.equal(f.strip.querySelector('script'), null);
  assert.equal(f.strip.textContent?.includes('<script>approved</script>'), true);
  const buttons = f.strip.querySelectorAll('button');
  assert.equal(f.document.activeElement, buttons[1], 'focus defaults to Cancel');
  buttons[allow ? 0 : 1].click();
  assert.deepEqual(f.decisions, [{ challengeId: directive.challengeId, allow }]);
  assert.equal(f.clicks.length, 1);
  assert.equal(f.clicks[0]!.defaultPrevented, true, 'the decision cancels native anchor/form activation');
  assert.equal(f.navigations(), 0);
  assert.equal(f.submits(), 0);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.strip.hidden, true, 'a successful send tears down the prompt');
  assert.equal(f.document.activeElement, f.previous);
  assert.equal(f.strip.textContent, 'Allow');
});

test('expiry, supersession, run teardown and open/close chrome changes clean listeners and focus', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); t.after(() => f.dom.window.close());
  f.show({ directive });
  f.strip.hidden = true;
  f.element.click();
  await Promise.resolve();
  assert.equal(f.strip.hidden, false);
  f.show({ directive: { ...directive, challengeId: 'b'.repeat(22), title: 'New prompt' } });
  assert.equal(f.strip.querySelectorAll('button').length, 2);
  t.mock.timers.tick(60_000);
  assert.equal(f.strip.hidden, true);
  assert.equal(f.strip.querySelectorAll('button').length, 1);
  f.show({ directive });
  f.element.click(); // queued projection cannot revive a torn down prompt
  f.show({ directive: null });
  await Promise.resolve();
  assert.equal(f.strip.hidden, true);
  assert.deepEqual(f.decisions, []);
  f.previous.remove();
  f.show({ directive });
  f.show({ directive: null });
});

test('a Jini chrome re-render (Escape close, outside-bubble reopen) cannot drop a pending prompt', async t => {
  const f = fixture(); t.after(() => f.dom.window.close());
  f.show({ directive });
  const label = f.strip.querySelector('span')!;
  f.strip.hidden = true; // Even a host mutation must not discard a pending prompt.
  label.textContent = '';
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.strip.hidden, false);
  assert.equal(label.textContent, `${directive.title} ${directive.summary}`);
  f.strip.querySelectorAll('button')[1].click();
  f.strip.hidden = true; // after a decision the observer is gone: no revival
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.strip.hidden, true);
  assert.equal(f.strip.textContent, 'Allow');
});

test('unmounted or incomplete host markup never creates a second proposal bar', () => {
  for (const html of ['', '<div class="jini-chat-vanilla__tool-confirmation"></div>', '<div class="jini-chat-vanilla__tool-confirmation"><span></span></div>', '<div class="jini-chat-vanilla__proposal"><span>Go to About?</span><button type="button">Go there</button></div>']) {
    const dom = new JSDOM(`<main>${html}</main>`);
    const element = dom.window.document.querySelector('main')!;
    const show = createVanillaToolConfirmation({ element, document: dom.window.document });
    show({ directive });
    assert.equal(element.innerHTML, html);
    show({ directive: null });
    dom.window.close();
  }
});

for (const allow of [true, false]) test(`failed vanilla decision allow=${allow} stays answerable and retries only on a click`, async t => {
  let settle!: (ok: boolean) => void;
  let sends = 0;
  const f = fixture(() => ++sends === 1 ? new Promise<boolean>(resolve => { settle = resolve; }) : Promise.resolve(true));
  t.after(() => f.dom.window.close());
  f.show({ directive });
  const button = f.strip.querySelectorAll('button')[allow ? 0 : 1];
  button.click(); button.click();
  assert.equal(sends, 1, 'an unresolved decision blocks a second send');
  assert.equal(f.strip.hidden, false, 'the original prompt remains while sending');
  settle(false);
  await new Promise(resolve => setTimeout(resolve, 0));
  const label = f.strip.querySelector('span')!;
  const expected = `${directive.title} ${directive.summary} Couldn't send your decision. Try again.`;
  assert.equal(label.textContent, expected, 'a failed send leaves the prompt with a failure notice');
  f.strip.hidden = true; label.textContent = '';
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.strip.hidden, false, 'the observer restores the failed prompt');
  assert.equal(label.textContent, expected, 'the observer restores the failure notice');
  button.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(f.decisions, [{ challengeId: directive.challengeId, allow }, { challengeId: directive.challengeId, allow }], 'retry sends the same decision only after another click');
  assert.equal(f.strip.hidden, true, 'successful retry tears down the prompt');
});

for (const replacement of [false, true]) test(`late vanilla failure cannot revive or change a prompt after replacement=${replacement}`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let settle!: (ok: boolean) => void;
  const f = fixture(() => new Promise<boolean>(resolve => { settle = resolve; }));
  t.after(() => f.dom.window.close());
  f.show({ directive });
  f.strip.querySelector('button')!.click();
  const next = { ...directive, challengeId: 'b'.repeat(22), title: 'New prompt' };
  if (replacement) f.show({ directive: next });
  else t.mock.timers.tick(60_000);
  settle(false);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.strip.hidden, !replacement, 'late failure preserves expiry or replacement visibility');
  assert.equal(f.strip.querySelector('span')!.textContent, replacement ? `${next.title} ${next.summary}` : '', 'late failure adds no notice to the replacement or expired prompt');
  f.show({ directive: null });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createVanillaToolConfirmation } from '../vanilla-tool-confirmation';

const directive = { kind: 'tool_confirmation' as const, challengeId: 'a'.repeat(22), title: 'Allow search?', summary: '<script>approved</script>' };
function fixture() {
  const dom = new JSDOM('<button id="previous">Stop</button><main><div class="jini-chat-vanilla__proposal" hidden><span>Go to About?</span><button type="button">Go there</button></div></main>', { pretendToBeVisual: true });
  const document = dom.window.document, element = document.querySelector('main')!, strip = element.querySelector<HTMLElement>('div')!;
  const previous = document.getElementById('previous')!;
  previous.focus();
  let navigations = 0;
  element.querySelector('button')!.addEventListener('click', () => { navigations++; });
  const decisions: unknown[] = [];
  const show = createVanillaToolConfirmation({ element, document }, { confirm: async input => { decisions.push(input); return true; } });
  return { dom, document, element, strip, previous, show, decisions, navigations: () => navigations };
}

for (const allow of [true, false]) test(`existing vanilla proposal strip click allow=${allow} cannot activate navigation`, async t => {
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
  assert.equal(f.navigations(), 0);
  assert.equal(f.strip.hidden, true);
  assert.equal(f.document.activeElement, f.previous);
  assert.equal(f.strip.textContent, 'Go to About?Go there');
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
  f.strip.hidden = true; // what Jini's renderChrome does on close/open with no navigation proposal
  label.textContent = '';
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.strip.hidden, false);
  assert.equal(label.textContent, `${directive.title} ${directive.summary}`);
  f.strip.querySelectorAll('button')[1].click();
  f.strip.hidden = true; // after a decision the observer is gone: no revival
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.strip.hidden, true);
  assert.equal(f.strip.textContent, 'Go to About?Go there');
});

test('unmounted or incomplete host markup never creates a second proposal bar', () => {
  for (const html of ['', '<div class="jini-chat-vanilla__proposal"></div>', '<div class="jini-chat-vanilla__proposal"><span></span></div>']) {
    const dom = new JSDOM(`<main>${html}</main>`);
    const element = dom.window.document.querySelector('main')!;
    const show = createVanillaToolConfirmation({ element, document: dom.window.document });
    show({ directive });
    assert.equal(element.innerHTML, html);
    show({ directive: null });
    dom.window.close();
  }
});

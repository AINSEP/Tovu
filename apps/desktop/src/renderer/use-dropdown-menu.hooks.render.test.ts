/**
 * @file `useDismissibleDropdown` and `useMenuKeyboard` rendered from their real module under jsdom,
 * with markup built from each hook's own refs. Moved from `App.hooks.render.test.ts` with the split,
 * plus the listener-lifetime and focus-port cases the source-text tests in `App.hooks.test.ts` used
 * to cover — now asserted through the hooks' injected `doc` port instead.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { countingTarget, renderHookWithView as renderHook, type TestContext } from './app-hooks.test-support.js';
import { installDom } from './dom-hook-harness.js';
import { useDismissibleDropdown, useMenuKeyboard, type DocumentFocus, type DocumentListeners } from './use-dropdown-menu.hooks.js';

const window = installDom();

// ── useDismissibleDropdown ──────────────────────────────────────────────────────────────────────

test('useDismissibleDropdown: outside pointerdown and Escape close it; a press inside does not', (t) => {
  const hook = renderHook(t, () => useDismissibleDropdown<HTMLDivElement>(),
    (value) => createElement('div', { ref: value.containerRef }, createElement('button', { id: 'inside' })));
  const pointer = (target: Element) => act(() => { target.dispatchEvent(new window.Event('pointerdown', { bubbles: true })); });
  act(() => hook.current().setOpen(true));
  pointer(document.getElementById('inside')!);
  assert.equal(hook.current().open, true);
  pointer(document.body);
  assert.equal(hook.current().open, false);
  act(() => hook.current().setOpen(true));
  act(() => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); });
  assert.equal(hook.current().open, false);
});

test('useDismissibleDropdown: listens only while open, ignores other keys, and detaches on close and unmount', (t) => {
  const doc = countingTarget<DocumentListeners>(document);
  const hook = renderHook(t, () => useDismissibleDropdown<HTMLDivElement>({}, { doc: doc.port }),
    (value) => createElement('div', { ref: value.containerRef }, createElement('button', { id: 'counted-inside' })));
  assert.equal(doc.live(), 0, 'a closed dropdown listens to nothing');
  act(() => hook.current().setOpen(true));
  assert.equal(doc.live(), 2, 'one pointerdown and one keydown listener');
  act(() => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' })); });
  assert.equal(hook.current().open, true, 'a key that is not Escape leaves it open');
  act(() => { document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true })); });
  assert.deepEqual([hook.current().open, doc.live()], [false, 0]);
  act(() => hook.current().setOpen(true));
  hook.unmount();
  assert.equal(doc.live(), 0);
});

// ── useMenuKeyboard ─────────────────────────────────────────────────────────────────────────────

function menuHarness(t: TestContext, prefix: string) {
  let open = false;
  const id = (name: string) => `${prefix}-${name}`;
  const hook = renderHook(t, () => useMenuKeyboard<HTMLDivElement, HTMLButtonElement>({ open }), (value) => createElement('div', null,
    createElement('button', { id: id('trigger'), ref: value.triggerRef }),
    createElement('button', { id: id('elsewhere') }),
    open ? createElement('div', { role: 'menu', ref: value.menuRef },
      createElement('button', { role: 'menuitem', id: id('one') }),
      createElement('button', { role: 'menuitemradio', id: id('two') }),
      createElement('button', { role: 'menuitem', id: id('three') })) : null));
  const setOpen = (next: boolean) => { open = next; hook.rerender(); };
  const key = (name: string) => {
    let prevented = false;
    hook.current().onMenuKeyDown({ key: name, preventDefault: () => { prevented = true; } } as never);
    return prevented;
  };
  return { setOpen, key, focused: () => document.activeElement?.id.replace(`${prefix}-`, ''), id };
}

test('useMenuKeyboard: opening focuses the first entry and the arrows, Home and End move between entries', (t) => {
  const menu = menuHarness(t, 'nav');
  menu.setOpen(true);
  assert.equal(menu.focused(), 'one');
  assert.equal(menu.key('ArrowDown'), true);
  assert.equal(menu.focused(), 'two');
  menu.key('End');
  assert.equal(menu.focused(), 'three');
  menu.key('ArrowDown');
  assert.equal(menu.focused(), 'one');
  menu.key('ArrowUp');
  assert.equal(menu.focused(), 'three');
  menu.key('Home');
  assert.equal(menu.focused(), 'one');
  assert.equal(menu.key('a'), false, 'a key that is not menu navigation is left alone');
  assert.equal(menu.focused(), 'one');
});

test('useMenuKeyboard: closing with focus inside (or nowhere) returns it to the trigger; a deliberate click away is left alone', (t) => {
  const menu = menuHarness(t, 'close');
  menu.setOpen(true);
  menu.setOpen(false);
  assert.equal(menu.focused(), 'trigger');
  assert.equal(menu.key('ArrowDown'), false, 'with no menu mounted there is nothing to move to');

  menu.setOpen(true);
  (document.activeElement as HTMLElement).blur();
  assert.equal(document.activeElement, document.body);
  menu.setOpen(false);
  assert.equal(menu.focused(), 'trigger');

  menu.setOpen(true);
  (document.getElementById(menu.id('elsewhere')) as HTMLElement).focus();
  menu.setOpen(false);
  assert.equal(menu.focused(), 'elsewhere');
});

// A menu kept mounted while closed (hidden, not unrendered) still holds focus when it closes, so
// the hook must recognise focus inside it — not only the unmount case, where focus falls to <body>.
test('useMenuKeyboard: a menu that stays mounted while closed returns focus from inside it, and not from outside', (t) => {
  let open = false;
  const hook = renderHook(t, () => useMenuKeyboard<HTMLDivElement, HTMLButtonElement>({ open }), (value) => createElement('div', null,
    createElement('button', { id: 'kept-trigger', ref: value.triggerRef }),
    createElement('button', { id: 'kept-elsewhere' }),
    createElement('div', { role: 'menu', ref: value.menuRef, hidden: !open },
      createElement('button', { role: 'menuitem', id: 'kept-one' }),
      createElement('button', { role: 'menuitem', id: 'kept-two' }))));
  const setOpen = (next: boolean) => { open = next; hook.rerender(); };

  setOpen(true);
  (document.getElementById('kept-two') as HTMLElement).focus();
  setOpen(false);
  assert.equal(document.activeElement?.id, 'kept-trigger', 'focus left inside a still-mounted menu goes back to the trigger');

  setOpen(true);
  (document.getElementById('kept-elsewhere') as HTMLElement).focus();
  setOpen(false);
  assert.equal(document.activeElement?.id, 'kept-elsewhere', 'focus already moved outside the menu is left alone');
});

test('useMenuKeyboard: a document reporting no focused element at all still hands focus back to the trigger', (t) => {
  const doc: { activeElement: Element | null; body: HTMLElement } = { activeElement: null, body: document.body };
  let open = false;
  const hook = renderHook(t, () => useMenuKeyboard<HTMLDivElement, HTMLButtonElement>({ open }, { doc: doc as unknown as DocumentFocus }),
    (value) => createElement('div', null,
      createElement('button', { id: 'null-trigger', ref: value.triggerRef }),
      open ? createElement('div', { role: 'menu', ref: value.menuRef }, createElement('button', { role: 'menuitem', id: 'null-one' })) : null));
  open = true;
  hook.rerender();
  assert.equal(document.activeElement?.id, 'null-one');
  doc.activeElement = null;
  open = false;
  hook.rerender();
  assert.equal(document.activeElement?.id, 'null-trigger');
});

test('useMenuKeyboard: arrow keys read the current entry from the injected document', (t) => {
  const doc: { activeElement: Element | null; body: HTMLElement } = { activeElement: null, body: document.body };
  let open = false;
  const hook = renderHook(t, () => useMenuKeyboard<HTMLDivElement, HTMLButtonElement>({ open }, { doc: doc as unknown as DocumentFocus }),
    (value) => createElement('div', null,
      open ? createElement('div', { role: 'menu', ref: value.menuRef },
        createElement('button', { role: 'menuitem', id: 'port-one' }),
        createElement('button', { role: 'menuitem', id: 'port-two' })) : null));
  open = true;
  hook.rerender();
  doc.activeElement = document.getElementById('port-two');
  hook.current().onMenuKeyDown({ key: 'ArrowDown', preventDefault: () => {} } as never);
  assert.equal(document.activeElement?.id, 'port-one', "ArrowDown wraps from the port's focused entry, not the real one");
});

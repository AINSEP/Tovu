/**
 * @file `navLinkClick` run against the real function. Moved from `App.hooks.test.ts` with the
 * split; the section hooks are rendered in `use-section-nav.hooks.render.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { navLinkClick } from './use-section-nav.hooks.js';

test('a NavLink click selects its own section when the link is enabled', () => {
  for (const disabled of [false, undefined]) {
    const selected: string[] = [];
    navLinkClick({ disabled, id: 'projects', onSelectSection: (id) => selected.push(id) })();
    assert.deepEqual(selected, ['projects'], `disabled=${disabled}`);
  }
});

test('a disabled NavLink never fires onSelectSection', () => {
  // `aria-disabled`, not the native attribute, so the button still receives the click; this guard is
  // the only thing keeping an unbuilt section (Marketplace, today) from being selected.
  const selected: string[] = [];
  navLinkClick({ disabled: true, id: 'marketplace', onSelectSection: (id) => selected.push(id) })();
  assert.equal(selected.length, 0);
});

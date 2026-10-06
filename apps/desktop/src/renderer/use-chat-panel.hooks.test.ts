/**
 * @file The desktop chat panel's own rules (`use-chat-panel.hooks.ts`): docked at 900px and up,
 * overlay below; Escape closes only the overlay; the turn's site is the VISIBLE site tab's folder,
 * never a background tab's; and the root `data-chat` value the stylesheet keys off.
 *
 * Plain functions, tested directly, for the reason that file's header gives.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAT_PANEL_DOCK_MIN_WIDTH,
  activeSiteDirOf,
  chatPanelDataAttribute,
  chatPanelLayout,
  closesOnKey,
} from './use-chat-panel.hooks.js';

test('the panel docks at exactly 900px and overlays one pixel below', () => {
  assert.equal(CHAT_PANEL_DOCK_MIN_WIDTH, 900);
  assert.equal(chatPanelLayout({ width: 900 }), 'docked');
  assert.equal(chatPanelLayout({ width: 1440 }), 'docked');
  assert.equal(chatPanelLayout({ width: 899 }), 'overlay');
  assert.equal(chatPanelLayout({ width: 0 }), 'overlay');
});

test('Escape closes the open overlay, and nothing else does', () => {
  assert.equal(closesOnKey({ key: 'Escape', open: true, layout: 'overlay' }), true);
  // Docked is "always visible once opened" (owner): Escape in the composer must not hide it.
  assert.equal(closesOnKey({ key: 'Escape', open: true, layout: 'docked' }), false);
  assert.equal(closesOnKey({ key: 'Escape', open: false, layout: 'overlay' }), false);
  assert.equal(closesOnKey({ key: 'Enter', open: true, layout: 'overlay' }), false);
});

const site = (id: string, installDir: string) => ({ id, installDir });

test("the turn's site is the visible tab's folder, not another open tab's", () => {
  const openSites = [site('a', '/sites/a'), site('b', '/sites/b')];
  assert.equal(activeSiteDirOf({ visibleWorkspaceId: 'b', openSites }), '/sites/b');
  assert.equal(activeSiteDirOf({ visibleWorkspaceId: 'a', openSites }), '/sites/a');
});

test('no visible site tab (sites home, appearance, a closed tab) means no site this turn', () => {
  const openSites = [site('a', '/sites/a')];
  assert.equal(activeSiteDirOf({ visibleWorkspaceId: null, openSites }), null);
  assert.equal(activeSiteDirOf({ visibleWorkspaceId: 'gone', openSites }), null);
  assert.equal(activeSiteDirOf({ visibleWorkspaceId: 'a', openSites: [] }), null);
});

test("the root's data-chat value: closed, or the open panel's layout", () => {
  assert.equal(chatPanelDataAttribute({ open: false, layout: 'docked' }), 'closed');
  assert.equal(chatPanelDataAttribute({ open: false, layout: 'overlay' }), 'closed');
  assert.equal(chatPanelDataAttribute({ open: true, layout: 'docked' }), 'docked');
  assert.equal(chatPanelDataAttribute({ open: true, layout: 'overlay' }), 'overlay');
});

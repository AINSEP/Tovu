/**
 * @file `TopNav` (and its `NavLink`s) rendered from its own module: the version beside the brand,
 * which link reads as current, the running-sites badge, and inert unbuilt sections.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { fakeSiteSettings, installBridge, mount, settle, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { TopNav } from './TopNav.js';
import { visibleSections, type RunnerSectionId } from '../../contracts/sections.js';
import type { RunnerInventoryBridge } from '../runner-api.js';

after(closeHost);

async function renderNav(t: TestContext, props: { activeId?: RunnerSectionId; onSitesHome?: boolean; runningCount?: number } = {}, bridge: Partial<RunnerInventoryBridge> = {}) {
  installBridge({ t, bridge: { getAppVersion: async () => '4.5.6', ...bridge } });
  const selected: RunnerSectionId[] = [];
  const view = mount({ t, element: createElement(TopNav, {
    activeId: 'projects', onSitesHome: true, runningCount: 0, theme: 'system',
    onThemeChange: () => {}, onOpenAppearance: () => {}, onSelectSection: (id) => { selected.push(id); },
    useSiteSettings: fakeSiteSettings().useSiteSettings, ...props,
  }) });
  await settle();
  return { ...view, selected };
}

test('TopNav: the loaded version sits beside the Tovu wordmark', async (t) => {
  const view = await renderNav(t);
  assert.equal(view.container.querySelector('.topnav__wordmark')?.textContent, 'Tovu');
  const version = view.container.querySelector('.topnav__version');
  assert.equal(version?.textContent, '4.5.6');
  assert.equal(version?.getAttribute('title'), '4.5.6');
  assert.equal(view.container.querySelector('.topnav__brand')?.hasAttribute('title'), false, 'no error, no brand tooltip');
});

test('TopNav: a failed version load shows no version and puts the error on the brand', async (t) => {
  const view = await renderNav(t, {}, { getAppVersion: () => Promise.reject(new Error('version IPC down')) });
  assert.equal(view.container.querySelector('.topnav__version'), null);
  assert.match(view.container.querySelector('.topnav__brand')?.getAttribute('title') ?? '', /version IPC down/);
});

test('TopNav: Websites reads as current only while the sites home is on screen', async (t) => {
  const home = await renderNav(t);
  assert.equal(home.byLabel('Websites')?.getAttribute('aria-current'), 'page');
  assert.ok(home.byLabel('Websites')?.classList.contains('is-active'));
  const inTab = await renderNav(t, { onSitesHome: false });
  assert.equal(inTab.all('[aria-current="page"]').length, 0, 'with a site tab in view no section is current');
});

test('TopNav: the running badge appears on Websites only, and only when a site is running', async (t) => {
  const idle = await renderNav(t);
  assert.equal(idle.container.querySelector('.topnav__count'), null);
  const busy = await renderNav(t, { runningCount: 3 });
  const badges = busy.all('.topnav__count');
  assert.equal(badges.length, 1);
  assert.equal(badges[0]?.textContent, '3');
  assert.ok(busy.byLabel('Websites')?.contains(badges[0]!));
});

test('TopNav: Websites selects its section; unbuilt sections are inert but keep their tooltip', async (t) => {
  const view = await renderNav(t);
  await view.click(view.byLabel('Websites'));
  assert.deepEqual(view.selected, ['projects']);
  const disabled = view.all('.topnav__link--disabled');
  assert.ok(disabled.length > 0, 'at least one section is not built yet');
  for (const link of disabled) {
    assert.equal(link.getAttribute('aria-disabled'), 'true');
    assert.equal(link.getAttribute('tabindex'), '-1');
    assert.equal(link.hasAttribute('disabled'), false, 'never the native attribute, which would kill the tooltip');
    assert.match(link.getAttribute('data-tip') ?? '', /Coming soon/);
    await view.click(link);
  }
  assert.deepEqual(view.selected, ['projects'], 'clicking an unbuilt section selects nothing');
  const websites = view.byLabel('Websites')!;
  assert.equal(websites.hasAttribute('aria-disabled'), false);
  assert.equal(websites.hasAttribute('tabindex'), false);
});

test('TopNav: the tools hold the Settings gear', async (t) => {
  const view = await renderNav(t);
  assert.ok(view.container.querySelector('.topnav__tools [aria-label="Settings"]'));
});

test('TopNav: every section but Websites is disabled, Marketplace included', async (t) => {
  // The generic `section.id !== 'projects'` rule is what grays Marketplace out. If someone rewrites
  // it as an allowlist or adds an `id === 'marketplace' ? false :` carve-out, this must fail.
  const view = await renderNav(t);
  const disabled = view.all('.topnav__link--disabled').map((link) => link.getAttribute('aria-label'));
  assert.deepEqual(disabled, visibleSections().filter(({ id }) => id !== 'projects').map(({ label }) => label));
  assert.ok(disabled.includes('Marketplace'));
});

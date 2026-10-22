/** Real Chromium layout of the existing nav/header markup and production stylesheet; no app server. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { sourceFunction } from './source-test-harness.js';
import { visibleSections } from '../contracts/sections.js';
import { navAvailability } from './nav-availability.js';
import { navLinkClick, settingsControlHandlers } from './App.hooks.js';
import { useSitesFoldersDialog } from './use-sites-folders-dialog.hooks.js';

test('Websites fits at 375px with every nav control and header action inside the page', { timeout: 120_000 }, async (t) => {
  // The queue uses Node/tsx without the renderer tsconfig; its classic JSX transform needs React.
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, 'React', previousReact);
    else Reflect.deleteProperty(globalThis, 'React');
  });
  const { SectionIcon, GearIcon } = await import('./icons.js');
  const source = fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  const foldersSource = fs.readFileSync(new URL('./SitesFolders.tsx', import.meta.url), 'utf8');
  const settings = { folders: { roots: [], extraRoots: [], home: '' }, open: false, show() {}, close() {} };
  // `SettingsDialogShell` is the dialog's default `Shell` parameter; the dialog stays closed here, so its frame never renders.
  const SitesFoldersDialog = sourceFunction(foldersSource, 'SitesFoldersDialog', {
    useSitesFoldersDialog, SitesFoldersWarning: sourceFunction(foldersSource, 'SitesFoldersWarning'), SettingsDialogShell: () => null,
  });
  const SitesFolders = () => createElement(SitesFoldersDialog, { settings });
  const NavLink = sourceFunction(source, 'NavLink', { navLinkClick, navAvailability, SectionIcon });
  const SettingsControl = sourceFunction(source, 'SettingsControl', {
    useDismissibleDropdown: () => ({ open: false, setOpen() {}, containerRef: { current: null } }),
    useSiteStorageSettings: () => settings, settingsControlHandlers, navAvailability, GearIcon, SitesFoldersDialog,
    useMenuKeyboard: () => ({ menuRef: { current: null }, triggerRef: { current: null }, onMenuKeyDown() {} }),
  });
  const TopNav = sourceFunction(source, 'TopNav', {
    useAppVersion: () => ({ version: '0.1.13-preview-long-version', error: null }), visibleSections, NavLink, SettingsControl,
  });
  const MainHeader = sourceFunction(source, 'MainHeader', { SitesFolders });
  const nav = renderToStaticMarkup(createElement(TopNav, {
    activeId: 'projects', onSitesHome: true, runningCount: 12, theme: 'light', onThemeChange() {}, onOpenAppearance() {}, onSelectSection() {},
  }));
  const header = renderToStaticMarkup(createElement(MainHeader, {
    activeId: 'projects', isCreating: false, activeLabel: 'Websites', onCreateWebsite() {}, onRescan: async () => {},
    rescanning: false, onAddSite: async () => {}, adding: false,
  }));
  let css = fs.readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  // Embed the app's bundled fonts so the fit assertion includes the production text metrics.
  css = css.replace(/url\('\.\.\/(vendor\/fonts\/[^']+)'\)/g, (_match, file: string) =>
    `url('data:font/ttf;base64,${fs.readFileSync(new URL(`./public/${file}`, import.meta.url)).toString('base64')}')`);
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.route('**/*', (route) => route.abort());
  await page.setContent(`<style>${css}</style><div class="app">${nav}<main class="main">${header}
    <div class="grid"><article class="card"><div class="card__tile"><svg class="card__placeholder" viewBox="0 0 48 36"></svg></div>
    <div class="card__body"><div class="card__head"><h2 class="card__name">${'LongWebsiteName'.repeat(12)}</h2><button>⋮</button></div>
    <div class="card__actions"><button class="button">Start</button><button class="button">Restart</button></div></div></article></div>
    </main></div>`);
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    // Raw browser code keeps tsx's __name helper for the nested bounds function out of Chromium.
    type Bounds = Pick<DOMRect, 'left' | 'right' | 'width'>;
    const measured = await page.evaluate<{
      width: number; pageWidth: number; mainWidth: number; mainScroll: number;
      nav: Bounds; gear: Bounds; actions: Bounds[]; links: Bounds[];
    }>(`(() => {
      const nav = document.querySelector('.topnav'), gear = document.querySelector('[aria-label="Settings"]');
      const main = document.querySelector('.main');
      const bounds = (element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width }; };
      return { width: innerWidth, pageWidth: document.documentElement.scrollWidth, mainWidth: main.clientWidth, mainScroll: main.scrollWidth,
        nav: bounds(nav), gear: bounds(gear), actions: [...document.querySelectorAll('.main__tools button')].map(bounds),
        links: [...document.querySelectorAll('.topnav__links button')].map(bounds) };
    })()`);
    assert.equal(measured.width, 375);
    assert.ok(measured.pageWidth <= 375, `${theme}: page is ${measured.pageWidth}px wide`);
    assert.ok(measured.mainScroll <= measured.mainWidth, `${theme}: Websites content scrolls horizontally`);
    assert.ok(measured.nav.left >= 0 && measured.nav.right <= 375);
    assert.ok(measured.gear.width >= 34 && measured.gear.right <= measured.nav.right);
    assert.equal(measured.links.length, visibleSections().length);
    for (const control of [...measured.links, ...measured.actions]) assert.ok(control.left >= 0 && control.right <= 375 && control.width > 0);
  }
});

test('narrow collapsed multi-tab content fills the dialog, and the desktop single-tab dialog uses its one column', { timeout: 120_000 }, async (t) => {
  // The CSS the renderer bundles: @jini-ai/ui's published dist, resolved as Vite resolves it. A
  // sibling ../Jini checkout path does not exist in CI, where the gates install from the registry.
  const requireFromHere = createRequire(import.meta.url);
  const variables = fs.readFileSync(requireFromHere.resolve('@jini-ai/ui/styles/variables.css'), 'utf8');
  const sharedCss = fs.readFileSync(requireFromHere.resolve('@jini-ai/ui/tabbed-dialog.css'), 'utf8').replace(/@import[^;]+;/g, '');
  const hostCss = fs.readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.route('**/*', (route) => route.abort());
  await page.setContent(`<style>${variables}${sharedCss}${hostCss}</style>
    <div class="jini-tabbed-dialog jini-tabbed-dialog-sidebar-collapsed">
      <header class="jini-tabbed-dialog-head">Settings</header><div class="jini-tabbed-dialog-body">
        <aside class="jini-tabbed-dialog-sidebar">One<br>Two</aside>
        <div class="jini-tabbed-dialog-content"><input aria-label="Panel input"></div>
      </div></div>`);
  const panel = page.locator('.jini-tabbed-dialog-content');
  const body = page.locator('.jini-tabbed-dialog-body');
  assert.ok((await panel.boundingBox())!.width > 300, 'collapsed panel must fill the flexible track');
  // Narrow dialogs restore the collapsed sidebar as a top tab row above a full-width panel.
  assert.ok(Math.abs((await panel.boundingBox())!.width - (await body.boundingBox())!.width) < 1, 'narrow panel must fill the body');
  const sidebar = page.locator('.jini-tabbed-dialog-sidebar');
  assert.equal(await sidebar.evaluate((node) => getComputedStyle(node).display), 'flex');
  assert.equal(await sidebar.evaluate((node) => getComputedStyle(node).flexDirection), 'row');
  const sidebarBounds = (await sidebar.boundingBox())!;
  assert.ok(sidebarBounds.y + sidebarBounds.height <= (await panel.boundingBox())!.y + 1, 'narrow tabs must sit above the panel');
  await page.locator('input').fill('content remains usable');
  assert.equal(await page.locator('input').inputValue(), 'content remains usable');
  await page.locator('.jini-tabbed-dialog').evaluate((node) => {
    node.classList.remove('jini-tabbed-dialog-sidebar-collapsed');
    node.classList.add('sites-settings-dialog');
  });
  assert.equal(await panel.evaluate((node) => getComputedStyle(node).gridColumn), '1');
  assert.ok(Math.abs((await panel.boundingBox())!.width - (await body.boundingBox())!.width) < 1, 'single-column host must not create an implicit second track');
  assert.ok((await panel.boundingBox())!.width > 300);
});

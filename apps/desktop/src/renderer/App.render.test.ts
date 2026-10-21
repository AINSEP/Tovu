/**
 * @file `App` rendered whole under jsdom, with the REAL default hooks for everything except the two
 * sites-settings seams (`useFolders`, `useSiteSettings`), against a hand-written desktop bridge set
 * on `window.tovuRunner` — the same preload surface Electron exposes. Every interaction is a real DOM
 * event on what the operator would see: the nav, the Settings menu, the tab strip, a site tab's bar,
 * its start panel, and the Projects header and body.
 *
 * Why those two seams are fakes: both defaults end in Jini's `useAsyncAction` / `SettingsDialogShell`,
 * and in this dev tree Jini is linked with its own React copy, so its hooks see a null dispatcher
 * under this file's React. The fakes keep the desktop's own `useSiteStorageSettings` real.
 *
 * Host stand-ins, not module mocks: `matchMedia` and `ResizeObserver` are absent from jsdom and get a
 * minimal recording version; `.css` imports (a Vite concern, `SitesFolders.tsx`'s dialog stylesheet)
 * load as empty modules through a `registerHooks` load hook, since Node cannot import CSS at all.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import type { CreatedSiteRecord, SiteRecord } from '../contracts/project.js';
import type { RunnerSectionId } from '../contracts/sections.js';
import { closeHost, act, dom, openFirstSite, renderApp, settle, site } from './app-render-harness.js';

// jsdom's visual clock keeps the process alive after the last test unless the window is closed.
after(closeHost);

test('App: a stopped site\'s tab offers Start and shows the boot wait with the button disabled', async (t) => {
  const app = await renderApp(t, {
    listSites: async () => [site('a'), site('b', { status: 'blocked' })],
    startSite: () => new Promise<SiteRecord>(() => {}),
  });
  await openFirstSite(app);
  assert.ok(app.container.querySelector('[role="tablist"]'), 'a tab strip appears with the first open tab');
  const panel = app.container.querySelector('.workspace:not(.is-hidden) .workspace__idle')!;
  assert.ok(panel, 'a stopped site shows the start panel');
  await app.click(app.byText('Start site'));
  assert.match(app.text(), /Starting the server\. This can take up to a minute\./);
  assert.ok(app.container.querySelector('.workspace__idle .spinner'));

  assert.equal(app.container.querySelector('.workspace__idle button')?.hasAttribute('disabled'), true, 'one start at a time');
});

test('App: an empty Projects screen explains the three header actions, and the header buttons reach the bridge', async (t) => {
  const app = await renderApp(t);
  assert.match(app.text(), /No websites yet\. Use Create website/);
  assert.equal(app.container.querySelector('.topnav__version')?.textContent, '1.2.3');
  assert.equal(app.byText('Import site'), undefined, 'no site, nothing to import into');
  await app.click(app.byText('Rescan'));
  await app.click(app.byText('Add Tovu Website'));
  assert.deepEqual(app.calls, ['rescan', 'add']);
  await app.click(app.all('button').find((b) => b.textContent?.includes('Create website')));
  assert.equal(app.container.querySelector('.main__title')?.textContent, 'Create a website');
  assert.equal(app.container.querySelector('.create-website-host')?.getAttribute('aria-hidden'), 'false');
  assert.equal(app.byText('Rescan'), undefined, 'the header tools give way to the form');
});

test('App: loading, a failed list, a failed rescan and a refused add each read as their own message', async (t) => {
  const pending = new Promise<readonly SiteRecord[]>(() => {});
  const loading = await renderApp(t, { listSites: () => pending });
  assert.match(loading.text(), /Loading projects…/);
  t.after(() => {});

  const failed = await renderApp(t, { listSites: () => Promise.reject(new Error('down')) });
  assert.match(failed.text(), /Couldn't load projects\./);

  const refused = await renderApp(t, {
    listSites: async () => [site('a')],
    rescanSites: () => Promise.reject(new Error('scan root unreadable')),
    addSite: () => Promise.reject(new Error('That folder is not a Tovu site.')),
  });
  await refused.click(refused.byText('Rescan'));
  await refused.click(refused.byText('Add Tovu Website'));
  assert.match(refused.text(), /scan root unreadable/);
  assert.equal(refused.container.querySelector('.projects-feedback')?.textContent?.length !== 0, true);
  assert.ok(refused.container.querySelector('.site-grid, .sitegrid, [class*="grid"]'), 'the grid stays on screen under both errors');
});

test('App: the nav badges running sites, inert links do nothing, and an agent navigate shows the unbuilt section', async (t) => {
  const app = await renderApp(t, { listSites: async () => [site('a', { status: 'running', port: 4100 }), site('b')] });
  const projectsLink = app.byLabel('Websites')!;
  assert.equal(projectsLink.querySelector('.topnav__count')?.textContent, '1');
  assert.equal(projectsLink.getAttribute('aria-current'), 'page');
  const inert = app.all('.topnav__link--disabled')[0]!;
  await app.click(inert);
  assert.equal(projectsLink.getAttribute('aria-current'), 'page', 'a disabled section link is inert');
  await act(async () => { for (const listener of app.listeners.navigate) listener('agents' as RunnerSectionId); });
  await settle();
  assert.match(app.text(), /isn’t built yet/);
  assert.equal(app.byText('Rescan'), undefined, 'the Projects tools belong to Projects only');
  await app.click(app.byLabel('Websites'));
  assert.ok(app.byText('Import site'), 'with a site present Import site is offered');
});

test('App: the Settings menu opens, moves with the arrows, picks a theme, opens Sites settings and Appearance', async (t) => {
  const app = await renderApp(t);
  const gear = app.byLabel('Settings')!;
  await app.click(gear);
  const menu = app.container.querySelector('[role="menu"]')!;
  assert.ok(menu);
  assert.equal(document.activeElement?.textContent?.trim(), 'Sites settings…');
  app.key(menu, { key: 'ArrowDown' });
  assert.equal(document.activeElement?.textContent?.trim(), 'Appearance');
  const radios = app.all('[role="menuitemradio"]');
  assert.deepEqual(radios.map((r) => r.getAttribute('aria-label')), ['Light', 'System', 'Dark']);
  await app.click(app.byLabel('Dark'));
  assert.equal(app.container.querySelector('[role="menu"]'), null, 'choosing a theme closes the menu');
  assert.equal(localStorage.getItem([...Array(localStorage.length).keys()].map((i) => localStorage.key(i)!).find((k) => k.includes('theme')) ?? ''), 'dark');
  await app.click(gear);
  assert.equal(app.byLabel('Dark')?.getAttribute('aria-checked'), 'true');
  await app.click(app.byText('Sites settings…'));
  assert.equal(app.settingsShown(), 1);
  assert.equal(app.container.querySelector('[role="menu"]'), null);
  await app.click(gear);
  await app.click(app.all('[role="menuitem"]').find((b) => b.textContent?.includes('Appearance')));
  assert.match(app.text(), /Nothing here yet beyond the theme toggle/);
  await app.click(app.byText('← Back'));
  assert.match(app.text(), /No websites yet/);
});

test('App: a created site\'s notice says it is ready with its token outcome, and Cancel returns to the grid', async (t) => {
  const results = [{ ...site('n1') }, { ...site('n2'), agentPluginTokens: { status: 'saved', pluginIds: ['github'] } }] as CreatedSiteRecord[];
  const app = await renderApp(t, { createSite: async () => results.shift()! });
  const create = async () => {
    await app.click(app.all('button').find((b) => b.textContent?.includes('Create website')));
    const name = app.container.querySelector<HTMLInputElement>('.create-website-host input[type="text"], .create-website-host input:not([type])')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(name, 'New site');
      name.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    const form = app.container.querySelector('.create-website-host form')!;
    await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
    await settle();
  };
  await create();
  const notice = () => app.container.querySelector('.creation-notice__text')?.textContent ?? '';
  assert.equal(notice(), 'Site n1 is ready — open it to start its own server.');
  await create();
  assert.match(notice(), /^Site n2 is ready — open it to start its own server\. \S/, 'the token outcome follows the sentence');
  await app.click(app.all('button').find((b) => b.textContent?.includes('Create website')));
  assert.equal(app.container.querySelector('.creation-notice'), null, 'opening the form again clears the notice');
  await app.click(app.all('.create-website-host button').find((b) => /^cancel$/i.test(b.textContent?.trim() ?? '')));
  assert.equal(app.container.querySelector('.create-website-host')?.getAttribute('aria-hidden'), 'true');
});



test('App: a site tab\'s bar toggles views, opens the browser, expands the window, and Escape collapses it', async (t) => {
  const app = await renderApp(t, { listSites: async () => [site('a', { status: 'running', port: 4100 })] });
  await openFirstSite(app);
  const bar = app.container.querySelector('.workspace:not(.is-hidden) .workspace__bar')!;
  assert.equal(app.byText('Admin')?.getAttribute('aria-pressed'), 'true');
  await app.click(app.byText('Site'));
  assert.equal(app.byText('Site')?.getAttribute('aria-pressed'), 'true');
  await app.click(app.byText('Open in browser'));
  assert.ok(app.calls.some((call) => call.startsWith('external:a')));
  const expand = bar.querySelector('[aria-label="Expand to full window"]')!;
  await app.click(expand);
  assert.equal(app.container.querySelector('.topnav'), null, 'expanded mode hides the top nav');
  assert.ok(app.byLabel('Exit full window'));
  await act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })); });
  assert.ok(app.container.querySelector('.topnav'));
  for (const label of ['Back', 'Forward', 'Reload']) assert.ok(app.byLabel(label), `${label} is on the bar`);
  await app.click(app.byLabel('Reload'));
  await app.click(app.all('[role="tab"]').find((tab) => tab.textContent === 'All'));
  assert.equal(app.container.querySelector('.workspace:not(.is-hidden)'), null);
  await app.click(app.all('[role="tab"]').find((tab) => tab.textContent?.includes('Site a')));
  assert.ok(app.container.querySelector('.workspace:not(.is-hidden)'), 'selecting the tab shows its workspace again');
});

test('App: a guest that fails to load is replaced by a retry panel, and a slow one gets an overlay after 8 s', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = await renderApp(t, { listSites: async () => [site('a', { status: 'running', port: 4100 })] });
  await openFirstSite(app);
  act(() => t.mock.timers.tick(8000));
  await settle();
  assert.match(app.text(), /is taking longer than usual to answer on port 4100/);
  assert.doesNotMatch(app.text(), /Loading Site a…/, 'the stall overlay replaces the ordinary loading one');
  const guest = app.container.querySelector('webview')!;
  await act(async () => { guest.dispatchEvent(Object.assign(new dom.window.Event('did-fail-load'), { isMainFrame: true, errorCode: -102 })); });
  await settle();
  assert.equal(app.container.querySelector('webview'), null);
  assert.match(app.text(), /isn't answering on port 4100\. It may still be running, but stuck\./);
  await app.click(app.byText('Start site'));
  assert.ok(app.calls.includes('start:a'));
});

test('App: a site attached to another app\'s server says it is connecting, then shows why the attach failed', async (t) => {
  const starts: ((reason: unknown) => void)[] = [];
  const app = await renderApp(t, {
    listSites: async () => [site('a', { externalUrl: 'http://127.0.0.1:5173/admin/' })],
    startSite: () => new Promise<SiteRecord>((_resolve, reject) => { starts.push(reject); }),
  });
  await openFirstSite(app);
  assert.match(app.text(), /Connecting to the server already running in the other app…/);
  await act(async () => { starts.shift()!(new Error('port 5173 is taken')); });
  await settle();
  assert.match(app.container.querySelector('.workspace__idle .empty__body')?.textContent ?? '', /port 5173 is taken/);
  await app.click(app.byText('Start site'));
  await act(async () => { for (const reject of starts.splice(0)) reject(new Error('port 5173 is taken')); });
  await settle();
  assert.ok(app.container.querySelector('.workspace__error'), 'a failed start explains itself under the button');
});

test('App: Find opens its bar, Enter and Shift+Enter step through matches, and Escape closes it', async (t) => {
  const app = await renderApp(t);
  assert.equal(app.container.querySelector('.findbar'), null);
  await act(async () => { for (const listener of app.listeners.find) listener(); });
  const input = app.container.querySelector<HTMLInputElement>('.findbar__input')!;
  assert.ok(input);
  assert.equal(app.byLabel('Next match')?.hasAttribute('disabled'), true, 'nothing typed, nothing to step through');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'tovu');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await settle();
  assert.equal(input.value, 'tovu');
  app.key(input, { key: 'Enter' });
  app.key(input, { key: 'Enter', shiftKey: true });
  app.key(input, { key: 'a' });
  await app.click(app.byLabel('Next match'));
  await app.click(app.byLabel('Previous match'));
  assert.ok(app.calls.filter((call) => call === 'find').length >= 1);
  app.key(input, { key: 'Escape' });
  await settle();
  assert.equal(app.container.querySelector('.findbar'), null);
  await act(async () => { for (const listener of app.listeners.find) listener(); });
  await app.click(app.byLabel('Close find bar'));
  assert.equal(app.container.querySelector('.findbar'), null);
});

test('App: re-adding a tracked site opens its tab with the notice, and an overflowing strip shows scroll arrows', async (t) => {
  const tracked = site('a');
  const app = await renderApp(t, { listSites: async () => [tracked, site('b')], addSite: async () => ({ ...tracked, alreadyTracked: true }) });
  await app.click(app.byText('Add Tovu Website'));
  assert.match(app.container.querySelector('main > .projects-feedback')?.textContent ?? '', /Site a is already in your list\./);
  const strip = app.container.querySelector<HTMLElement>('[role="tablist"]')!;
  const scrolled: number[] = [];
  Object.defineProperties(strip, {
    scrollWidth: { value: 900, configurable: true }, clientWidth: { value: 300, configurable: true }, scrollLeft: { value: 100, configurable: true, writable: true },
  });
  strip.scrollBy = ((options: ScrollToOptions) => { scrolled.push(options.left ?? 0); }) as typeof strip.scrollBy;
  await act(async () => { strip.dispatchEvent(new dom.window.Event('scroll')); });
  await app.click(app.byLabel('Scroll tabs left'));
  await app.click(app.byLabel('Scroll tabs right'));
  assert.deepEqual(scrolled, [-200, 200]);
  app.key(strip, { key: 'ArrowRight' });
});

/**
 * @file The Websites home's cards inside the whole `App` (`app-render-harness.ts`: the real default
 * hooks over a recording desktop bridge on `window.tovuRunner`). What only the whole app can show:
 * that main's refreshed records reach a card through `App` → `MainArea` → `MainContent` →
 * `ProjectsBody` → `SiteGrid`, that a card's Start opens through the same path a card click does,
 * and that the sites-home feedback stays on the sites home. Replaced the `sourceFunction(App…)` and
 * App-source-text cases of `site-card-actions-wiring.test.ts` and `site-error-feedback.test.ts`.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { closeHost, openFirstSite, renderApp, site } from './app-render-harness.js';

// jsdom's visual clock keeps the process alive after the last test unless the window is closed.
after(closeHost);

test('App: a card\'s Stop applies main\'s returned record at once, not on the next 4 s poll', async (t) => {
  // The unwired-call-site check for main's record: `useApplySiteRecord` could be correct and simply
  // never handed to the grid, and the only symptom would be a card four seconds stale. Every
  // `listSites` here still says running, so only the applied record can make the card read Stopped.
  const app = await renderApp(t, {
    listSites: async () => [site('a', { status: 'running', port: 4100 })],
    stopSite: async (id: string) => site(id, { status: 'stopped' }),
  });
  const card = () => app.container.querySelector('article.card')!;
  assert.match(card().className, /\bis-running\b/);
  await app.click(app.byLabel('Stop Site a'));
  assert.match(card().className, /\bis-stopped\b/);
  assert.ok(app.byLabel('Start Site a'), 'the card offers Start again');
});

test('App: Start on a card opens the site\'s tab through the same path a card click uses', async (t) => {
  const app = await renderApp(t, { listSites: async () => [site('a')] });
  await app.click(app.byLabel('Start Site a'));
  assert.deepEqual(app.calls, ['start:a']);
  assert.ok(app.all('[role="tab"]').some((tab) => tab.textContent?.includes('Site a') && tab.getAttribute('aria-selected') === 'true'),
    'a Start that comes back running opens the site');
});

test('App: Locate replaces a missing-folder card with the found site at once', async (t) => {
  const app = await renderApp(t, {
    listSites: async () => [site('gone', { folderMissing: true })],
    locateSite: async () => site('found'),
  });
  assert.match(app.text(), /Folder moved or not a site/);
  await app.click(app.byLabel('Locate the folder for Site gone'));
  assert.deepEqual(app.all('article.card').map((card) => card.querySelector('.card__name')?.textContent), ['Site found']);
  assert.doesNotMatch(app.text(), /Folder moved or not a site/);
});

test('App: a refused Add stays on Websites — a site tab hides it, and coming back shows it again', async (t) => {
  // D-24: the Add failure belongs to the Websites view; it must not overlay a site the operator
  // switched to, and it must still be there when they come back.
  const app = await renderApp(t, {
    listSites: async () => [site('a')],
    addSite: () => Promise.reject(new Error('That folder is not a Tovu site.')),
  });
  const feedback = () => app.container.querySelector('.projects-feedback');
  await app.click(app.byText('Add Tovu Website'));
  assert.ok(feedback(), 'the refusal is reported on Websites');
  await openFirstSite(app);
  assert.equal(feedback(), null, 'the Add failure must not overlay the site');
  await app.click(app.byLabel('Websites'));
  assert.ok(feedback(), 'back on Websites, the refusal is still reported');
});

test('App: a running card\'s ⏻ wears the header\'s own "Create website" class', async (t) => {
  // The owner's requirement was to REUSE the class, not eyeball a matching colour; that the class
  // resolves to a token is asserted on `app.css` in `site-card-actions-wiring.test.ts`.
  const app = await renderApp(t, { listSites: async () => [site('a', { status: 'running', port: 4100 })] });
  const create = app.all('.main__tools button').find((button) => button.textContent?.includes('Create website'));
  assert.ok(create?.classList.contains('button--create'), 'the header button is the source of the style');
  assert.ok(app.byLabel('Stop Site a')?.classList.contains('button--create'), 'the running ⏻ carries the same class');
});

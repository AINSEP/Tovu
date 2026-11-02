/**
 * @file The whole `App` under jsdom (`app-render-harness.ts`): a site tab's own "Start site" reaches
 * the shared site-record setter, so the tab mounts its guest from main's answer.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { closeHost, openFirstSite, renderApp, site } from './app-render-harness.js';

after(closeHost);

test('App: a tab\'s own Start site mounts the guest from main\'s answer, without waiting for the site list to agree', async (t) => {
  // The correct-primitive-unwired-call-site trap: `useSiteStart`'s onSiteUpdated parameter and
  // SiteWorkspace's own prop threading can both be perfectly correct while App's own render never
  // passes the real setter (`applySiteRecord`) in, leaving every tab waiting on the 4s poll exactly
  // as before. The site list here keeps answering "stopped", so only main's start answer can mount it.
  const app = await renderApp(t, { listSites: async () => [site('a')] });
  await openFirstSite(app);
  const workspace = () => app.container.querySelector('.workspace:not(.is-hidden)');
  assert.equal(workspace()?.querySelector('webview'), null);
  await app.click(app.byText('Start site'));
  assert.ok(app.calls.includes('start:a'));
  assert.equal(workspace()?.querySelector('webview')?.getAttribute('src'), 'http://127.0.0.1:4100/admin/');
});

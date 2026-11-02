/**
 * @file `MainContent` and the `ProjectsBody`, `NoWebsitesYet` and `NotBuilt` it renders, from their
 * own module: an unbuilt section, nothing behind the create form, the creation notice, and every
 * state of the Websites body — loading, a failed list, errors shown ALONGSIDE the grid, no
 * websites yet, and the grid itself.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { installBridge, mount, settle, site, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { MainContent } from './MainContent.js';
import type { CreatedSiteRecord, SiteRecord } from '../../contracts/project.js';
import type { RunnerSectionId } from '../../contracts/sections.js';

after(closeHost);

interface Props {
  activeId?: RunnerSectionId;
  isCreating?: boolean;
  lastCreated?: CreatedSiteRecord | null;
  projectsLoading?: boolean;
  loadError?: string | null;
  rescanError?: string | null;
  addError?: string | null;
  projects?: readonly SiteRecord[];
}

async function renderContent(t: TestContext, props: Props = {}) {
  installBridge({ t, bridge: { getSitePreview: async () => null } });
  const opened: string[] = [];
  const view = mount({ t, element: createElement(MainContent, {
    activeId: 'projects', isCreating: false, lastCreated: null, projectsLoading: false, loadError: null,
    rescanError: null, addError: null, projects: [], activeLabel: 'Marketplace', activeDescription: 'Find plugins for your sites.',
    onCreateWebsite: () => {}, onOpenProject: (id) => { opened.push(id); }, onDeleteProject: async () => {}, onSiteUpdated: () => {},
    ...props,
  }) });
  await settle();
  return { ...view, opened, grid: () => view.container.querySelector('article.card') };
}

test('NotBuilt: another section says it is not built yet, with its own description', async (t) => {
  const view = await renderContent(t, { activeId: 'marketplace', projects: [site('a')] });
  assert.equal(view.container.querySelector('.empty__title')?.textContent, 'Marketplace isn’t built yet');
  assert.equal(view.container.querySelector('.empty__body')?.textContent, 'Find plugins for your sites.');
  assert.equal(view.grid(), null);
});

test('MainContent: behind the create form it renders nothing, so the grid cannot show through', async (t) => {
  const view = await renderContent(t, { isCreating: true, projects: [site('a')] });
  assert.equal(view.container.innerHTML, '');
});

test('MainContent: a created site is announced as ready, with its token outcome when there is one', async (t) => {
  const plain = await renderContent(t, { lastCreated: site('n1') as CreatedSiteRecord });
  assert.equal(plain.container.querySelector('.creation-notice')?.getAttribute('role'), 'status');
  assert.equal(plain.container.querySelector('.creation-notice__text')?.textContent, 'Site n1 is ready — open it to start its own server.');
  const withTokens = await renderContent(t, {
    lastCreated: { ...site('n2'), agentPluginTokens: { status: 'saved', pluginIds: ['github'] } } as CreatedSiteRecord,
  });
  assert.equal(withTokens.container.querySelector('.creation-notice__text')?.textContent,
    'Site n2 is ready — open it to start its own server. Github will connect when this site first starts.');
  const none = await renderContent(t);
  assert.equal(none.container.querySelector('.creation-notice'), null);
});

test('ProjectsBody: loading, then a failed list, each replace the body with their own message', async (t) => {
  const loading = await renderContent(t, { projectsLoading: true, loadError: 'ignored while loading', projects: [site('a')] });
  assert.equal(loading.container.querySelector('.empty__body')?.textContent, 'Loading projects…');
  assert.equal(loading.grid(), null);
  const failed = await renderContent(t, { loadError: 'Couldn\'t load projects.', projects: [site('a')] });
  assert.equal(failed.container.querySelector('.empty__body')?.textContent, 'Couldn\'t load projects.');
  assert.equal(failed.grid(), null);
});

test('ProjectsBody: a failed rescan and a refused add are reported alongside the grid, never in place of it', async (t) => {
  const view = await renderContent(t, { rescanError: 'scan root unreadable', addError: 'That folder is not a Tovu site.', projects: [site('a')] });
  assert.equal(view.container.querySelector('p.empty__body')?.textContent, 'scan root unreadable');
  const feedback = view.container.querySelector('.projects-feedback');
  assert.equal(feedback?.textContent, 'That folder is not a Tovu site.');
  assert.equal(feedback?.getAttribute('role'), 'status');
  assert.ok(view.grid(), 'the websites already on screen stay');
  await view.click(view.grid());
  assert.deepEqual(view.opened, ['a'], 'and stay openable');
});

test('ProjectsBody: with no errors there is no error line', async (t) => {
  const view = await renderContent(t, { projects: [site('a')] });
  assert.equal(view.container.querySelector('p.empty__body'), null);
  assert.equal(view.container.querySelector('.projects-feedback'), null);
});

test('NoWebsitesYet: no websites names the three header actions instead of duplicating them', async (t) => {
  const view = await renderContent(t);
  const empty = view.container.querySelector('.empty__body');
  assert.equal(empty?.textContent, 'No websites yet. Use Create website to start a new one, Add Tovu Website to point at a site you already have, or Rescan to look for sites on this computer.');
  assert.deepEqual([...empty!.querySelectorAll('strong')].map((strong) => strong.textContent), ['Create website', 'Add Tovu Website', 'Rescan']);
  assert.equal(view.container.querySelector('button'), null, 'no second control for an action the header owns');
  assert.equal(view.grid(), null);
});

/**
 * @file `MainArea` (and its `AppearancePage`) rendered from its own module: the Appearance page
 * wins, nothing renders off the sites home, and the sites home is the header over the content,
 * with the section's label and description falling back when there is no section object.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { installBridge, mount, settle, useFakeFolders, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { MainArea } from './MainArea.js';
import { findSection, type RunnerSection, type RunnerSectionId } from '../../contracts/sections.js';

after(closeHost);

interface Props {
  appearanceOpen?: boolean;
  showSitesHome?: boolean;
  activeId?: RunnerSectionId;
  active?: RunnerSection | undefined;
}

async function renderArea(t: TestContext, props: Props = {}) {
  installBridge({ t, bridge: {} });
  let closed = 0;
  const view = mount({ t, element: createElement(MainArea, {
    appearanceOpen: false, onCloseAppearance: () => { closed++; }, showSitesHome: true, activeId: 'projects',
    isCreating: false, active: findSection('projects'), lastCreated: null, projectsLoading: false, loadError: null,
    projects: [], onCreateWebsite: () => {}, onOpenProject: () => {}, onDeleteProject: async () => {}, onSiteUpdated: () => {},
    onRescan: async () => {}, rescanning: false, rescanError: null, onAddSite: async () => {}, adding: false, addError: null,
    useFolders: useFakeFolders,
    ...props,
  }) });
  await settle();
  return { ...view, closed: () => closed, title: () => view.container.querySelector('.main__title')?.textContent };
}

test('AppearancePage: Appearance replaces the sites home, and Back closes it', async (t) => {
  const view = await renderArea(t, { appearanceOpen: true });
  assert.equal(view.container.querySelector('.empty__title')?.textContent, 'Appearance');
  assert.match(view.text(), /Nothing here yet beyond the theme toggle already in the Settings dropdown\./);
  assert.equal(view.title(), undefined, 'no sites header under Appearance');
  await view.click(view.byText('← Back'));
  assert.equal(view.closed(), 1);
});

test('MainArea: off the sites home (a site tab in view) it renders nothing', async (t) => {
  const view = await renderArea(t, { showSitesHome: false });
  assert.equal(view.container.innerHTML, '');
});

test('MainArea: the sites home is the section header over its content', async (t) => {
  const view = await renderArea(t);
  assert.equal(view.title(), 'Websites');
  assert.ok(view.byLabel('Rescan'), 'the Websites tools are in the header');
  assert.match(view.text(), /No websites yet\./);
});

test('MainArea: with no section object the title falls back to Runner and an unbuilt section to empty copy', async (t) => {
  const view = await renderArea(t, { activeId: 'marketplace', active: undefined });
  assert.equal(view.title(), 'Runner');
  assert.equal(view.container.querySelector('.empty__title')?.textContent, ' isn’t built yet');
  assert.equal(view.container.querySelector('.empty__body')?.textContent, '');
});

test('MainArea: an unbuilt section shows its own label and description', async (t) => {
  const marketplace = findSection('marketplace');
  const view = await renderArea(t, { activeId: 'marketplace', active: marketplace });
  assert.equal(view.title(), marketplace?.label);
  assert.equal(view.container.querySelector('.empty__title')?.textContent, `${marketplace?.label} isn’t built yet`);
  assert.equal(view.container.querySelector('.empty__body')?.textContent, marketplace?.agentDescription);
});

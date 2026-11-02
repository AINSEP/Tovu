/**
 * @file `MainHeader` rendered from its own module: the title, and the Websites tools — present only
 * on Websites outside the create form, in the owner's order, each reaching its own action.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { mount, recordTelemetry, useFakeFolders, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { MainHeader } from './MainHeader.js';
import type { RunnerSectionId } from '../../contracts/sections.js';

after(closeHost);

interface Props {
  activeId?: RunnerSectionId;
  activeLabel?: string;
  isCreating?: boolean;
  rescanning?: boolean;
  adding?: boolean;
  withImport?: boolean;
}

function renderHeader(t: TestContext, { withImport = true, ...props }: Props = {}) {
  const calls: string[] = [];
  const view = mount({ t, element: createElement(MainHeader, {
    activeId: 'projects', isCreating: false, activeLabel: 'Websites', rescanning: false, adding: false,
    onCreateWebsite: () => { calls.push('create'); },
    onRescan: async () => { calls.push('rescan'); },
    onAddSite: async () => { calls.push('add'); },
    onImportSite: withImport ? () => { calls.push('import'); } : undefined,
    useFolders: useFakeFolders,
    ...props,
  }) });
  return { ...view, calls, title: () => view.container.querySelector('.main__title')?.textContent, tools: () => view.container.querySelector('.main__tools') };
}

test('MainHeader: on Websites the title is the section label and every tool reaches its own action', async (t) => {
  const payloads = recordTelemetry({ t });
  const view = renderHeader(t);
  assert.equal(view.title(), 'Websites');
  await view.click(view.byLabel('Rescan'));
  await view.click(view.byLabel('Import site'));
  await view.click(view.byText('Add Tovu Website'));
  await view.click(view.all('button').find((button) => button.textContent?.includes('Create website')));
  assert.deepEqual(view.calls, ['rescan', 'import', 'add', 'create']);
  assert.deepEqual(payloads, [{ kind: 'action', id: 'add_existing_website' }]);
});

test('MainHeader: manage tools, a gap, then the ways to get a site in, Create last', (t) => {
  const view = renderHeader(t);
  const order = [...view.tools()!.children].map((child) =>
    child.getAttribute('aria-label') ?? (child.classList.contains('main__tools-gap') ? 'gap' : child.textContent?.trim()));
  const at = (name: string) => order.indexOf(name);
  assert.ok(at('Rescan') < at('Shared keys'), 'Rescan leads the manage group');
  assert.ok(at('Shared keys') < at('gap') && at('gap') < at('Import site'), 'a gap separates the groups');
  assert.ok(at('Import site') < at('Add Tovu Website') && at('Add Tovu Website') < order.findIndex((label) => label?.includes('Create website')));
  assert.ok(view.byText('Add Tovu Website')?.classList.contains('button--contrast'), 'Add stays the black contrast button');
});

test('MainHeader: with no site to import into there is no Import button', (t) => {
  const view = renderHeader(t, { withImport: false });
  assert.equal(view.byLabel('Import site'), null);
  assert.ok(view.byLabel('Rescan'), 'the rest of the tools stay');
});

test('MainHeader: a running rescan and a running add each disable their own button', (t) => {
  const view = renderHeader(t, { rescanning: true, adding: true });
  const rescan = view.byLabel('Scanning…');
  assert.ok(rescan);
  assert.equal(rescan.getAttribute('aria-busy'), 'true');
  assert.equal(rescan.hasAttribute('disabled'), true);
  const add = view.byText('Adding…');
  assert.equal(add?.hasAttribute('disabled'), true);
  const idle = renderHeader(t);
  assert.equal(idle.byLabel('Rescan')?.getAttribute('aria-busy'), 'false');
  assert.equal(idle.byText('Add Tovu Website')?.hasAttribute('disabled'), false);
});

test('MainHeader: the create form swaps the title and takes the tools away', (t) => {
  const view = renderHeader(t, { isCreating: true });
  assert.equal(view.title(), 'Create a website');
  assert.equal(view.tools(), null);
});

test('MainHeader: another section keeps its own title and has no Websites tools', (t) => {
  const view = renderHeader(t, { activeId: 'marketplace', activeLabel: 'Marketplace' });
  assert.equal(view.title(), 'Marketplace');
  assert.equal(view.tools(), null);
});

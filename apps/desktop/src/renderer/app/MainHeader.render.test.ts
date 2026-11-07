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
  isImporting?: boolean;
  rescanning?: boolean;
}

function renderHeader(t: TestContext, props: Props = {}) {
  const calls: string[] = [];
  const view = mount({ t, element: createElement(MainHeader, {
    activeId: 'projects', isCreating: false, activeLabel: 'Websites', rescanning: false,
    onCreateWebsite: () => { calls.push('create'); },
    onRescan: async () => { calls.push('rescan'); },
    onImport: () => { calls.push('import'); },
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
  await view.click(view.byText('Import'));
  await view.click(view.all('button').find((button) => button.textContent?.includes('Create website')));
  assert.deepEqual(view.calls, ['rescan', 'import', 'create']);
  assert.deepEqual(payloads, [{ kind: 'action', id: 'import_website' }]);
});

test('MainHeader: one Import button replaces the old icon and Add Tovu Website, between the manage group and Create', (t) => {
  const view = renderHeader(t);
  const order = [...view.tools()!.children].map((child) =>
    child.getAttribute('aria-label') ?? (child.classList.contains('main__tools-gap') ? 'gap' : (child.textContent ?? '').trim()));
  const at = (name: string) => order.indexOf(name);
  assert.ok(at('Rescan') < at('Shared keys'), 'Rescan leads the manage group');
  assert.ok(at('Shared keys') < at('gap') && at('gap') < at('Import'), 'a gap separates the groups');
  assert.ok(at('Import') < order.findIndex((label) => label?.includes('Create website')));
  assert.equal(view.byLabel('Import site'), null, 'the down-arrow icon is gone');
  assert.ok(!view.byText('Add Tovu Website'), 'and so is Add Tovu Website');
  assert.ok(view.byText('Import')?.classList.contains('button--contrast'), 'Import stays the black contrast button');
});

test('MainHeader: Import is there with no site at all, and a running rescan disables only Rescan', (t) => {
  const view = renderHeader(t, { rescanning: true });
  const rescan = view.byLabel('Scanning…');
  assert.ok(rescan);
  assert.equal(rescan.getAttribute('aria-busy'), 'true');
  assert.equal(rescan.hasAttribute('disabled'), true);
  assert.equal(view.byText('Import')?.hasAttribute('disabled'), false);
  assert.equal(renderHeader(t).byLabel('Rescan')?.getAttribute('aria-busy'), 'false');
});

test('MainHeader: the import page swaps the title and takes the tools away', (t) => {
  const view = renderHeader(t, { isImporting: true });
  assert.equal(view.title(), 'Import a website');
  assert.equal(view.tools(), null);
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

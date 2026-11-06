/**
 * @file The Import page rendered from its own module: the two sources, grouped under their own
 * headings with explanations as tooltips, an address button that waits for an address, and an error
 * with Copy details that leaves what was typed in place.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { mount, type TestContext } from './app/component-harness.js';
import { closeHost } from './app-render-harness.js';
import { ImportWebsite, type ImportWebsiteProps } from './ImportWebsite.js';

after(closeHost);

function render(t: TestContext, props: Partial<ImportWebsiteProps> = {}) {
  const calls: string[] = [];
  const view = mount({ t, element: createElement(ImportWebsite, {
    shown: true,
    onBack: () => { calls.push('back'); },
    adding: false,
    onChooseFolder: async () => { calls.push('folder'); },
    onDropFolder: async (folder: string) => { calls.push(`drop:${folder}`); },
    onImportArchive: async (source) => { calls.push(`archive:${JSON.stringify(source)}`); },
    onRefuse: (message: string) => { calls.push(`refuse:${message}`); },
    address: '',
    onAddressChange: (address: string) => { calls.push(`address:${address}`); },
    importing: false,
    onImportAddress: async () => { calls.push('import'); },
    failure: null,
    addError: null,
    addDetails: null,
    ...props,
  }) });
  return { ...view, calls };
}

test('ImportWebsite: two sources under their own headings, explained by tooltips and not loose paragraphs', (t) => {
  const view = render(t);
  assert.deepEqual(view.all('h3').map((h) => h.textContent), ['Drop a folder or .tovu.zip file', 'A share link or live website']);
  assert.equal(view.container.querySelectorAll('.info-tip').length, 3, 'one beside the title, one per source');
  assert.equal(view.container.querySelectorAll('p:not(.onboarding__eyebrow)').length, 0, 'no loose explanation text');
  assert.ok(view.byText('Choose folder…'));
  assert.equal(view.byText('Import website')?.hasAttribute('disabled'), true, 'nothing to import until an address is typed');
});

test('ImportWebsite: each button reaches its own source, and Cancel goes back', async (t) => {
  const view = render(t, { address: 'example.com' });
  await view.click(view.byText('Choose folder…'));
  await view.click(view.byText('Import website'));
  await view.click(view.byText('Cancel'));
  assert.deepEqual(view.calls, ['folder', 'import', 'back']);
  await view.type(view.container.querySelector('input')!, 'x.org');
  assert.equal(view.calls.at(-1), 'address:x.org');
});

test('ImportWebsite: working disables both sources and says so on the button that was pressed', (t) => {
  const importing = render(t, { address: 'example.com', importing: true });
  assert.equal(importing.byText('Importing…')?.hasAttribute('disabled'), true);
  assert.equal(importing.byText('Choose folder…')?.hasAttribute('disabled'), true);
  assert.equal(importing.container.querySelector('input')?.hasAttribute('disabled'), true);
  const adding = render(t, { adding: true });
  assert.equal(adding.byText('Adding…')?.hasAttribute('disabled'), true);
});

test('ImportWebsite: a failure shows its words and a Copy details button; the address stays in the field', (t) => {
  const view = render(t, { address: 'example.com', failure: { message: "Couldn't create a website for that address.", details: 'EACCES' } });
  assert.equal(view.container.querySelector('[role="alert"]')?.textContent, "Couldn't create a website for that address.");
  assert.ok(view.byText('Copy details'));
  assert.equal(view.container.querySelector('input')?.value, 'example.com');
  const folder = render(t, { addError: 'That folder is not a Tovu site.', addDetails: '' });
  assert.ok(folder.container.querySelector('[role="alert"]'));
  assert.ok(!folder.byText('Copy details'), 'no details, no button');
});

test('ImportWebsite: not shown renders nothing', (t) => {
  assert.equal(render(t, { shown: false }).container.textContent, '');
});

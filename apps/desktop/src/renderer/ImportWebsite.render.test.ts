/**
 * @file The Import page rendered from its own module: the two sources, grouped under their own
 * headings with explanations as tooltips, an address button that waits for an address, and an error
 * with Copy details that leaves what was typed in place.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { act, dom, mount, type TestContext } from './app/component-harness.js';
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
    archiveRun: 'none',
    onCancelImport: () => { calls.push('cancel-import'); },
    onPageOpen: () => { calls.push('page-open'); return () => { calls.push('page-closed'); }; },
    onImportAddress: async () => { calls.push('import'); },
    failure: null,
    addError: null,
    addDetails: null,
    ...props,
  }) });
  return { ...view, calls };
}

/** The address field, found by its label: the drop zone's own file input now comes first on the page. */
function addressInput(view: ReturnType<typeof render>): HTMLInputElement | null {
  return view.all('label').find((label) => label.textContent?.includes('Website address'))?.querySelector('input') ?? null;
}

test('ImportWebsite: files first, then the web address, explained by tooltips; no back link, label or second title', (t) => {
  const view = render(t);
  assert.deepEqual(view.all('h3').map((h) => h.textContent), ['From your computer', 'From the web']);
  assert.equal(view.all('h2').length, 0, 'the header carries the one title');
  assert.deepEqual(view.all('p').map((p) => p.textContent), ['From a folder, a .tovu.zip, or a web address.'], 'the subtitle is the only sentence');
  assert.equal(view.container.querySelectorAll('.info-tip').length, 3, 'one beside the subtitle, one per source');
  assert.ok(!view.byText('← All websites') && !view.byText('Existing website') && !view.byText('Where is it now?'));
  assert.equal(view.byText('Import as a new site')?.hasAttribute('disabled'), true, 'nothing to import until an address is typed');
});

test('ImportWebsite: the shared drop zone holds both Choose buttons, and its own picker routes a .zip by its real path', async (t) => {
  const view = render(t);
  const zone = view.container.querySelector('.import-zone')!;
  assert.ok(zone.querySelector('.jini-file-dropzone__zone'), 'the @jini-ai/ui FileDropzone');
  assert.deepEqual([...zone.querySelectorAll('.import-actions button')].map((b) => b.textContent), ['Choose folder…', 'Choose file…']);
  await view.click(view.byText('Choose file…'));
  assert.equal(view.calls.at(-1), 'archive:{"pick":true}');
  const input = zone.querySelector<HTMLInputElement>('input[type="file"]')!;
  const picked = new File(['x'], 'a.png');
  Object.defineProperty(input, 'files', { value: [picked], configurable: true });
  // jsdom's own Event: Node's global one is from another realm, and jsdom's dispatchEvent refuses it.
  await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  assert.match(view.calls.at(-1)!, /^refuse:.*website folder or a \.tovu\.zip/);
});

test('ImportWebsite: each button reaches its own source, and Cancel goes back', async (t) => {
  const view = render(t, { address: 'example.com' });
  await view.click(view.byText('Choose folder…'));
  await view.click(view.byText('Import as a new site'));
  await view.click(view.byText('Cancel'));
  assert.deepEqual(view.calls, ['page-open', 'folder', 'import', 'back']);
  await view.type(addressInput(view)!, 'x.org');
  assert.equal(view.calls.at(-1), 'address:x.org');
});

test('ImportWebsite: working disables both sources and says so on the button that was pressed', (t) => {
  const importing = render(t, { address: 'example.com', importing: true });
  assert.equal(importing.byText('Importing…')?.hasAttribute('disabled'), true);
  assert.equal(importing.byText('Choose folder…')?.hasAttribute('disabled'), true);
  assert.equal(addressInput(importing)?.hasAttribute('disabled'), true);
  const adding = render(t, { adding: true });
  assert.equal(adding.byText('Adding…')?.hasAttribute('disabled'), true);
});

test('ImportWebsite: a failure shows its words and a Copy details button; the address stays in the field', (t) => {
  const view = render(t, { address: 'example.com', failure: { message: "Couldn't create a website for that address.", details: 'EACCES' } });
  assert.equal(view.container.querySelector('[role="alert"]')?.textContent, "Couldn't create a website for that address.");
  assert.ok(view.byText('Copy details'));
  assert.equal(addressInput(view)?.value, 'example.com');
  const folder = render(t, { addError: 'That folder is not a Tovu site.', addDetails: '' });
  assert.ok(folder.container.querySelector('[role="alert"]'));
  assert.ok(!folder.byText('Copy details'), 'no details, no button');
});

test('ImportWebsite: not shown renders nothing', (t) => {
  assert.equal(render(t, { shown: false }).container.textContent, '');
});

test('ImportWebsite: while an archive imports, Cancel stops the import instead of hiding the page', async (t) => {
  const view = render(t, { importing: true, archiveRun: 'running' });
  await view.click(view.byText('Cancel'));
  assert.equal(view.calls.at(-1), 'cancel-import');
  assert.equal(view.calls.includes('back'), false);
});

test('ImportWebsite: once asked to stop, Cancel says so and cannot be pressed twice', (t) => {
  const view = render(t, { importing: true, archiveRun: 'cancelling' });
  assert.equal(view.byText('Cancelling…')?.hasAttribute('disabled'), true);
});

test('ImportWebsite: Cancel is disabled while a live address makes its site, which cannot be stopped', (t) => {
  const view = render(t, { importing: true, archiveRun: 'none', address: 'example.com' });
  assert.equal(view.byText('Cancel')?.hasAttribute('disabled'), true);
});

test('ImportWebsite: tells its owner when the page opens, and not while it is hidden', (t) => {
  const hidden = render(t, { shown: false });
  assert.deepEqual(hidden.calls, []);
  assert.equal(render(t).calls[0], 'page-open');
});

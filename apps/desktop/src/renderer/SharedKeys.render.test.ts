import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SharedKeys } from './SharedKeys.js';
import { installDom, settle } from './dom-hook-harness.js';
import type { OwnerStoreBridge, OwnerStoreEntry, OwnerStoreInput } from '../contracts/owner-store.js';

// The direct tsx test command uses classic JSX; Vite supplies the automatic runtime in production.
Object.assign(globalThis, { React });

const entry: OwnerStoreEntry = { id: 'saved-a', kind: 'vendor', label: 'Deployment key', provider: 'hosting',
  configured: true, revision: 7, isDefault: false, worksFor: ['hosting'] };

/** Native dialog capability is supplied by Electron in production; jsdom receives a DOM fake. */
function mount(t: { after: (run: () => void) => void }, bridge: OwnerStoreBridge) {
  const dom = installDom();
  const priorFormData = globalThis.FormData;
  const prototype = dom.HTMLDialogElement.prototype;
  const showModal = prototype.showModal;
  const close = prototype.close;
  prototype.showModal = function () { this.open = true; };
  prototype.close = function () { this.open = false; };
  globalThis.FormData = dom.FormData;
  const host = dom.document.body.appendChild(dom.document.createElement('div'));
  const root = createRoot(host);
  act(() => root.render(createElement(SharedKeys, { bridge, onClose: () => {} })));
  t.after(() => {
    act(() => root.unmount()); host.remove();
    prototype.showModal = showModal; prototype.close = close; globalThis.FormData = priorFormData;
  });
  return { host, dom };
}

test('new vendor save is unattached, clears its password input and never renders the secret', async t => {
  let saved: OwnerStoreInput['put'] | undefined;
  let inventory: OwnerStoreEntry[] = [];
  const bridge = {
    list: async () => ({ version: 1, ok: true, action: 'list', data: { entries: inventory } }),
    put: async (input: OwnerStoreInput['put']) => { saved = input; inventory = [entry]; return { version: 1, ok: true, action: 'put', data: { entry } }; },
    import: async () => assert.fail('saving must never import'),
  } as unknown as OwnerStoreBridge;
  const { host, dom } = mount(t, bridge); await settle();
  const form = host.querySelector<HTMLFormElement>('form')!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  field('label').value = 'Deployment key'; field('provider').value = 'hosting';
  const secret = ['fixture', 'private', String(123)].join('-'); field('token').value = secret;
  act(() => { form.dispatchEvent(new dom.Event('submit', { bubbles: true, cancelable: true })); });
  assert.equal(field('token').value, ''); await settle();
  assert.deepEqual(saved, { store: 'project', entry: { kind: 'vendor', label: 'Deployment key', provider: 'hosting', expectedRevision: null,
    meta: { credentialType: 'vendor', worksFor: ['hosting'] }, payload: { vendorId: 'hosting', token: secret } } });
  assert.equal(host.innerHTML.includes(secret), false);
  assert.ok(host.textContent!.includes('Saved — site usage unavailable'));
  assert.equal(host.textContent!.includes('used by every site'), false);
  // Before: the third fieldset (restore) stayed enabled; the one import fieldset replaces export/restore.
  const fieldsets = host.querySelectorAll<HTMLFieldSetElement>('fieldset');
  assert.equal(fieldsets.length, 2);
  assert.equal(fieldsets[1]!.disabled, false, 'an import is offered whatever the project holds; the CLI plans it');
});

// Before: 'legacy restore with project keys delegates the empty-owner-store check to the CLI'. Restore
// is gone; the backup import sends only its source and passphrase, and refusals use fixed copy.
test('backup import sends only the source and passphrase, clears it, and shows fixed feedback', async t => {
  const calls: unknown[] = [];
  let refuse = false;
  const bridge = {
    list: async (input: unknown) => {
      assert.deepEqual(input, { store: 'project' });
      return { version: 1, ok: true, action: 'list', data: { entries: [entry] } };
    },
    import: async (input: OwnerStoreInput['import'], options: unknown) => {
      calls.push({ input, options });
      return refuse
        ? { version: 1, ok: false, action: 'import', error: { code: 'invalid-backup', message: (input as { passphrase: string }).passphrase } }
        : { version: 1, ok: true, action: 'import', data: { applied: true, pending: [],
          items: [{ id: 'k', label: 'Mail', kind: 'vendor', provider: 'resend', status: 'imported' }] } };
    },
  } as unknown as OwnerStoreBridge;
  const { host, dom } = mount(t, bridge); await settle();
  const form = [...host.querySelectorAll<HTMLFormElement>('form')].find(form =>
    form.querySelector('h3')?.textContent === 'Import older shared keys')!;
  const passphrase = ['fixture', 'import', String(246)].join('-');
  for (const refused of [false, true]) {
    refuse = refused;
    assert.equal(form.querySelector('fieldset')!.disabled, false);
    (form.elements.namedItem('passphrase') as HTMLInputElement).value = passphrase;
    act(() => { form.dispatchEvent(new dom.Event('submit', { bubbles: true, cancelable: true })); });
    assert.equal((form.elements.namedItem('passphrase') as HTMLInputElement).value, '');
    await settle();
    assert.equal(host.innerHTML.includes(passphrase), false);
    if (!refused) assert.equal(host.querySelector('[role="status"]')!.textContent, 'Imported 1 key.');
  }
  const sent = { input: { source: 'backup', passphrase }, options: {} };
  assert.deepEqual(calls, [sent, sent]);
  assert.equal(host.querySelector('[role="status"]')!.textContent, '');
  assert.equal(host.querySelector('[role="alert"]')!.textContent, 'Check the encrypted backup and passphrase.');
});

// Before: 'replace carries the displayed revision and export/restore send only passphrases'.
test('replace carries the displayed revision; importing from this computer sends only the source', async t => {
  const calls: unknown[] = [];
  let inventory = [entry];
  const bridge = {
    list: async () => ({ version: 1, ok: true, action: 'list', data: { entries: inventory } }),
    put: async (input: OwnerStoreInput['put']) => { calls.push(input); return { version: 1, ok: true, action: 'put', data: { entry } }; },
    import: async (input: OwnerStoreInput['import']) => { calls.push(input); return { version: 1, ok: true, action: 'import', data: { applied: false, items: [], pending: [] } }; },
  } as unknown as OwnerStoreBridge;
  const { host, dom } = mount(t, bridge); await settle();
  const replace = [...host.querySelectorAll('button')].find(button => button.textContent === 'Replace key')!;
  act(() => replace.click());
  const form = host.querySelector<HTMLFormElement>('article form')!;
  (form.elements.namedItem('token') as HTMLInputElement).value = ['replacement', String(456)].join('-');
  act(() => { form.dispatchEvent(new dom.Event('submit', { bubbles: true, cancelable: true })); }); await settle();
  assert.equal((calls[0] as OwnerStoreInput['put']).entry.id, entry.id);
  assert.equal((calls[0] as OwnerStoreInput['put']).entry.expectedRevision, 7);
  inventory = [];
  act(() => [...host.querySelectorAll('button')].find(button => button.textContent === 'Refresh')!.click()); await settle();
  act(() => [...host.querySelectorAll('button')].find(button => button.textContent === 'Import from this computer')!.click()); await settle();
  assert.deepEqual(calls.slice(1), [{ source: 'owner-store' }]);
  assert.equal(host.querySelector('[role="status"]')!.textContent, 'Nothing new to import.');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SharedKeys } from './SharedKeys.js';
import { installDom, settle } from './dom-hook-harness.js';
import type { OwnerStoreBridge, OwnerStoreEntry, OwnerStoreInput } from '../contracts/owner-store.js';

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
    list: async () => ({ version: 1, ok: true, action: 'list', data: { entries: inventory, grants: [] } }),
    put: async (input: OwnerStoreInput['put']) => { saved = input; inventory = [entry]; return { version: 1, ok: true, action: 'put', data: { entry } }; },
    grant: async () => assert.fail('saving must never attach'),
    sync: async () => assert.fail('saving must never copy from the renderer'),
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
  const restore = host.querySelectorAll<HTMLFieldSetElement>('fieldset')[2]!;
  assert.equal(restore.disabled, true, 'restore requires an empty store');
});

test('replace carries the displayed revision and export/restore send only passphrases', async t => {
  const calls: unknown[] = [];
  let inventory = [entry];
  const bridge = {
    list: async () => ({ version: 1, ok: true, action: 'list', data: { entries: inventory, grants: [{ entry_id: entry.id, consumer_id: '/legacy-copy', created_at: '' }] } }),
    put: async (input: OwnerStoreInput['put']) => { calls.push(input); return { version: 1, ok: true, action: 'put', data: { entry } }; },
    export: async (input: { passphrase: string }) => { calls.push(input); return { version: 1, ok: true, action: 'export', data: { exported: true } }; },
    restore: async (input: { passphrase: string }) => { calls.push(input); return { version: 1, ok: false, action: 'restore', error: { code: 'invalid-backup', message: input.passphrase } }; },
  } as unknown as OwnerStoreBridge;
  const { host, dom } = mount(t, bridge); await settle();
  const replace = [...host.querySelectorAll('button')].find(button => button.textContent === 'Replace key')!;
  act(() => replace.click());
  const form = host.querySelector<HTMLFormElement>('article form')!;
  (form.elements.namedItem('token') as HTMLInputElement).value = ['replacement', String(456)].join('-');
  act(() => { form.dispatchEvent(new dom.Event('submit', { bubbles: true, cancelable: true })); }); await settle();
  assert.equal((calls[0] as OwnerStoreInput['put']).entry.id, entry.id);
  assert.equal((calls[0] as OwnerStoreInput['put']).entry.expectedRevision, 7);
  assert.equal(host.textContent!.includes('/legacy-copy'), false, 'legacy copy destinations are not attachment evidence');
  inventory = [];
  act(() => [...host.querySelectorAll('button')].find(button => button.textContent === 'Refresh')!.click()); await settle();
  const passphrase = ['fixture', 'backup', String(789)].join('-');
  for (const backup of [...host.querySelectorAll<HTMLFormElement>('form')].slice(1)) {
    (backup.elements.namedItem('passphrase') as HTMLInputElement).value = passphrase;
    act(() => { backup.dispatchEvent(new dom.Event('submit', { bubbles: true, cancelable: true })); }); await settle();
    assert.equal((backup.elements.namedItem('passphrase') as HTMLInputElement).value, '');
  }
  assert.deepEqual(calls.slice(1), [{ passphrase }, { passphrase }]);
  assert.equal(host.querySelector('[role="alert"]')!.textContent, 'Check the encrypted backup and passphrase.');
  assert.equal(host.innerHTML.includes(passphrase), false);
});

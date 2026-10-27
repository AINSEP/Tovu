import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { renderHook, settle } from './dom-hook-harness.js';
import { useSharedKeys } from './SharedKeys.hooks.js';
import type { LegacyImportPending, OwnerStoreBridge, OwnerStoreEntry, OwnerStoreReply } from '../contracts/owner-store.js';

const entry: OwnerStoreEntry = { id: 'entry-a', kind: 'vendor', label: 'Deployment key', provider: 'hosting',
  revision: 3, configured: true, isDefault: false, worksFor: ['hosting'] };

/** Only metadata listing is needed: a hook cannot silently attach/copy a key through this fake. */
function fixture() {
  let reads = 0;
  let list = async (): Promise<OwnerStoreReply<'list'>> => ({ version: 1, ok: true, action: 'list', data: { entries: [entry] } });
  const bridge = { list: async (input) => { assert.deepEqual(input, { store: 'project' }); reads++; return list(); } } as OwnerStoreBridge;
  return { bridge, reads: () => reads, setList: (next: typeof list) => { list = next; } };
}

// Before: 'loads metadata and preserves committed save feedback when a site-copy row fails'. Saves
// no longer copy into sites, so the reply has no sync rows; import feedback is what counts now.
test('loads metadata; import feedback counts imported keys and mentions kept site copies', async t => {
  const f = fixture();
  const hook = renderHook(t, () => useSharedKeys({ bridge: f.bridge }));
  await settle();
  assert.deepEqual(hook.current().entries, [entry]);
  assert.equal(hook.current().loaded, true);
  const imported = (status: 'imported' | 'already-imported', pending: LegacyImportPending[] = [], applied = true): OwnerStoreReply<'import'> =>
    ({ version: 1, ok: true, action: 'import', data: { applied, pending, items: [{ id: entry.id, label: entry.label, kind: 'vendor', provider: 'hosting', status }] } });
  for (const [reply, message] of [
    [imported('imported', [{ entryId: entry.id, site: '/sites/blog', reason: 'keeps-copy' }]), 'Imported 1 key. Sites that had copies keep them.'],
    [imported('imported'), 'Imported 1 key.'],
    [imported('already-imported', [], false), 'Nothing new to import.'],
    [{ version: 1, ok: true, action: 'import', data: { applied: false, items: [], pending: [] } }, 'Nothing new to import.'],
  ] satisfies Array<[OwnerStoreReply<'import'>, string]>) {
    await act(async () => { await hook.current().run({ action: async () => reply }); });
    assert.equal(hook.current().message, message);
  }
  await act(async () => { await hook.current().run({ action: async () => ({ version: 1, ok: false, action: 'import', error: { code: 'cancelled', message: 'unused' } }) }); });
  assert.equal(hook.current().error, 'The import was cancelled.');
  assert.equal(f.reads(), 5, 'a cancelled import does not refresh; every completed one does');
});

test('same-turn double submit performs one action and one refresh', async t => {
  const f = fixture();
  const hook = renderHook(t, () => useSharedKeys({ bridge: f.bridge })); await settle();
  let finish!: (reply: OwnerStoreReply<'put'>) => void;
  let calls = 0;
  const action = () => { calls++; return new Promise<OwnerStoreReply<'put'>>(resolve => { finish = resolve; }); };
  act(() => { void hook.current().run({ action }); void hook.current().run({ action }); });
  assert.equal(calls, 1); assert.equal(hook.current().busy, true);
  await act(async () => { finish({ version: 1, ok: true, action: 'put', data: { entry } }); }); await settle();
  assert.equal(f.reads(), 2);
  assert.equal(hook.current().busy, false);
  assert.equal(hook.current().message, 'Saved to your project. Site usage is unavailable in this version.');
});

test('opaque failures never expose submitted values and stale revisions are withdrawn', async t => {
  const f = fixture();
  const hook = renderHook(t, () => useSharedKeys({ bridge: f.bridge })); await settle();
  const secret = ['fixture', 'private', String(123)].join('-');
  await act(async () => { await hook.current().run({ action: async () => { throw new Error(secret); } }); });
  assert.equal(hook.current().error, 'The shared-key operation failed. Refresh and try again.');
  assert.equal(JSON.stringify(hook.current()).includes(secret), false);
  assert.deepEqual(hook.current().entries, []); assert.equal(hook.current().loaded, false);
  await act(async () => { await hook.current().run({ action: async () => ({ version: 1, ok: false, action: 'put',
    error: { code: 'conflict', message: secret } }) }); });
  assert.equal(hook.current().error, 'This key changed. Refresh before replacing it.');
});

test('failed inventory reads clear old entries; unmounted completions do not read again', async t => {
  const f = fixture();
  const hook = renderHook(t, () => useSharedKeys({ bridge: f.bridge })); await settle();
  f.setList(async () => ({ version: 1, ok: false, action: 'list', error: { code: 'recovery-required', message: 'unused' } }));
  await act(async () => { await hook.current().run(); });
  assert.equal(hook.current().error, 'The older key store needs its original owner.key. Restore it, or import a backup.');
  assert.deepEqual(hook.current().entries, []);
  let finish!: (reply: OwnerStoreReply<'import'>) => void;
  act(() => { void hook.current().run({ action: () => new Promise(resolve => { finish = resolve; }) }); });
  hook.unmount();
  finish({ version: 1, ok: true, action: 'import', data: { applied: false, items: [], pending: [] } }); await settle();
  assert.equal(f.reads(), 2);
});

test('stale preload offers an unavailable state without any operation', async t => {
  const hook = renderHook(t, () => useSharedKeys()); await settle();
  assert.equal(hook.current().available, false); assert.equal(hook.current().busy, false);
});

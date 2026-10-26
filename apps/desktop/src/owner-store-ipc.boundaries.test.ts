/** F9 (Stryker L15 owner-store-ipc 78 %, 10 no-cov): the per-action field allow-list one action at a
 * time, the 64 KiB cap at 65,536/65,537 bytes, the exact CLI call each action dispatches (status, list,
 * delete, sync, revoke had no coverage), required-string guards and the fixed failure replies. */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createOwnerStoreController } from './owner-store-ipc.ts';
import { ownerStoreFailure } from './owner-store-cli.ts';
import type { OwnerStoreAction, OwnerStoreReply } from './contracts/owner-store.ts';

type Ports = Parameters<typeof createOwnerStoreController>[0];
const site = { id: 'tracked-a', siteDir: path.join(tmpdir(), 'canonical-a') };
const backup = path.join(tmpdir(), 'shared.tovu-owner-backup');

function fixture(options: { run?: Ports['run']; listSites?: Ports['listSites'] } = {}) {
  const calls: Parameters<Ports['run']>[0][] = [];
  let picks = 0;
  const run: Ports['run'] = async input => {
    calls.push(input);
    if (options.run) return options.run(input);
    const data = { list: { entries: [], grants: [] }, put: { entry: { id: 'k' } }, grant: { granted: true }, revoke: { revoked: true },
      sync: { consumerId: input.siteDir, results: [] }, status: { ready: true, entries: 0, grants: 0 }, delete: { deleted: true },
      export: { exported: true }, restore: { restored: 1 } } as Record<string, unknown>;
    return { version: 1, ok: true, action: input.action, data: data[input.action] } as OwnerStoreReply<typeof input.action>;
  };
  const controller = createOwnerStoreController({ run, listSites: options.listSites ?? (() => [site]), pickBackup: async () => { picks++; return backup; } });
  return { controller, calls, picks: () => picks };
}
const failed = (action: OwnerStoreAction) => ownerStoreFailure({ action, code: 'operation-failed' });

const VALID: Record<OwnerStoreAction, Record<string, unknown>> = {
  status: {}, list: {}, put: { entry: { id: 'k' } }, delete: { entryId: 'k', expectedRevision: 3 },
  grant: { entryId: 'k', siteId: site.id }, revoke: { entryId: 'k', siteId: site.id }, sync: { siteId: site.id },
  export: { passphrase: 'pw' }, restore: { passphrase: 'pw' },
};

test('every action accepts exactly its own fields; one extra field is refused before any effect', async () => {
  for (const [action, input] of Object.entries(VALID) as [OwnerStoreAction, Record<string, unknown>][]) {
    const ok = fixture();
    assert.equal((await ok.controller.execute({ action, input })).ok, true, action);
    assert.ok(ok.calls.length > 0, action);
    for (const extra of ['siteDir', 'filePath', 'userDataDir', 'consumerId']) {
      const f = fixture();
      assert.deepEqual(await f.controller.execute({ action, input: { ...input, [extra]: '/private' } }), failed(action), `${action}+${extra}`);
      assert.deepEqual([f.calls.length, f.picks()], [0, 0], `${action}+${extra}`);
    }
  }
});

test('a non-object request is refused for every action (null, array, string, number, boolean)', async () => {
  for (const action of Object.keys(VALID) as OwnerStoreAction[]) {
    for (const input of [null, undefined, [], ['entry'], 'entry', 7, true]) {
      const f = fixture();
      assert.deepEqual(await f.controller.execute({ action, input }), failed(action), `${action} ${JSON.stringify(input)}`);
      assert.equal(f.calls.length, 0);
    }
  }
});

test('the request cap is 64 KiB inclusive: 65,536 bytes spawn, 65,537 do not', async () => {
  // JSON.stringify({ entry: s }) is `{"entry":"` + s + `"}`: 12 bytes of framing.
  const at = fixture();
  assert.equal((await at.controller.execute({ action: 'put', input: { entry: 'x'.repeat(65_536 - 12) } })).ok, true);
  assert.equal(at.calls[0]?.action, 'put');
  const over = fixture();
  assert.deepEqual(await over.controller.execute({ action: 'put', input: { entry: 'x'.repeat(65_536 - 11) } }), failed('put'));
  assert.equal(over.calls.length, 0);
});

test('each action dispatches exactly its CLI call: no renderer path is ever forwarded', async () => {
  const cases: [OwnerStoreAction, Parameters<Ports['run']>[0]][] = [
    ['status', { action: 'status', fields: {} }],
    ['list', { action: 'list', fields: {} }],
    ['delete', { action: 'delete', fields: { entryId: 'k', expectedRevision: 3 } }],
    ['sync', { action: 'sync', fields: {}, siteDir: site.siteDir }],
    ['revoke', { action: 'revoke', fields: { entryId: 'k' }, siteDir: site.siteDir }],
    ['export', { action: 'export', fields: { filePath: backup, passphrase: 'pw' } }],
  ];
  for (const [action, expected] of cases) {
    const f = fixture();
    await f.controller.execute({ action, input: VALID[action] });
    assert.deepEqual(f.calls, [expected], action);
  }
});

test('required strings: empty, blank, NUL-bearing or non-string ids and passphrases never spawn', async () => {
  for (const bad of ['', '   ', 'a\0b', 5, null]) {
    for (const [action, input] of [['delete', { entryId: bad }], ['revoke', { entryId: bad, siteId: site.id }], ['grant', { entryId: bad, siteId: site.id }], ['export', { passphrase: bad }], ['restore', { passphrase: bad }]] as [OwnerStoreAction, Record<string, unknown>][]) {
      const f = fixture();
      assert.deepEqual(await f.controller.execute({ action, input }), failed(action), `${action} ${JSON.stringify(bad)}`);
      assert.deepEqual([f.calls.length, f.picks()], [0, 0], `${action} ${JSON.stringify(bad)}`);
    }
  }
});

test('sync to an untracked or non-string site id never spawns', async () => {
  for (const siteId of ['untracked', site.siteDir, 5, undefined]) {
    const f = fixture();
    assert.deepEqual(await f.controller.execute({ action: 'sync', input: { siteId } }), failed('sync'), String(siteId));
    assert.equal(f.calls.length, 0);
  }
});

test('startup sync: an inventory failure keeps its code; a throwing CLI is operation-failed; a granted site is synced', async () => {
  const denied = fixture({ run: async input => ownerStoreFailure({ action: input.action, code: 'recovery-required' }) });
  assert.deepEqual(await denied.controller.syncOnStart({ siteDir: site.siteDir }), ownerStoreFailure({ action: 'sync', code: 'recovery-required' }));
  const throwing = fixture({ run: async () => { throw new Error('spawn EACCES'); } });
  assert.deepEqual(await throwing.controller.syncOnStart({ siteDir: site.siteDir }), ownerStoreFailure({ action: 'sync', code: 'operation-failed' }));
  const granted = fixture({ run: async input => (input.action === 'list'
    ? { version: 1, ok: true, action: 'list', data: { entries: [], grants: [{ entry_id: 'k', consumer_id: site.siteDir, created_at: 'x' }] } }
    : { version: 1, ok: true, action: input.action, data: { consumerId: site.siteDir, results: [] } }) as OwnerStoreReply<typeof input.action> });
  assert.equal((await granted.controller.syncOnStart({ siteDir: site.siteDir }))?.ok, true);
  assert.deepEqual(granted.calls.map(call => [call.action, call.siteDir]), [['list', undefined], ['sync', site.siteDir]]);
});

test('a grant whose post-write site listing throws reports the destination as site-unavailable', async () => {
  let listed = 0;
  const f = fixture({ listSites: () => { listed++; if (listed > 1) throw new Error('db locked'); return [site]; } });
  const result = await f.controller.execute({ action: 'grant', input: VALID.grant }) as OwnerStoreReply<'grant'> & { sync?: unknown };
  assert.equal(result.ok, true);
  assert.deepEqual(result.sync, [{ siteId: site.siteDir, reply: ownerStoreFailure({ action: 'sync', code: 'site-unavailable' }) }]);
  assert.deepEqual(f.calls.map(call => call.action), ['grant']);
});

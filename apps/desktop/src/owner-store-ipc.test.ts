/** Binding S3: main-frame-only IPC, canonical grants, post-write sync and startup catch-up. */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createOwnerStoreController, registerOwnerStoreIpc } from './owner-store-ipc.ts';
import { ownerStoreFailure } from './owner-store-cli.ts';
import { OWNER_STORE_CHANNELS, type OwnerStoreAction, type OwnerStoreData,
  type OwnerStoreReply } from './contracts/owner-store.ts';

type Ports = Parameters<typeof createOwnerStoreController>[0];
const first = { id: 'tracked-a', siteDir: path.join(tmpdir(), 'canonical-a') };
const second = { id: 'tracked-b', siteDir: path.join(tmpdir(), 'canonical-b') };
const secret = 'private-ipc-token';
const entry = { id: 'key-1', kind: 'vendor' as const, label: 'Mail', provider: 'resend', revision: 2, configured: true, isDefault: true, worksFor: [] };
const putInput = { entry: { id: entry.id, kind: entry.kind, label: entry.label, provider: entry.provider,
  meta: { credentialType: 'vendor' }, payload: { vendorId: 'resend', token: secret }, expectedRevision: 1 } };
const grant = (consumer_id: string) => ({ entry_id: entry.id, consumer_id, created_at: '2026-10-24T00:00:00.000Z' });

function reply<A extends OwnerStoreAction>({ action, data }: { action: A; data: OwnerStoreData[A] }): OwnerStoreReply<A> {
  return { version: 1, ok: true, action, data };
}

function fixture(options: { run?: Ports['run']; listSites?: Ports['listSites']; pickBackup?: Ports['pickBackup'] } = {}) {
  const calls: Parameters<Ports['run']>[0][] = [];
  const run: Ports['run'] = async input => {
    calls.push(input);
    if (options.run) return options.run(input);
    const data = { list: { entries: [entry], grants: [grant(first.siteDir), grant(second.siteDir)] }, put: { entry },
      grant: { granted: true, consumerId: first.siteDir }, revoke: { revoked: true, consumerId: first.siteDir },
      sync: { consumerId: input.siteDir!, results: [{ id: entry.id, kind: 'vendor', status: 'copied' }] },
      status: { ready: true, entries: 1, grants: 2 }, delete: { deleted: true }, export: { exported: true }, restore: { restored: 1 },
    };
    return { version: 1, ok: true, action: input.action, data: data[input.action] } as OwnerStoreReply<typeof input.action>;
  };
  const controller = createOwnerStoreController({ run, listSites: options.listSites ?? (() => [first, second]), pickBackup: options.pickBackup ?? (async () => path.join(tmpdir(), 'shared.tovu-owner-backup')) });
  return { controller, calls };
}

test('S3 all nine channels reject untrusted, null, child and navigated frames before any effect', () => {
  const handlers = new Map<string, (event: { senderFrame: { url: string; parent: unknown } | null }, input: unknown) => Promise<OwnerStoreReply>>();
  let executions = 0;
  registerOwnerStoreIpc({ ipcMain: { handle: (channel, fn) => { handlers.set(channel, fn); } },
    allowed: url => url === 'file:///sites-home.html',
    controller: { execute: async ({ action }) => { executions++; return ownerStoreFailure({ action, code: 'operation-failed' }); } },
  });
  assert.deepEqual([...handlers.keys()], Object.values(OWNER_STORE_CHANNELS));
  for (const handler of handlers.values()) {
    for (const senderFrame of [null, { url: 'https://attacker.test', parent: null }, { url: 'file:///sites-home.html?fake=1', parent: null },
      { url: 'file:///sites-home.html', parent: {} }, { url: 'file:///other.html', parent: null }]) {
      assert.throws(() => handler({ senderFrame }, { payload: secret }), { message: 'Shared keys are only available in the sites home window.' });
    }
  }
  assert.equal(executions, 0);
  void handlers.get(OWNER_STORE_CHANNELS.list)!({ senderFrame: { url: 'file:///sites-home.html', parent: null } }, {});
  assert.equal(executions, 1);
});

test('S3 invalid renderer paths/profile/unknown fields and oversize requests never spawn', async () => {
  const f = fixture();
  for (const input of [null, [], false, { userDataDir: '/private' }, { filePath: '/private' }, { action: 'status' }, { entry: { payload: 'é'.repeat(33_000) } }]) {
    const result = await f.controller.execute({ action: 'put', input });
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  for (const siteId of ['untracked', '/arbitrary', undefined, {}]) {
    assert.equal((await f.controller.execute({ action: 'grant', input: { siteId, entryId: entry.id } })).ok, false);
  }
  assert.equal(f.calls.length, 0);
});

test('S3 successful replacement syncs every distinct grant, including stopped/external tracked sites', async () => {
  const f = fixture();
  const result = await f.controller.execute({ action: 'put', input: putInput });
  assert.equal(result.ok, true);
  assert.deepEqual(f.calls.map(call => call.action), ['put', 'list', 'sync', 'sync']);
  assert.deepEqual(f.calls.slice(2).map(call => call.siteDir), [first.siteDir, second.siteDir]);
  assert.ok(result.ok && result.sync?.every(attempt => attempt.reply.ok));
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('S3 a failed copy and duplicate/untracked grants preserve committed success and remaining results', async () => {
  const f = fixture({ run: async input => {
    if (input.action === 'put') return reply({ action: 'put', data: { entry } }) as OwnerStoreReply<typeof input.action>;
    if (input.action === 'list') return reply({ action: 'list', data: { entries: [entry], grants: [grant(first.siteDir), grant(first.siteDir), grant(second.siteDir), grant('missing-site')] } }) as OwnerStoreReply<typeof input.action>;
    if (input.siteDir === first.siteDir) throw new Error(secret);
    return reply({ action: 'sync', data: { consumerId: input.siteDir!, results: [] } }) as OwnerStoreReply<typeof input.action>;
  } });
  const result = await f.controller.execute({ action: 'put', input: putInput });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.sync?.map(attempt => [attempt.siteId, attempt.reply.ok]), [[first.id, false], [second.id, true], ['missing-site', false]]);
  assert.equal(f.calls.filter(call => call.action === 'sync').length, 2);
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('S3 grant uses canonical tracked path and syncs immediately; revoke owns cleanup through --site', async () => {
  const f = fixture();
  const result = await f.controller.execute({ action: 'grant', input: { siteId: first.id, entryId: entry.id } });
  assert.equal(result.ok, true);
  assert.deepEqual(f.calls, [{ action: 'grant', fields: { entryId: entry.id, consumerId: first.siteDir } }, { action: 'sync', fields: {}, siteDir: first.siteDir }]);
  f.calls.length = 0;
  assert.equal((await f.controller.execute({ action: 'revoke', input: { siteId: first.id, entryId: entry.id } })).ok, true);
  assert.deepEqual(f.calls, [{ action: 'revoke', fields: { entryId: entry.id }, siteDir: first.siteDir }]);
});

test('S3 denied writes never sync; a grant-read error after put explicitly preserves the committed write', async () => {
  const denied = fixture({ run: async input => ownerStoreFailure({ action: input.action, code: 'conflict' }) });
  const result = await denied.controller.execute({ action: 'put', input: putInput });
  assert.equal(result.ok, false);
  assert.deepEqual(denied.calls.map(call => call.action), ['put']);
  const committed = fixture({ run: async input => {
    if (input.action === 'put') return reply({ action: 'put', data: { entry } }) as OwnerStoreReply<typeof input.action>;
    throw new Error(secret);
  } });
  const saved = await committed.controller.execute({ action: 'put', input: putInput });
  assert.ok(saved.ok && saved.syncError);
  assert.ok(!JSON.stringify(saved).includes(secret));
});

test('S3 startup sync is skipped without grants and awaited for a granted canonical site', async () => {
  const f = fixture();
  assert.equal(await f.controller.syncOnStart({ siteDir: 'ungranted-site' }), null);
  assert.deepEqual(f.calls.map(call => call.action), ['list']);
  f.calls.length = 0;
  assert.equal((await f.controller.syncOnStart({ siteDir: second.siteDir }))?.ok, true);
  assert.deepEqual(f.calls, [{ action: 'list', fields: {} }, { action: 'sync', fields: {}, siteDir: second.siteDir }]);
});

test('S3 backup dialogs own paths; cancellation/opaque picker errors do not spawn or echo secrets', async () => {
  for (const action of ['export', 'restore'] as const) {
    const f = fixture();
    assert.equal((await f.controller.execute({ action, input: { passphrase: secret } })).ok, true);
    assert.deepEqual(f.calls[0], { action, fields: { filePath: path.join(tmpdir(), 'shared.tovu-owner-backup'), passphrase: secret } });
    const cancelled = fixture({ pickBackup: async () => null });
    const result = await cancelled.controller.execute({ action, input: { passphrase: secret } });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.error.code === 'cancelled');
    assert.equal(cancelled.calls.length, 0);
    const failed = fixture({ pickBackup: async () => { throw new Error(secret); } });
    const failure = await failed.controller.execute({ action, input: { passphrase: secret } });
    assert.equal(failure.ok, false);
    assert.ok(!JSON.stringify(failure).includes(secret));
    assert.equal(failed.calls.length, 0);
  }
});

test('S3 the existing queue orders revoke after a blocked startup copy', async () => {
  let unblock!: () => void;
  let started!: () => void;
  const pending = new Promise<void>(resolve => { unblock = resolve; });
  const copying = new Promise<void>(resolve => { started = resolve; });
  const f = fixture({ run: async input => {
    if (input.action === 'list') return reply({ action: 'list', data: { entries: [entry], grants: [grant(first.siteDir)] } }) as OwnerStoreReply<typeof input.action>;
    if (input.action === 'sync') { started(); await pending; return reply({ action: 'sync', data: { consumerId: first.siteDir, results: [] } }) as OwnerStoreReply<typeof input.action>; }
    return reply({ action: 'revoke', data: { revoked: true, consumerId: first.siteDir } }) as OwnerStoreReply<typeof input.action>;
  } });
  const startup = f.controller.syncOnStart({ siteDir: first.siteDir });
  await copying;
  const revoked = f.controller.execute({ action: 'revoke', input: { siteId: first.id, entryId: entry.id } });
  assert.deepEqual(f.calls.map(call => call.action), ['list', 'sync']);
  unblock();
  await startup;
  assert.equal((await revoked).ok, true);
  assert.deepEqual(f.calls.map(call => call.action), ['list', 'sync', 'revoke']);
});

test('S3 an open backup dialog does not hold the queue; its CLI call still queues', async () => {
  let choose!: (filePath: string) => void;
  const picking = new Promise<string>(resolve => { choose = resolve; });
  const f = fixture({ pickBackup: () => picking, listSites: () => [first] });
  const exporting = f.controller.execute({ action: 'export', input: { passphrase: secret } });
  assert.equal((await f.controller.syncOnStart({ siteDir: first.siteDir }))?.ok, true, 'startup sync runs while the dialog is open');
  assert.deepEqual(f.calls.map(call => call.action), ['list', 'sync']);
  choose(path.join(tmpdir(), 'later.tovu-owner-backup'));
  assert.equal((await exporting).ok, true);
  assert.deepEqual(f.calls.map(call => call.action), ['list', 'sync', 'export']);
});

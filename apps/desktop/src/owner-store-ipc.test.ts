/** Binding S3: main-frame-only IPC, project-only saves, the confirmed legacy import and the start-up settle. */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createOwnerStoreController, importConfirmation, registerOwnerStoreIpc, settleLegacyOwnerStore } from './owner-store-ipc.ts';
import { ownerStoreFailure } from './owner-store-cli.ts';
import { OWNER_STORE_CHANNELS, type LegacyImportReport, type OwnerStoreAction, type OwnerStoreData,
  type OwnerStoreReply } from './contracts/owner-store.ts';

type Ports = Parameters<typeof createOwnerStoreController>[0];
type Run = Ports['run'];
const secret = 'private-ipc-token';
const backupPath = path.join(tmpdir(), 'shared.tovu-owner-backup');
const entry = { id: 'key-1', kind: 'vendor' as const, label: 'Mail', provider: 'resend', revision: 2, configured: true, isDefault: true, worksFor: [] };
const putInput = { entry: { id: entry.id, kind: entry.kind, label: entry.label, provider: entry.provider,
  meta: { credentialType: 'vendor' }, payload: { vendorId: 'resend', token: secret }, expectedRevision: 1 } };
const report = (status: LegacyImportReport['items'][number]['status'], applied = false): LegacyImportReport => ({ applied,
  items: [{ id: entry.id, label: entry.label, kind: 'vendor', provider: 'resend', status }], pending: [] });

function reply<A extends OwnerStoreAction>({ action, data }: { action: A; data: OwnerStoreData[A] }): OwnerStoreReply<A> {
  return { version: 1, ok: true, action, data };
}

function fixture(options: { run?: Run; pickBackup?: Ports['pickBackup']; confirmImport?: Ports['confirmImport'] } = {}) {
  const calls: Parameters<Run>[0][] = [];
  const confirmations: LegacyImportReport[] = [];
  const run: Run = async input => {
    calls.push(input);
    if (options.run) return options.run(input);
    const apply = input.action === 'import' && (input.fields as { apply: boolean }).apply;
    const data = { list: { entries: [entry] }, put: { entry }, status: { legacy: 'none', entries: 0, grants: 0 },
      import: apply ? report('imported', true) : report('new') };
    return { version: 1, ok: true, action: input.action, data: data[input.action] } as OwnerStoreReply<typeof input.action>;
  };
  const controller = createOwnerStoreController({ run, pickBackup: options.pickBackup ?? (async () => backupPath),
    confirmImport: options.confirmImport ?? (async ({ report }) => { confirmations.push(report); return true; }) });
  return { controller, calls, confirmations };
}

// Before: 'S3 all nine channels reject untrusted, null, child and navigated frames before any effect'.
test('S3 all four channels reject untrusted, null, child and navigated frames before any effect', () => {
  const handlers = new Map<string, (event: { senderFrame: { url: string; parent: unknown } | null }, input: unknown) => Promise<OwnerStoreReply>>();
  let executions = 0;
  registerOwnerStoreIpc({ ipcMain: { handle: (channel, fn) => { handlers.set(channel, fn); } },
    allowed: url => url === 'file:///sites-home.html',
    controller: { execute: async ({ action }) => { executions++; return ownerStoreFailure({ action, code: 'operation-failed' }); } },
  });
  assert.deepEqual([...handlers.keys()], Object.values(OWNER_STORE_CHANNELS));
  assert.equal(handlers.size, 4);
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

// Before: the second loop sent grant {siteId} requests. Grant is gone, so renderer-supplied import
// paths, unknown sources and the removed actions are refused instead.
test('S3 invalid renderer paths/profile/unknown fields, sources and oversize requests never spawn', async () => {
  const f = fixture();
  for (const input of [null, [], false, { userDataDir: '/private' }, { filePath: '/private' }, { action: 'status' }, { entry: { payload: 'é'.repeat(33_000) } },
    { ...putInput, store: 'owner' }]) {
    const result = await f.controller.execute({ action: 'put', input });
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  for (const input of [{ source: 'backup', passphrase: secret, filePath: '/private' }, { source: 'backup' }, { source: 'backup', passphrase: '' },
    { source: 'owner-store', passphrase: secret }, { source: '/arbitrary' }, { source: 'owner-store', apply: true }, {}]) {
    const result = await f.controller.execute({ action: 'import', input });
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  for (const action of ['grant', 'sync', 'revoke', 'export', 'restore', 'delete']) {
    assert.equal((await f.controller.execute({ action: action as OwnerStoreAction, input: {} })).ok, false);
  }
  assert.equal(f.calls.length, 0);
});

// Before: put forwarded `store` exactly as sent; now every save is a project save and is the only call.
test('project saves and listing forward only the project store and never copy, list grants or sync', async () => {
  const f = fixture();
  for (const input of [putInput, { ...putInput, store: 'project' }]) {
    const result = await f.controller.execute({ action: 'put', input });
    assert.equal(result.ok, true);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  const saved = { action: 'put', fields: { store: 'project', entry: putInput.entry } };
  assert.deepEqual(f.calls, [saved, saved]);
  await f.controller.execute({ action: 'list', input: { store: 'project' } });
  await f.controller.execute({ action: 'list', input: {} });
  assert.deepEqual(f.calls.slice(2), [{ action: 'list', fields: { store: 'project' } }, { action: 'list', fields: {} }]);
});

// Before: 'S3 denied writes never sync; a grant-read error after put explicitly preserves the committed write'.
test('S3 a refused save returns its fixed failure and makes no further call', async () => {
  const denied = fixture({ run: async input => ownerStoreFailure({ action: input.action, code: 'conflict' }) });
  const result = await denied.controller.execute({ action: 'put', input: putInput });
  assert.ok(!result.ok && result.error.code === 'conflict');
  assert.deepEqual(denied.calls.map(call => call.action), ['put']);
  const thrown = fixture({ run: async () => { throw new Error(secret); } });
  const failure = await thrown.controller.execute({ action: 'put', input: putInput });
  assert.ok(!failure.ok && failure.error.code === 'operation-failed');
  assert.ok(!JSON.stringify(failure).includes(secret));
});

test('import is a dry run first; only a confirmed dry run applies, with the same source fields', async () => {
  const f = fixture();
  const result = await f.controller.execute({ action: 'import', input: { source: 'backup', passphrase: secret } });
  assert.deepEqual(result, reply({ action: 'import', data: report('imported', true) }));
  assert.deepEqual(f.calls, [
    { action: 'import', fields: { source: 'backup', filePath: backupPath, passphrase: secret, apply: false } },
    { action: 'import', fields: { source: 'backup', filePath: backupPath, passphrase: secret, apply: true } },
  ]);
  assert.deepEqual(f.confirmations, [report('new')]);
  const local = fixture({ pickBackup: async () => assert.fail('the owner-store source never opens a picker') });
  assert.equal((await local.controller.execute({ action: 'import', input: { source: 'owner-store' } })).ok, true);
  assert.deepEqual(local.calls.map(call => call.fields), [{ source: 'owner-store', apply: false }, { source: 'owner-store', apply: true }]);
});

test('import: cancelling the confirmation never applies; nothing new or a failed dry run skips the dialog', async () => {
  const cancelled = fixture({ confirmImport: async () => false });
  const result = await cancelled.controller.execute({ action: 'import', input: { source: 'owner-store' } });
  assert.ok(!result.ok && result.error.code === 'cancelled');
  assert.deepEqual(cancelled.calls.map(call => (call.fields as { apply: boolean }).apply), [false]);
  for (const dryRun of [reply({ action: 'import', data: report('already-imported') }), reply({ action: 'import', data: { applied: false, items: [], pending: [] } }),
    ownerStoreFailure({ action: 'import', code: 'recovery-required' })]) {
    const f = fixture({ run: async () => dryRun as never, confirmImport: async () => assert.fail('nothing to confirm') });
    assert.deepEqual(await f.controller.execute({ action: 'import', input: { source: 'owner-store' } }), dryRun);
    assert.equal(f.calls.length, 1);
  }
});

// Before: 'S3 backup dialogs own paths; cancellation/opaque picker errors do not spawn or echo secrets' (export + restore).
test('S3 the backup picker owns the path; cancellation/opaque picker errors do not spawn or echo secrets', async () => {
  const cancelled = fixture({ pickBackup: async () => null });
  const result = await cancelled.controller.execute({ action: 'import', input: { source: 'backup', passphrase: secret } });
  assert.ok(!result.ok && result.error.code === 'cancelled');
  assert.equal(cancelled.calls.length, 0);
  const failed = fixture({ pickBackup: async () => { throw new Error(secret); } });
  const failure = await failed.controller.execute({ action: 'import', input: { source: 'backup', passphrase: secret } });
  assert.equal(failure.ok, false);
  assert.ok(!JSON.stringify(failure).includes(secret));
  assert.equal(failed.calls.length, 0);
});

// Before: 'S3 an open backup dialog does not hold the queue; its CLI call still queues' (export vs syncOnStart).
test('S3 an open backup picker or confirmation does not hold the queue; its CLI calls still queue', async () => {
  let choose!: (filePath: string) => void;
  let confirm!: (yes: boolean) => void;
  let asked!: () => void;
  const picking = new Promise<string>(resolve => { choose = resolve; });
  const confirming = new Promise<void>(resolve => { asked = resolve; });
  const f = fixture({ pickBackup: () => picking, confirmImport: () => { asked(); return new Promise(done => { confirm = done; }); } });
  const importing = f.controller.execute({ action: 'import', input: { source: 'backup', passphrase: secret } });
  assert.equal((await f.controller.execute({ action: 'list', input: {} })).ok, true, 'listing runs while the picker is open');
  choose(path.join(tmpdir(), 'later.tovu-owner-backup'));
  await confirming;
  assert.equal((await f.controller.execute({ action: 'status', input: {} })).ok, true, 'status runs while the confirmation is open');
  confirm(true);
  assert.equal((await importing).ok, true);
  assert.deepEqual(f.calls.map(call => call.action), ['list', 'import', 'status', 'import']);
});

test('the confirmation names what imports, what does not and why, and which sites keep their copies', () => {
  const { message, detail } = importConfirmation({ report: { applied: false, pending: [
    { entryId: 'a', site: '/sites/blog', reason: 'keeps-copy' }, { entryId: 'b', site: '/sites/blog', reason: 'revoked-copy' },
    { entryId: 'a', site: '/sites/shop', reason: 'keeps-copy' }], items: [
    { id: 'a', label: 'Mail', kind: 'vendor', provider: 'resend', status: 'new' },
    { id: 'b', label: 'Assistant', kind: 'site-assistant', provider: null, status: 'unsupported', reason: 'kind' },
    { id: 'c', label: 'Plugin key', kind: 'vendor', provider: 'x', status: 'unsupported', reason: 'owner' },
    { id: 'd', label: 'Deploy', kind: 'vendor', provider: 'vercel', status: 'conflict', reason: 'different-secret' },
    { id: 'e', label: 'Photos', kind: 'media-provider', provider: 's3', status: 'conflict', reason: 'label-taken' },
    { id: 'f', label: 'Same', kind: 'vendor', provider: 'y', status: 'already-imported' }] } });
  assert.equal(message, 'Import 1 key into your project?');
  assert.equal(detail, ['Imports into your project:', '• Mail (resend)', '', 'Not imported:',
    '• Assistant: this kind of key cannot be a project key yet', '• Plugin key (x): it belongs to another app',
    '• Deploy (vercel): a different key already uses its id', '• Photos (s3): another project key already uses its name',
    '', 'Already in your project: 1', '',
    'These sites keep their own copies. To use the project key there, attach it on that site\'s Keys screen:', '• /sites/blog', '• /sites/shop',
    '', 'No site is changed, no default key changes, and the source is never modified.'].join('\n'));
});

function settleFixture(status: OwnerStoreReply<'status'> | Error) {
  const events: string[] = [];
  const run: Run = async input => {
    events.push(`run:${input.action}`);
    if (status instanceof Error) throw status;
    return status as never;
  };
  return { events, ports: { run, removeFiles: () => { events.push('remove'); }, notify: () => { events.push('notify'); },
    log: (message: string) => { events.push(`log:${message}`); } } };
}
const statusReply = (legacy: OwnerStoreData['status']['legacy'], count = 0) => reply({ action: 'status', data: { legacy, entries: count, grants: count } });

test('start-up settle: an empty legacy store (0 entries AND 0 grants) is deleted without a notice', async () => {
  const f = settleFixture(statusReply('empty'));
  assert.equal(await settleLegacyOwnerStore(f.ports), 'removed');
  assert.deepEqual(f.events, ['run:status', 'remove']);
});

test('start-up settle: a store holding keys is kept and the import notice shows; settled/none do nothing', async () => {
  const available = settleFixture(statusReply('available', 2));
  assert.equal(await settleLegacyOwnerStore(available.ports), 'available');
  assert.deepEqual(available.events, ['run:status', 'notify']);
  for (const legacy of ['settled', 'none'] as const) {
    const f = settleFixture(statusReply(legacy, legacy === 'settled' ? 1 : 0));
    assert.equal(await settleLegacyOwnerStore(f.ports), legacy);
    assert.deepEqual(f.events, ['run:status']);
  }
});

test('start-up settle: a failed or thrown status keeps every file, shows nothing and only logs', async () => {
  for (const status of [ownerStoreFailure({ action: 'status', code: 'recovery-required' }), new Error(secret)]) {
    const f = settleFixture(status);
    assert.equal(await settleLegacyOwnerStore(f.ports), 'failed');
    assert.deepEqual(f.events, ['run:status', 'log:tovu desktop: the older shared-key store could not be checked; it was left in place.']);
    assert.ok(!f.events.join('').includes(secret));
  }
});

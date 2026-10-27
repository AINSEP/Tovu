/** S3 transport: stdin-only secrets, v1 outcomes, bounded children and the existing spawn plan. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOwnerStoreCli, type OwnerStoreCliOptions } from './owner-store-cli.ts';
import type { OwnerStoreAction } from './contracts/owner-store.ts';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const userDataDir = path.join(tmpdir(), 'owner-store-test-profile');
const secret = 's3-private-token-DO-NOT-ECHO';
const entry = { label: 'Mail', provider: 'resend', meta: { credentialType: 'vendor' }, payload: { token: secret }, expectedRevision: null };

function fixture({ output, code = 0, stderr = '', hang = false, spawnError = false, pipeError = false }: {
  output?: unknown; code?: number; stderr?: string; hang?: boolean; spawnError?: boolean; pipeError?: boolean;
} = {}) {
  const calls: { command: string; args: string[]; env: NodeJS.ProcessEnv; stdin: string; killed: boolean }[] = [];
  const spawnFn: NonNullable<OwnerStoreCliOptions['spawnFn']> = (command, args, options) => {
    if (spawnError) throw new Error(secret);
    const call = { command, args, env: options?.env ?? {}, stdin: '', killed: false };
    calls.push(call);
    const events = new EventEmitter();
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const err = new PassThrough();
    stdin.setEncoding('utf8');
    stdin.on('data', chunk => { call.stdin += chunk; });
    stdin.on('finish', () => {
      queueMicrotask(() => {
        if (pipeError) { stdin.emit('error', new Error(secret)); return; }
        if (hang) return;
        err.end(stderr);
        const body = typeof output === 'string' ? output : JSON.stringify(output);
        stdout.end(`${body}\n`);
        events.emit('close', code);
      });
    });
    return Object.assign(events, { stdin, stdout, stderr: err,
      kill: () => { call.killed = true; return true; },
    }) as unknown as ChildProcessWithoutNullStreams;
  };
  return { calls, options: { cliMode: 'source' as const, spawnFn, baseEnv: { PATH: process.env.PATH } } };
}

function success({ action, data }: { action: OwnerStoreAction; data: object }) {
  return { version: 1, ok: true, action, data };
}

// Before: the reply kept `grants: []`; legacy grants no longer cross IPC, so cleanData drops them.
test('project store selection stays on stdin through the existing CLI transport', async () => {
  const f = fixture({ output: success({ action: 'list', data: { entries: [], grants: [{ entry_id: 'a', consumer_id: '/site' }] } }) });
  const result = await runOwnerStoreCli({ repoRoot, userDataDir, action: 'list', fields: { store: 'project' } }, f.options);
  assert.deepEqual(result, success({ action: 'list', data: { entries: [] } }));
  assert.deepEqual(JSON.parse(f.calls[0]!.stdin), { userDataDir, store: 'project' });
  assert.deepEqual(f.calls[0]!.args.slice(-3), ['owner-store', 'list', '--json']);
});

test('S3 put sends the complete private request only on stdin; replies omit payload/meta', async (t) => {
  const logs: unknown[] = [];
  for (const method of ['log', 'warn', 'error'] as const) t.mock.method(console, method, (...args: unknown[]) => { logs.push(args); });
  const view = { id: 'key-1', kind: 'vendor', label: 'Mail', provider: 'resend', revision: 1, configured: true, isDefault: true, worksFor: [] };
  const f = fixture({ output: success({ action: 'put', data: { entry: { ...view, payload: { token: secret }, meta: { secret } }, secret } }) });
  const result = await runOwnerStoreCli({ repoRoot, userDataDir, action: 'put', fields: { entry } }, f.options);
  assert.deepEqual(result, success({ action: 'put', data: { entry: view } }));
  const call = f.calls[0]!;
  assert.equal(call.command, process.execPath);
  assert.deepEqual(call.args.slice(-3), ['owner-store', 'put', '--json']);
  assert.equal(call.env.ELECTRON_RUN_AS_NODE, '1');
  assert.deepEqual(JSON.parse(call.stdin), { userDataDir, entry });
  assert.ok(!JSON.stringify({ args: call.args, env: call.env, logs, result }).includes(secret));
  assert.equal(existsSync(call.env.TOVU_SITE_DIR!), false, 'temporary import directory is removed');
});

// Before: 'S3 sync/revoke supply only an absolute --site on argv, never an entry value'. No action
// targets a site any more, so argv is the fixed action alone for every channel.
test('S3 argv is only the fixed action and --json; no --site or request value ever reaches it', async () => {
  for (const action of ['status', 'list', 'put', 'import'] as const) {
    const f = fixture({ output: success({ action, data: {} }) });
    await runOwnerStoreCli({ repoRoot, userDataDir, action, fields: {} as never }, f.options);
    assert.deepEqual(f.calls[0]!.args.slice(-3), ['owner-store', action, '--json']);
    assert.equal(f.calls[0]!.args.includes('--site'), false);
  }
});

test('status and import replies keep only the published fields, including an optional reason', async () => {
  const status = fixture({ output: success({ action: 'status', data: { legacy: 'available', entries: 2, grants: 1, filePath: secret } }) });
  assert.deepEqual(await runOwnerStoreCli({ repoRoot, userDataDir, action: 'status', fields: {} }, status.options),
    success({ action: 'status', data: { legacy: 'available', entries: 2, grants: 1 } }));
  const item = { id: 'a', label: 'Mail', kind: 'vendor', provider: 'resend', status: 'new' };
  const f = fixture({ output: success({ action: 'import', data: { applied: false, secret,
    items: [{ ...item, payload: { token: secret } }, { ...item, id: 'b', status: 'conflict', reason: 'different-secret', meta: { secret } }],
    pending: [{ entryId: 'a', site: '/sites/blog', reason: 'keeps-copy', envelope: secret }] } }) });
  const result = await runOwnerStoreCli({ repoRoot, userDataDir, action: 'import', fields: { source: 'owner-store', apply: false } }, f.options);
  assert.deepEqual(result, success({ action: 'import', data: { applied: false,
    items: [item, { ...item, id: 'b', status: 'conflict', reason: 'different-secret' }],
    pending: [{ entryId: 'a', site: '/sites/blog', reason: 'keeps-copy' }] } }));
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('S3 recovery/CLI failure surfaces fixed codes without child messages or stderr', async () => {
  const f = fixture({ output: { version: 1, action: 'status', ok: false, error: { code: 'recovery-required', message: secret } }, code: 1, stderr: secret });
  const result = await runOwnerStoreCli({ repoRoot, userDataDir, action: 'status', fields: {} }, f.options);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, 'recovery-required');
  assert.match(result.error.message, /owner.key/);
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('S3 malformed, mismatched, extra-line and nonzero-success replies never leak diagnostics', async () => {
  for (const [output, code] of [
    [secret, 1],
    [success({ action: 'list', data: { entries: [], grants: [] } }), 0],
    [`${JSON.stringify(success({ action: 'status', data: { legacy: 'none' } }))}\n${secret}`, 0],
    [success({ action: 'status', data: { legacy: 'none', entries: 0, grants: 0 } }), 1],
    [{ version: 1, ok: false, action: 'status', error: { code: secret, message: secret } }, 1],
  ] as const) {
    const f = fixture({ output, code, stderr: secret });
    const result = await runOwnerStoreCli({ repoRoot, userDataDir, action: 'status', fields: {} }, f.options);
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
});

// Before: 'S3 export/restore keep the passphrase and backup path exclusively on stdin' (both actions).
test('S3 a backup import keeps the passphrase and backup path exclusively on stdin', async () => {
  const filePath = path.join(tmpdir(), 'shared.tovu-owner-backup');
  const f = fixture({ output: success({ action: 'import', data: { applied: false, items: [], pending: [] } }) });
  const fields = { source: 'backup' as const, apply: false, passphrase: secret, filePath };
  assert.equal((await runOwnerStoreCli({ repoRoot, userDataDir, action: 'import', fields }, f.options)).ok, true);
  assert.deepEqual(JSON.parse(f.calls[0]!.stdin), { userDataDir, ...fields });
  assert.ok(!JSON.stringify({ args: f.calls[0]!.args, env: f.calls[0]!.env }).includes(secret));
  assert.ok(!f.calls[0]!.args.includes(filePath));
});

// Before: also refused sync/status with bad siteDir combinations; siteDir and sync no longer exist,
// so a removed action name is refused instead.
test('S3 caps UTF-8 stdin at 64 KiB before spawning and refuses relative profiles and removed actions', async () => {
  const f = fixture();
  for (const input of [
    { repoRoot, userDataDir, action: 'put' as const, fields: { entry: { ...entry, payload: { token: 'é'.repeat(33_000) } } } },
    { repoRoot, userDataDir: 'relative-profile', action: 'status' as const, fields: {} },
    { repoRoot, userDataDir, action: 'sync' as never, fields: {} },
    { repoRoot, userDataDir, action: 'restore' as never, fields: {} },
  ]) assert.equal((await runOwnerStoreCli(input, f.options)).ok, false);
  assert.equal(f.calls.length, 0);
});

test('S3 spawn/pipe failures, oversized stdout and deadlines settle safely and kill runaway children', async () => {
  for (const options of [{ spawnError: true }, { pipeError: true }, { output: 'x'.repeat(1024 * 1024 + 1) }, { hang: true }]) {
    const f = fixture(options);
    const result = await runOwnerStoreCli({ repoRoot, userDataDir, action: 'status', fields: {} }, { ...f.options, timeoutMs: 5 });
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(secret));
    if (f.calls.length) assert.equal(f.calls[0]!.killed, true);
  }
});

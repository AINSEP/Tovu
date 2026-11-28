/** S3 transport: stdin-only secrets, v1 outcomes, bounded children and the existing spawn plan. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  // sourceDigest crosses IPC: the confirmed apply must name it (a hash of the source the dry run read).
  const f = fixture({ output: success({ action: 'import', data: { applied: false, secret, sourceDigest: 'a'.repeat(64),
    items: [{ ...item, payload: { token: secret } }, { ...item, id: 'b', status: 'conflict', reason: 'different-secret', meta: { secret } }],
    pending: [{ entryId: 'a', site: '/sites/blog', reason: 'keeps-copy', envelope: secret }] } }) });
  const result = await runOwnerStoreCli({ repoRoot, userDataDir, action: 'import', fields: { source: 'owner-store', apply: false } }, f.options);
  assert.deepEqual(result, success({ action: 'import', data: { applied: false, sourceDigest: 'a'.repeat(64),
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
  const changed = fixture({ output: { version: 1, action: 'import', ok: false, error: { code: 'source-changed', message: secret } }, code: 1 });
  const refused = await runOwnerStoreCli({ repoRoot, userDataDir, action: 'import', fields: { source: 'owner-store', apply: true, expectedDigest: 'a'.repeat(64) } }, changed.options);
  assert.ok(!refused.ok && refused.error.code === 'source-changed' && /changed/.test(refused.error.message));
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

test('a populated CLI inventory preserves safe entry metadata but never child-only fields', async () => {
  const safe = { id: 'deploy', kind: 'vendor', label: 'Deploy', provider: 'deploy-provider', revision: 3,
    configured: true, isDefault: false, worksFor: ['deploy-provider'], usedBy: ['Staging'] };
  const f = fixture({ output: success({ action: 'list', data: {
    entries: [{ ...safe, payload: { token: secret }, keyFile: '/private/key', meta: { secret } }], rawInventory: secret,
  } }) });
  const result = await runOwnerStoreCli({ repoRoot, userDataDir, action: 'list', fields: { store: 'project' } }, f.options);
  assert.deepEqual(result, { version: 1, action: 'list', ok: true, data: { entries: [safe] } });
  assert.equal(f.calls[0]?.killed, false);
});

/** A child whose streams and events the test drives by hand; records every kill signal. */
function drivenChild({ endThrows = false }: { endThrows?: boolean } = {}) {
  const stdin = new PassThrough();
  if (endThrows) stdin.end = () => { throw new Error(secret); };
  const kills: string[] = [];
  const child = Object.assign(new EventEmitter(), { stdin, stdout: new PassThrough(), stderr: new PassThrough(),
    kill: (signal: string) => { kills.push(signal); return true; } });
  const options: OwnerStoreCliOptions = { cliMode: 'source', baseEnv: { PATH: process.env.PATH },
    spawnFn: () => child as unknown as ChildProcessWithoutNullStreams };
  return { child, kills, options };
}

const statusReply = `${JSON.stringify(success({ action: 'status', data: { legacy: 'available', entries: 2, grants: 1 } }))}\n`;
const failureCode = (reply: Awaited<ReturnType<typeof runOwnerStoreCli<'status'>>>) => (reply.ok ? 'ok' : reply.error.code);

for (const source of ['stdout', 'stderr', 'process'] as const) {
  test(`a ${source} error fails the operation once, kills the child once, and a later valid reply cannot revive it`, async () => {
    const { child, kills, options } = drivenChild();
    const pending = runOwnerStoreCli({ repoRoot, userDataDir, action: 'status', fields: {} }, options);
    (source === 'process' ? child : child[source]).emit('error', new Error(secret));
    child.stdout.end(statusReply);
    child.emit('close', 0);
    const result = await pending;
    assert.equal(failureCode(result), 'operation-failed');
    assert.ok(!JSON.stringify(result).includes(secret));
    assert.deepEqual(kills, ['SIGKILL']);
  });
}

test('a stdin that throws while the request is written fails the operation and kills the child', async () => {
  const { kills, options } = drivenChild({ endThrows: true });
  const result = await runOwnerStoreCli({ repoRoot, userDataDir, action: 'status', fields: {} }, options);
  assert.equal(failureCode(result), 'operation-failed');
  assert.deepEqual(kills, ['SIGKILL']);
});

test('stdout past the reply cap fails once; later chunks are ignored rather than killing again', async () => {
  const { child, kills, options } = drivenChild();
  const pending = runOwnerStoreCli({ repoRoot, userDataDir, action: 'status', fields: {} }, options);
  child.stdout.write('x'.repeat(1024 * 1024 + 1));
  child.stdout.write('y');
  child.stdout.end(statusReply);
  await new Promise(resolve => setImmediate(resolve));
  child.emit('close', 0);
  assert.equal(failureCode(await pending), 'operation-failed');
  assert.deepEqual(kills, ['SIGKILL']);
});

/** A stand-in compiled CLI: records what it was given, then answers status on stdout. */
const CLI_SCRIPT = `
const fs = require('node:fs'); const path = require('node:path');
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { stdin += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(path.join(__dirname, 'seen.json'), JSON.stringify({ argv: process.argv.slice(2), stdin, env: process.env }));
  process.stdout.write(${JSON.stringify(statusReply)});
});
`;

test('without an injected spawn the compiled CLI runs as a real child with an isolated env, silently dropping relocations', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'owner-store-cli-repo-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ bin: { tovu: 'cli.cjs' } }));
  writeFileSync(path.join(root, 'cli.cjs'), CLI_SCRIPT);
  const warnings = t.mock.method(console, 'warn', () => {});
  const result = await runOwnerStoreCli({ repoRoot: root, userDataDir, action: 'status', fields: {} },
    { baseEnv: { PATH: process.env.PATH, TOVU_PLUGINS_DIR: '/foreign/plugins', TOVU_SITE_DIR: '/foreign/site' } });
  assert.deepEqual(result, success({ action: 'status', data: { legacy: 'available', entries: 2, grants: 1 } }));
  const seen = JSON.parse(readFileSync(path.join(root, 'seen.json'), 'utf8')) as { argv: string[]; stdin: string; env: NodeJS.ProcessEnv };
  assert.deepEqual(seen.argv, ['owner-store', 'status', '--json']);
  assert.deepEqual(JSON.parse(seen.stdin), { userDataDir });
  assert.equal(seen.env.TOVU_PLUGINS_DIR, undefined, 'a relocation exported for another run is not inherited');
  assert.equal(seen.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(path.dirname(seen.env.TOVU_SITE_DIR ?? ''), tmpdir());
  assert.match(path.basename(seen.env.TOVU_SITE_DIR ?? ''), /^tovu-owner-store-/);
  assert.equal(existsSync(seen.env.TOVU_SITE_DIR ?? ''), false, 'the isolated scratch site is removed afterwards');
  assert.equal(warnings.mock.callCount(), 0, 'the dropped relocation is not logged');
});

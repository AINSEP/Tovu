/** S3 transport only: project.db, any legacy owner.db and all native dependencies stay in the Tovu CLI payload. */
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCliEnv, buildCliSpawnPlan, type CliMode } from './tovu-server.ts';
import { OWNER_STORE_CHANNELS, type OwnerStoreAction, type OwnerStoreCliFields,
  type OwnerStoreData, type OwnerStoreReply } from './contracts/owner-store.ts';

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_REPLY_BYTES = 1024 * 1024;
const TIMEOUT_MS = 60_000;
type SpawnFn = (command: string, args: string[], options: SpawnOptions & { stdio: ['pipe', 'pipe', 'pipe'] }) => ChildProcessWithoutNullStreams;
export interface OwnerStoreCliOptions {
  cliMode?: CliMode; baseEnv?: NodeJS.ProcessEnv; spawnFn?: SpawnFn; timeoutMs?: number;
}
export interface OwnerStoreCliInput<A extends OwnerStoreAction = OwnerStoreAction> {
  repoRoot: string; userDataDir: string; action: A; fields: OwnerStoreCliFields[A];
}

/** Fixed errors only: even an unexpected child diagnostic may quote a credential.
 * @returns A wire failure without the original message, stack or cause. @complexity O(1).
 */
export function ownerStoreFailure<A extends OwnerStoreAction>({ action, code }: {
  action: A; code: string;
}, _options = {}): OwnerStoreReply<A> {
  const messages: Record<string, string> = {
    'invalid-input': 'Provide a valid shared-key request.',
    'recovery-required': 'The older shared-key store cannot be opened. Restore its original owner.key.',
    'invalid-backup': 'Check the encrypted backup and passphrase.',
    'conflict': 'This key changed. Refresh before retrying.',
    'context': 'The shared-key operation is outside the allowed credential scope.',
    'invalid-meta': 'The shared-key metadata is invalid.',
    'invalid-record': 'The shared-key entry is invalid.',
    'cancelled': 'The import was cancelled.',
    'timeout': 'The shared-key operation timed out. Refresh before retrying.',
    'source-changed': 'The import source changed after it was reviewed. Run the import again.',
  };
  const safeCode = Object.hasOwn(messages, code) ? code : 'operation-failed';
  return { version: 1, ok: false, action, error: { code: safeCode,
    message: messages[safeCode] ?? 'The shared-key operation failed. Refresh the inventory and retry.' } };
}

/** Run one bounded request under Electron-as-node, secrets exclusively on stdin.
 * @param input Payload root, resolved userData, fixed action and stdin fields.
 * @param options Injectable spawn/env/mode/deadline. No request-derived env or logs.
 * @returns One metadata-only reply; spawn, pipe, timeout and protocol failures use fixed errors.
 * @complexity O(request + reply bytes) space/time, capped at 64 KiB/1 MiB; one child, 60s deadline.
 * @example await runOwnerStoreCli({ repoRoot, userDataDir, action: 'list', fields: {} });
 */
export async function runOwnerStoreCli<A extends OwnerStoreAction>(input: OwnerStoreCliInput<A>, options: OwnerStoreCliOptions = {}): Promise<OwnerStoreReply<A>> {
  let scratch: string | undefined;
  try {
    const request = serializeRequest({ input });
    if (!request) return ownerStoreFailure({ action: input.action, code: 'invalid-input' });
    // Match agent-plugin-tokens: CLI imports require an isolated site selection even for status.
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-owner-store-'));
    const cliArgs = ['owner-store', input.action, '--json'];
    const plan = buildCliSpawnPlan({ repoRoot: input.repoRoot, cliMode: options.cliMode, cliArgs });
    const env = buildCliEnv({ baseEnv: options.baseEnv, siteDir: scratch }, { warn: () => {} });
    const spawnFn: SpawnFn = options.spawnFn ?? spawn;
    const child = spawnFn(plan.command, plan.args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    return await collectReply({ child, request, action: input.action }, { timeoutMs: options.timeoutMs ?? TIMEOUT_MS });
  } catch {
    return ownerStoreFailure({ action: input.action, code: 'operation-failed' });
  } finally {
    // Temp cleanup cannot turn a committed write into a rejected/ambiguous operation.
    if (scratch) { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* No owner data lives here. */ } }
  }
}

/** Enforce fixed argv actions, absolute main-owned paths and the CLI's exact stdin cap.
 * @complexity O(request bytes); JSON errors never escape to Electron's error logger.
 */
function serializeRequest({ input }: { input: OwnerStoreCliInput }, _options = {}): string | null {
  if (!Object.hasOwn(OWNER_STORE_CHANNELS, input.action) || !path.isAbsolute(input.userDataDir)) return null;
  const request = JSON.stringify({ ...input.fields, userDataDir: input.userDataDir });
  return Buffer.byteLength(request) <= MAX_REQUEST_BYTES ? request : null;
}

/** Drain stderr without retaining it; finish on close so the final stdout bytes are included.
 * @complexity O(reply bytes), bounded memory. Pipe/error/deadline paths kill the child and settle once.
 */
function collectReply<A extends OwnerStoreAction>({ child, request, action }: {
  child: ChildProcessWithoutNullStreams; request: string; action: A;
}, { timeoutMs }: { timeoutMs: number }): Promise<OwnerStoreReply<A>> {
  return new Promise(resolve => {
    let output = '';
    let bytes = 0;
    let settled = false;
    const finish = (reply: OwnerStoreReply<A>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(reply);
    };
    const fail = (code = 'operation-failed'): void => {
      finish(ownerStoreFailure({ action, code }));
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => fail('timeout'), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (settled) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_REPLY_BYTES) { fail(); return; }
      output += chunk;
    });
    child.stderr.resume();
    child.stdout.once('error', () => fail());
    child.stderr.once('error', () => fail());
    child.stdin.once('error', () => fail());
    child.once('error', () => fail());
    child.once('close', code => finish(parseReply({ action, output, code })));
    try { child.stdin.end(request); } catch { fail(); }
  });
}

/** Validate the v1 envelope and omit fields outside the published CLI data contract.
 * @complexity O(reply bytes); parse diagnostics and raw CLI messages are deliberately discarded.
 */
function parseReply<A extends OwnerStoreAction>({ action, output, code }: {
  action: A; output: string; code: number | null;
}, _options = {}): OwnerStoreReply<A> {
  try {
    const reply = singleLineJson({ output });
    if (reply.version !== 1 || reply.action !== action) throw new Error();
    if (reply.ok === false) return ownerStoreFailure({ action, code: reply.error?.code });
    if (reply.ok !== true || code !== 0) throw new Error();
    return { version: 1, ok: true, action, data: cleanData({ action, data: reply.data }) };
  } catch { return ownerStoreFailure({ action, code: 'operation-failed' }); }
}

/** The CLI prints exactly one JSON line; anything else (banners, partial writes) is a protocol failure.
 * @throws On zero/multiple lines or invalid JSON; callers map that to a fixed error. @complexity O(bytes).
 */
function singleLineJson({ output }: { output: string }, _options = {}): Record<string, any> {
  const lines = output.trim().split(/\r?\n/);
  if (lines.length !== 1) throw new Error('owner-store reply is not one line');
  return JSON.parse(lines[0]!);
}

/** Only named metadata fields cross IPC; never spread a child object into a renderer reply.
 * @complexity O(inventory + import rows), bounded by the reply cap.
 */
function cleanData<A extends OwnerStoreAction>({ action, data }: { action: A; data: Record<string, unknown> }, _options = {}): OwnerStoreData[A] {
  const fields: Record<OwnerStoreAction, readonly string[]> = {
    status: ['legacy', 'entries', 'grants'], list: ['entries'], put: ['entry'], import: ['applied', 'items', 'pending', 'sourceDigest'],
  };
  const out = pick({ value: data, fields: fields[action] });
  if (action === 'list') out.entries = (data.entries as object[]).map(value => cleanEntry({ value }));
  if (action === 'put') out.entry = cleanEntry({ value: data.entry as object });
  if (action === 'import') {
    out.items = (data.items as object[]).map(value => pick({ value, fields: ['id', 'label', 'kind', 'provider', 'status', 'reason'] }));
    out.pending = (data.pending as object[]).map(value => pick({ value, fields: ['entryId', 'site', 'reason'] }));
  }
  return out as unknown as OwnerStoreData[A];
}

/** The CLI validates safe label/provider metadata; arbitrary meta and payload remain excluded. */
function cleanEntry({ value }: { value: object }, _options = {}): Record<string, unknown> {
  return pick({ value, fields: ['id', 'kind', 'label', 'provider', 'revision', 'configured', 'isDefault', 'worksFor'] });
}
/** Copy only named DTO fields, preserving optional fields (reason) without inventing values. */
function pick({ value, fields }: { value: object; fields: readonly string[] }, _options = {}): Record<string, unknown> {
  return Object.fromEntries(fields.filter(field => Object.hasOwn(value, field)).map(field => [field, (value as Record<string, unknown>)[field]]));
}

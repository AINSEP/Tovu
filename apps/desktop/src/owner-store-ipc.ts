/** S3 trusted sites-home bridge. The CLI owns persistence; main owns dialogs, files and scheduling.
 * Shared keys are project references: nothing here copies a key into a site or opens an owner store.
 */
import { createKeyedSerializer } from './keyed-serializer.ts';
import { ownerStoreFailure } from './owner-store-cli.ts';
import { OWNER_STORE_CHANNELS, type LegacyImportReport, type LegacyImportSource, type OwnerStoreAction,
  type OwnerStoreCliFields, type OwnerStoreReply } from './contracts/owner-store.ts';

type OwnerStoreRun = <A extends OwnerStoreAction>(input: {
  action: A; fields: OwnerStoreCliFields[A];
}, options?: {}) => Promise<OwnerStoreReply<A>>;
interface OwnerStorePorts {
  run: OwnerStoreRun;
  /** Native open dialog for a legacy backup; never a renderer-supplied path. */
  pickBackup: () => Promise<string | null>;
  /** Native confirmation listing the dry run; true imports. */
  confirmImport: (input: { report: LegacyImportReport }) => Promise<boolean>;
}
interface OwnerStoreEvent { senderFrame: { url: string; parent: unknown } | null }
type Serialize = <T>(work: () => Promise<T>) => Promise<T>;
export interface OwnerStoreController {
  execute: (input: { action: OwnerStoreAction; input: unknown }, options?: {}) => Promise<OwnerStoreReply>;
}

/** Small strict outer request: destination paths/profile/unknown fields cannot become CLI options.
 * @throws A fixed error for invalid input; no submitted values are interpolated.
 * @complexity O(request bytes), capped at 64 KiB before spawning.
 */
function requestInput({ action, input }: { action: OwnerStoreAction; input: unknown }, _options = {}): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid shared-key request.');
  const fields: Record<OwnerStoreAction, readonly string[]> = { status: [], list: ['store'], put: ['entry', 'store'],
    import: ['source', 'passphrase'] };
  if (Object.keys(input).some(field => !fields[action].includes(field))) throw new Error('Invalid shared-key request.');
  if ('store' in input && input.store !== 'project') throw new Error('Invalid shared-key request.');
  if (Buffer.byteLength(JSON.stringify(input)) > 64 * 1024) throw new Error('Invalid shared-key request.');
  return input as Record<string, unknown>;
}

/** Validate required string fields without exposing content in thrown errors. */
function requiredString({ value }: { value: unknown }, _options = {}): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Invalid shared-key request.');
  return value;
}

/** The import's fixed source fields: a backup needs a passphrase and a main-picked file. */
async function importFields({ request, ports }: { request: Record<string, unknown>; ports: OwnerStorePorts }, _options = {}): Promise<Omit<OwnerStoreCliFields['import'], 'apply'> | null> {
  const source = request.source as LegacyImportSource;
  if (source === 'owner-store') {
    if (request.passphrase !== undefined) throw new Error('Invalid shared-key request.');
    return { source };
  }
  if (source !== 'backup') throw new Error('Invalid shared-key request.');
  const passphrase = requiredString({ value: request.passphrase });
  const filePath = await ports.pickBackup();
  return filePath === null ? null : { source, filePath, passphrase };
}

/** Dry run first, always; the native confirmation lists it; only a confirmed run writes.
 * The dialogs can stay open indefinitely, so only the CLI calls join the queue: an open picker or
 * confirmation must not stall other shared-key operations. The passphrase lives only in this call.
 * @complexity Two bounded CLI calls at most; cancelling either dialog never writes.
 */
async function importRequest({ request, ports, serialize }: {
  request: Record<string, unknown>; ports: OwnerStorePorts; serialize: Serialize;
}, _options = {}): Promise<OwnerStoreReply<'import'>> {
  const fields = await importFields({ request, ports });
  if (fields === null) return ownerStoreFailure({ action: 'import', code: 'cancelled' });
  const dryRun = await serialize(() => ports.run({ action: 'import', fields: { ...fields, apply: false } }));
  if (!dryRun.ok || !dryRun.data.items.some(item => item.status === 'new')) return dryRun;
  if (!await ports.confirmImport({ report: dryRun.data })) return ownerStoreFailure({ action: 'import', code: 'cancelled' });
  // The CLI rereads the source; naming the confirmed dry run's digest refuses a source replaced meanwhile.
  const expectedDigest = dryRun.data.sourceDigest;
  return serialize(() => ports.run({ action: 'import', fields: { ...fields, apply: true, ...(expectedDigest === undefined ? {} : { expectedDigest }) } }));
}

/** Fixed-action dispatch; vault payload/revision validation stays with the CLI's existing owner.
 * @complexity O(request bytes) plus delegated work. Unknown actions fail before a spawn.
 */
async function executeRequest({ action, input, ports, serialize }: {
  action: OwnerStoreAction; input: unknown; ports: OwnerStorePorts; serialize: Serialize;
}): Promise<OwnerStoreReply> {
  const request = requestInput({ action, input });
  // A total Record keeps the exhaustiveness check without a switch.
  const handlers: Record<OwnerStoreAction, () => Promise<OwnerStoreReply>> = {
    status: () => serialize(() => ports.run({ action: 'status', fields: {} })),
    list: () => serialize(() => ports.run({ action: 'list', fields: request.store === 'project' ? { store: 'project' } : {} })),
    // Project attachments reference the original row; a save never creates a site copy.
    put: () => serialize(() => ports.run({ action: 'put', fields: { store: 'project', entry: request.entry as OwnerStoreCliFields['put']['entry'] } })),
    import: () => importRequest({ request, ports, serialize }),
  };
  return handlers[action]();
}

/** Serialize CLI work using the shell's existing keyed queue.
 * @param ports CLI, native backup picker and import confirmation; all effects are injected.
 * @returns The execute port. Opaque I/O errors become fixed wire failures.
 * @complexity One bounded CLI call per operation (two for a confirmed import).
 * @example const store = createOwnerStoreController({ run, pickBackup, confirmImport });
 */
export function createOwnerStoreController(ports: OwnerStorePorts, _options = {}): OwnerStoreController {
  const queue = createKeyedSerializer();
  const serialize: Serialize = work => queue.run('owner-store', work);
  return {
    execute: async ({ action, input }, _options = {}) => {
      try { return await executeRequest({ action, input, ports, serialize }); }
      catch { return ownerStoreFailure({ action, code: 'operation-failed' }); }
    },
  };
}

const SKIPPED: Record<NonNullable<LegacyImportReport['items'][number]['reason']>, string> = {
  'different-secret': 'a different key already uses its id',
  'label-taken': 'another project key already uses its name',
  kind: 'this kind of key cannot be a project key yet',
  owner: 'it belongs to another app',
};

/** The native confirmation's text for a dry run: what imports, what does not and why, which sites
 * keep their own copies. Labels/providers/site folders are metadata; no secret is in the report.
 * @complexity O(items + pending); pure.
 * @example const { message, detail } = importConfirmation({ report });
 */
export function importConfirmation({ report }: { report: LegacyImportReport }, _options = {}): { message: string; detail: string } {
  const name = (item: LegacyImportReport['items'][number]) => item.provider ? `${item.label} (${item.provider})` : item.label;
  const fresh = report.items.filter(item => item.status === 'new');
  const skipped = report.items.filter(item => item.reason !== undefined);
  const same = report.items.filter(item => item.status === 'already-imported').length;
  const lines = [`Imports into your project:`, ...fresh.map(item => `• ${name(item)}`)];
  if (skipped.length) lines.push('', 'Not imported:', ...skipped.map(item => `• ${name(item)}: ${SKIPPED[item.reason!]}`));
  if (same) lines.push('', `Already in your project: ${same}`);
  if (report.pending.length) {
    lines.push('', 'These sites keep their own copies. To use the project key there, attach it on that site\'s Keys screen:',
      ...[...new Set(report.pending.map(row => row.site))].map(site => `• ${site}`));
  }
  lines.push('', 'No site is changed, no default key changes, and the source is never modified.');
  return { message: `Import ${fresh.length} key${fresh.length === 1 ? '' : 's'} into your project?`, detail: lines.join('\n') };
}

/** Desktop start: delete a legacy owner store only when a read-only check finds it empty (0 entries
 * AND 0 grants); keep one that holds anything and say an import is available. Nothing creates an
 * owner store any more, so an empty one is only a leftover of an older start.
 * @param required The status CLI call, the four-file removal and the existing native notice.
 * @returns What it found; failures keep every file and stay silent beyond the log.
 * @complexity One bounded CLI call; at most four file removals.
 * @example await settleLegacyOwnerStore({ run, removeFiles, notify, log });
 */
export async function settleLegacyOwnerStore({ run, removeFiles, notify, log }: {
  run: OwnerStoreRun; removeFiles: () => void; notify: () => void; log: (message: string) => void;
}, _options = {}): Promise<'none' | 'removed' | 'available' | 'settled' | 'failed'> {
  try {
    const reply = await run({ action: 'status', fields: {} });
    if (!reply.ok) { log('tovu desktop: the older shared-key store could not be checked; it was left in place.'); return 'failed'; }
    if (reply.data.legacy === 'empty') { removeFiles(); return 'removed'; }
    if (reply.data.legacy === 'available') notify();
    return reply.data.legacy;
  } catch {
    log('tovu desktop: the older shared-key store could not be checked; it was left in place.');
    return 'failed';
  }
}

/** Register the fixed channels before opening sites home; refuse subframes and navigated pages.
 * @param required Main IPC registration, exact trusted URL predicate, controller execution port.
 * @returns Nothing; untrusted senders throw before parsing, dialogs or CLI work.
 * @complexity O(1) registration and frame check; request processing is delegated.
 * @example registerOwnerStoreIpc({ ipcMain, allowed, controller });
 */
export function registerOwnerStoreIpc({ ipcMain, allowed, controller }: {
  ipcMain: { handle: (channel: string, listener: (event: OwnerStoreEvent, input: unknown) => Promise<OwnerStoreReply>) => void };
  allowed: (url: string) => boolean; controller: Pick<OwnerStoreController, 'execute'>;
}, _options = {}): void {
  for (const action of Object.keys(OWNER_STORE_CHANNELS) as OwnerStoreAction[]) {
    ipcMain.handle(OWNER_STORE_CHANNELS[action], (event, input) => {
      // Same S2 boundary: sharing the file URL does not make an embedded subframe sites home.
      if (!event.senderFrame || event.senderFrame.parent !== null || !allowed(event.senderFrame.url)) {
        throw new Error('Shared keys are only available in the sites home window.');
      }
      return controller.execute({ action, input });
    });
  }
}

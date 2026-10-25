/** S3 trusted sites-home bridge. The CLI owns persistence; main owns destinations and scheduling. */
import { createKeyedSerializer } from './keyed-serializer.ts';
import { ownerStoreFailure } from './owner-store-cli.ts';
import { OWNER_STORE_CHANNELS, type OwnerStoreAction, type OwnerStoreCliFields,
  type OwnerStoreReply, type OwnerStoreSyncAttempt } from './contracts/owner-store.ts';

type OwnerStoreRun = <A extends OwnerStoreAction>(input: {
  action: A; fields: OwnerStoreCliFields[A]; siteDir?: string;
}, options?: {}) => Promise<OwnerStoreReply<A>>;
interface OwnerStoreSite { id: string; siteDir: string }
interface OwnerStorePorts {
  run: OwnerStoreRun;
  /** Fresh tracked rows with canonical directories, including stopped and external sites. */
  listSites: () => OwnerStoreSite[];
  pickBackup: (input: { action: 'export' | 'restore' }) => Promise<string | null>;
}
interface OwnerStoreEvent { senderFrame: { url: string; parent: unknown } | null }
type Serialize = <T>(work: () => Promise<T>) => Promise<T>;
export interface OwnerStoreController {
  execute: (input: { action: OwnerStoreAction; input: unknown }, options?: {}) => Promise<OwnerStoreReply>;
  syncOnStart: (input: { siteDir: string }, options?: {}) => Promise<OwnerStoreReply<'sync'> | null>;
}

/** Small strict outer request: destination paths/profile/unknown fields cannot become CLI options.
 * @throws A fixed error for invalid input; no submitted values are interpolated.
 * @complexity O(request bytes), capped at 64 KiB before spawning.
 */
function requestInput({ action, input }: { action: OwnerStoreAction; input: unknown }, _options = {}): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid shared-key request.');
  const fields: Record<OwnerStoreAction, readonly string[]> = { status: [], list: [], put: ['entry'],
    delete: ['entryId', 'expectedRevision'], grant: ['entryId', 'siteId'], revoke: ['entryId', 'siteId'],
    sync: ['siteId'], export: ['passphrase'], restore: ['passphrase'] };
  if (Object.keys(input).some(field => !fields[action].includes(field))) throw new Error('Invalid shared-key request.');
  if (Buffer.byteLength(JSON.stringify(input)) > 64 * 1024) throw new Error('Invalid shared-key request.');
  return input as Record<string, unknown>;
}

/** Resolve a renderer ID against fresh tracked rows; arbitrary directories cannot receive a key.
 * @throws A fixed error for unknown IDs. @complexity O(tracked sites), no database I/O.
 */
function targetSite({ siteId, ports }: { siteId: unknown; ports: OwnerStorePorts }, _options = {}): OwnerStoreSite {
  if (typeof siteId !== 'string') throw new Error('Invalid shared-key site.');
  const site = ports.listSites().find(row => row.id === siteId);
  if (!site) throw new Error('Invalid shared-key site.');
  return site;
}

/** Copy a deduplicated grant set sequentially: no unbounded child-process fan-out.
 * Missing tracked folders become explicit failed outcomes; one failure never skips later sites.
 * @complexity O(tracked sites + grants), one bounded CLI process per distinct destination.
 */
async function syncConsumers({ consumerIds, ports }: {
  consumerIds: string[]; ports: OwnerStorePorts;
}, _options = {}): Promise<OwnerStoreSyncAttempt[]> {
  let rows: OwnerStoreSite[] = [];
  try { rows = ports.listSites(); } catch { /* Every requested destination is reported below. */ }
  const sites = new Map(rows.map(site => [site.siteDir, site]));
  const attempts: OwnerStoreSyncAttempt[] = [];
  for (const consumerId of new Set(consumerIds)) {
    const site = sites.get(consumerId);
    let reply: OwnerStoreReply<'sync'>;
    if (site) reply = await safeRun({ ports, input: { action: 'sync', fields: {}, siteDir: site.siteDir } });
    else reply = ownerStoreFailure({ action: 'sync', code: 'site-unavailable' });
    attempts.push({ siteId: site?.id ?? consumerId, reply });
  }
  return attempts;
}

/** Save before copying; preserve committed success even if reading grants/copying needs a retry.
 * @complexity O(grants + destinations); each copy uses the CLI's deadline and byte limits.
 */
async function putAndSync({ request, ports }: {
  request: Record<string, unknown>; ports: OwnerStorePorts;
}, _options = {}): Promise<OwnerStoreReply<'put'>> {
  const reply = await ports.run({ action: 'put', fields: { entry: request.entry as OwnerStoreCliFields['put']['entry'] } });
  if (!reply.ok) return reply;
  const inventory = await safeRun({ ports, input: { action: 'list', fields: {} } });
  if (!inventory.ok) return { ...reply, syncError: inventory.error };
  const consumers = inventory.data.grants.filter(grant => grant.entry_id === reply.data.entry.id).map(grant => grant.consumer_id);
  return { ...reply, sync: await syncConsumers({ consumerIds: consumers, ports }) };
}

/** Isolate opaque transport failures so a committed put/grant keeps its success and retry details. */
async function safeRun<A extends OwnerStoreAction>({ ports, input }: {
  ports: OwnerStorePorts; input: { action: A; fields: OwnerStoreCliFields[A]; siteDir?: string };
}, _options = {}): Promise<OwnerStoreReply<A>> {
  try { return await ports.run(input); }
  catch { return ownerStoreFailure({ action: input.action, code: 'operation-failed' }); }
}

/** Main maps ID to path, then lets the existing CLI grant/revoke/sync sequence own the copy.
 * @complexity O(tracked sites) plus at most two CLI calls. No renderer path is forwarded.
 */
async function targetRequest({ action, request, ports }: {
  action: 'grant' | 'revoke' | 'sync'; request: Record<string, unknown>; ports: OwnerStorePorts;
}, _options = {}): Promise<OwnerStoreReply> {
  const site = targetSite({ siteId: request.siteId, ports });
  if (action === 'sync') return ports.run({ action, fields: {}, siteDir: site.siteDir });
  const entryId = requiredString({ value: request.entryId });
  if (action === 'revoke') return ports.run({ action, fields: { entryId }, siteDir: site.siteDir });
  const reply = await ports.run({ action, fields: { entryId, consumerId: site.siteDir } });
  if (!reply.ok) return reply;
  return { ...reply, sync: await syncConsumers({ consumerIds: [site.siteDir], ports }) };
}

/** Native dialogs choose the portable backup, never owner.key/db or a renderer-supplied path.
 * The dialog can stay open indefinitely, so only the CLI call joins the queue: an open picker must
 * not stall site-start sync or other shared-key operations.
 * @complexity One dialog plus one bounded CLI call; cancellation never spawns a child.
 */
async function backupRequest({ action, request, ports, serialize }: {
  action: 'export' | 'restore'; request: Record<string, unknown>; ports: OwnerStorePorts; serialize: Serialize;
}, _options = {}): Promise<OwnerStoreReply> {
  const passphrase = requiredString({ value: request.passphrase });
  const filePath = await ports.pickBackup({ action });
  if (filePath === null) return ownerStoreFailure({ action, code: 'cancelled' });
  return serialize(() => ports.run({ action, fields: { filePath, passphrase } }));
}

/** Validate required string fields without exposing content in thrown errors. */
function requiredString({ value }: { value: unknown }, _options = {}): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Invalid shared-key request.');
  return value;
}

/** Fixed-action dispatch; vault payload/revision validation stays with the CLI's existing owner.
 * @complexity O(request bytes) plus delegated work. Unknown actions fail before a spawn.
 */
async function executeRequest({ action, input, ports, serialize }: {
  action: OwnerStoreAction; input: unknown; ports: OwnerStorePorts; serialize: Serialize;
}): Promise<OwnerStoreReply> {
  const request = requestInput({ action, input });
  switch (action) {
    case 'status': case 'list': return ports.run({ action, fields: {} });
    case 'put': return putAndSync({ request, ports });
    case 'delete': return ports.run({ action, fields: { entryId: requiredString({ value: request.entryId }), expectedRevision: request.expectedRevision as number } });
    case 'grant': case 'revoke': case 'sync': return targetRequest({ action, request, ports });
    case 'export': case 'restore': return backupRequest({ action, request, ports, serialize });
    default: { const exhaustive: never = action; throw new Error(`Invalid shared-key action (${typeof exhaustive}).`); }
  }
}

/** Serialize mutations and startup copies using the shell's existing keyed queue.
 * @param ports CLI, current tracked inventory and native backup picker; all effects are injected.
 * @returns Execute and startup-sync ports. Opaque I/O errors become fixed wire failures.
 * @complexity O(grants + destinations) per operation; copies run sequentially, no parallel fan-out.
 * @example const store = createOwnerStoreController({ run, listSites, pickBackup });
 */
export function createOwnerStoreController(ports: OwnerStorePorts, _options = {}): OwnerStoreController {
  const queue = createKeyedSerializer();
  return {
    execute: ({ action, input }, _options = {}) => {
      const serialize: Serialize = work => queue.run('owner-store', work);
      const work = async (): Promise<OwnerStoreReply> => {
        try { return await executeRequest({ action, input, ports, serialize }); }
        catch { return ownerStoreFailure({ action, code: 'operation-failed' }); }
      };
      // Backups queue only their CLI call (backupRequest); everything else runs wholly serialized.
      return action === 'export' || action === 'restore' ? work() : serialize(work);
    },
    syncOnStart: ({ siteDir }, _options = {}) => queue.run('owner-store', async () => {
      try {
        const inventory = await ports.run({ action: 'list', fields: {} });
        if (!inventory.ok) return ownerStoreFailure({ action: 'sync', code: inventory.error.code });
        if (!inventory.data.grants.some(grant => grant.consumer_id === siteDir)) return null;
        return await ports.run({ action: 'sync', fields: {}, siteDir });
      } catch { return ownerStoreFailure({ action: 'sync', code: 'operation-failed' }); }
    }),
  };
}

/** Register nine fixed channels before opening sites home; refuse subframes and navigated pages.
 * @param required Main IPC registration, exact trusted URL predicate, controller execution port.
 * @returns Nothing; untrusted senders throw before parsing, dialogs, inventory or CLI work.
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

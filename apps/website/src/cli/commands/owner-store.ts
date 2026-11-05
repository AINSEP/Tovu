import { providerPluginOf } from "#src/features/project-keys/service";
import type { KeyAttachments } from "#src/features/project-keys/attachments";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { readPromptFromFlags } from "@jini-ai/cli";
import { countLegacyOwnerStore, OwnerStoreBackupError, OwnerStoreRecoveryError, readLegacyOwnerBackup,
  readLegacyOwnerStore, type LegacyOwnerSnapshot } from "@jini-ai/server/owner-store";
import { isCopyableKind, SecretsVaultService, VAULT_KINDS, VaultError,
  type VaultKind, type VaultMeta, type VaultPutInput, type VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import { assertCredentialFreeField } from "#src/contracts/core/credential-token";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { assertTestHomeIsolation, createSitesWorkspace, type SitesWorkspace } from "#src/platform/site-dir/index";
import { mapOwnerApiKey } from './owner-store-mapping.js';
import { openProjectStore } from '#src/server/runtime/composition/project-store';
import { EMPTY_IMPORT, importLegacyKeys, type LegacyImportReport } from "./owner-store-import.js";

/** @file Desktop-to-CLI boundary for Shared Keys. Keys are project references (project.db): this
 * payload process lists and saves them, and imports a legacy owner store or its passphrase backup,
 * which it only ever reads. Nothing here creates, migrates or syncs an owner store, or copies a key
 * into a site. Requests never travel in argv/env.
 * S3 wire v1: one stdin object with userDataDir (Electron's resolved userData, Roaming on Windows),
 * one stdout JSON line {version:1,ok,action,data|error}. No secret values or key hints are returned.
 * put uses {entry}; delete uses {id,expectedRevision} and requires no site grants; import uses {source,apply,filePath?,passphrase?,expectedDigest?} (an apply names its dry run's sourceDigest); status reports the legacy owner.db.
 */
export const OWNER_STORE_ACTIONS = ["status", "list", "put", "delete", "import"] as const;
export type OwnerStoreAction = typeof OWNER_STORE_ACTIONS[number];

/** Stdin contract for S3; kind defaults to vendor, ownership is always Tovu/site-wide.
 * Payload follows the plugin's existing vault format (for example {vendorId, token}).
 */
export type OwnerStoreRequestByAction = {
  status: { userDataDir: string };
  list: { userDataDir: string; store?: 'project' };
  put: { userDataDir: string; store?: 'project'; entry: Pick<VaultPutInput, "id" | "expectedRevision" | "label" | "meta"> & { kind?: VaultKind; provider: string | null; payload: VaultMeta } };
  delete: { userDataDir: string; id: string; expectedRevision: number };
  import: { userDataDir: string; source: 'backup' | 'owner-store'; apply: boolean; filePath?: string; passphrase?: string; expectedDigest?: string };
};

/** Metadata exposed to S3. Deliberately excludes envelopes, payloads, arbitrary meta and last4. */
export interface OwnerStoreEntry {
  id: string; kind: VaultKind; label: string; provider: string | null; revision: number;
  configured: boolean; isDefault: boolean; worksFor: string[];
}
export type OwnerStoreReply = { version: 1; action: OwnerStoreAction } & (
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string } }
);
type Optional = { home?: string; workspace?: SitesWorkspace };
type ProjectTarget = Parameters<typeof importLegacyKeys>[0]["target"];
type OwnerTarget = ProjectTarget & {
  attachments: KeyAttachments;
  find: (id: string) => Promise<import("@jini-ai/platform/secrets/credential-sets").VaultRecord | null>;
};

class OwnerStoreInputError extends Error {
  constructor() { super("Provide a valid owner-store JSON request on stdin."); }
}

/** The import source no longer matches the dry run the apply names (replaced, or no digest given). */
class ImportSourceChangedError extends Error {}
class SharedKeyInUseError extends Error {}

/** Execute one private request, close all handles, and emit exactly one safe JSON line.
 * @param required Commander's action (never credentials).
 * @param optional Injectable stdin/output, exit status, home and workspace.
 * @returns The same wire reply written to stdout; errors set exit code 1 and expose fixed safe details.
 * @complexity O(request + inventory + imported payload bytes); stdin capped at 64 KiB, backups at 32 MiB.
 * @example await runOwnerStoreCommand({ action: "status" });
 */
export async function runOwnerStoreCommand(required: { action: OwnerStoreAction }, optional: {
  readRequest?: () => Promise<string>; output?: (line: string) => void; setExitCode?: (code: number) => void;
} & Optional = {}): Promise<OwnerStoreReply> {
  let reply: OwnerStoreReply;
  try {
    const text = await readPromptFromFlags({ flags: { "prompt-file": "-" } }, { maxBytes: 64 * 1024, readStdin: optional.readRequest });
    const request = requestObject({ text });
    assertRequestFields({ action: required.action, request });
    const userDataDir = absolutePath({ value: request.userDataDir });
    // The desktop owns OS profile selection: accepting its resolved directory avoids a second
    // platform policy (especially LocalAppData vs Roaming) and keeps owner files outside sites.
    assertTestHomeIsolation({ homeDir: optional.home ?? homedir() }, { paths: [userDataDir] });
    const handlers: Record<OwnerStoreAction, () => Promise<Record<string, unknown>>> = {
      status: () => legacyStatus({ userDataDir }, optional),
      list: () => withProjectVault({ userDataDir, loadInventory: true, work: async ({ rows }) => ({ entries: rows.map(row => entryView({ row })) }) }, optional),
      put: () => withProjectVault({ userDataDir, work: async target => ({ entry: entryView({ row: await putProjectKey({ target, request }) }) }) }, optional),
      delete: () => withProjectVault({ userDataDir, work: target => deleteProjectKey({ target, request }) }, optional),
      import: () => importRequest({ request, userDataDir }, optional),
    };
    reply = { version: 1, ok: true, action: required.action, data: await handlers[required.action]() };
  } catch (error) {
    reply = { version: 1, ok: false, action: required.action, error: safeError({ error }) };
  }
  // The reply itself is the CLI's structured operation signal. No raw errors, request dumps,
  // database diagnostics or additional logs may share this channel with the desktop protocol.
  (optional.output ?? ((line) => { process.stdout.write(line); }))(`${JSON.stringify(reply)}\n`);
  if (!reply.ok) (optional.setExitCode ?? ((code) => { process.exitCode = code; }))(1);
  return reply;
}

/** Shared Keys uses the same project identity, encryption and vault mutation owner as site tools.
 * Saving never attaches a row or creates a site copy. Inventory runs only for list/import;
 * replacement opens one selected row to preserve its settings and companion fields.
 */
async function withProjectVault<T>({ userDataDir, work, loadInventory = false }: { userDataDir: string; loadInventory?: boolean; work: (target: OwnerTarget) => Promise<T> }, optional: Optional = {}): Promise<T> {
  const home = optional.home ?? homedir();
  const workspace = optional.workspace ?? createSitesWorkspace({}, { homeDir: home, appDataDir: userDataDir });
  const store = await openProjectStore({ sitesHome: workspace.home({}), home, appDataDir: workspace.config({}).appData });
  try {
    const scope = store.vault;
    const vault = new SecretsVaultService({ repo: scope.repo, keyring: scope.keyring, sealer: scope.sealer,
      metaParsers: vaultRegistry({ owner: false }).metaParsers, now: () => new Date().toISOString(), newId: () => randomUUID(),
      authorize: async ({ context }) => {
        if (context.workspaceId !== scope.workspaceId || context.ownerKey !== 'tovu' || context.principalId !== null || !(isCopyableKind[context.kind] || context.kind === "custom" || context.kind === "api-connection")) throw new VaultError({ code: 'context' });
      } });
    // Inventory is a cold explicit list/import only; mutations read one selected identity.
    const kinds: VaultKind[] = [...VAULT_KINDS.filter(kind => isCopyableKind[kind]), "custom", "api-connection"];
    const rows = loadInventory ? (await Promise.all(kinds.map(kind => vault.list({ workspaceId: scope.workspaceId, kind, ownerKey: 'tovu', principalId: null })))).flat().filter(row => ownerKind(row)) : [];
    return await work({ vault, workspaceId: scope.workspaceId, transaction: store.transaction, rows, attachments: store.attachments, find: id => scope.repo.find({ workspaceId: scope.workspaceId, id }) });
  } finally { store.close({}); }
}

/** OAuth/API connection rows remain site-specific; only provider-settings identities are shared. */
function ownerKind({ kind, id }: { kind: VaultKind; id: string }): boolean {
  return isCopyableKind[kind] || kind === "custom" || kind === "api-connection" && providerPluginOf({ keyId: id }) !== undefined;
}

/** Human replacement preserves the saved kind, metadata, companions and provider settings.
 * @complexity One selected read/open and one CAS write per save; no inventory read.
 */
async function putProjectKey({ target, request }: { target: ProjectTarget; request: Record<string, unknown> }): Promise<VaultSummary> {
  const input = { ...putInput({ request }), workspaceId: target.workspaceId, principalId: null };
  if (!ownerKind({ kind: input.kind, id: input.id ?? "" })) throw new OwnerStoreInputError();
  return target.transaction({ run: async () => {
    if (input.expectedRevision === null) return target.vault.put(input);
    const existing = await target.vault.get({ ...input, id: input.id! });
    if (!existing) throw new VaultError({ code: "conflict" });
    const { summary, payload } = existing;
    const replacement = replacementPayload({ kind: summary.kind, previous: payload, incoming: input.payload! });
    return target.vault.put({ ...input, label: summary.label, provider: summary.provider, meta: summary.meta, payload: replacement });
  } });
}

/** Provider state is one atomic settings/secrets pair, using the plugin-state owner's wire shape. */
function replacementPayload({ kind, previous, incoming }: { kind: VaultKind; previous: VaultMeta | null; incoming: VaultMeta }): VaultMeta {
  if (kind !== "api-connection") return { ...previous, ...incoming };
  const value = objectValue({ value: previous?.value });
  const secrets = objectValue({ value: incoming.secrets });
  if (!Object.values(secrets).every(secret => typeof secret === "string")) throw new OwnerStoreInputError();
  return { value: { ...value, secrets: { ...objectValue({ value: value.secrets }), ...secrets } } } as VaultMeta;
}

/** Owner deletion is atomic with its usage check; grants are never silently removed.
 * @complexity One selected metadata read, one key's usage and one CAS delete; no inventory read.
 */
async function deleteProjectKey({ target, request }: { target: OwnerTarget; request: Record<string, unknown> }): Promise<Record<string, unknown>> {
  const id = stringValue({ value: request.id }), expectedRevision = revision({ value: request.expectedRevision });
  return target.transaction({ run: async () => {
    if ((await target.attachments.usersOf({ keyId: id })).length) throw new SharedKeyInUseError();
    const row = await target.find(id);
    if (!row) return { removed: false };
    if (!ownerKind(row)) throw new OwnerStoreInputError();
    return { removed: await target.vault.delete({ workspaceId: target.workspaceId, id, kind: row.kind, ownerKey: "tovu", principalId: null, binding: row.binding, expectedRevision }) };
  } });
}

/** The profile's legacy owner store, never created, migrated or written by this process. */
function legacyFiles({ userDataDir }: { userDataDir: string }, _options = {}) {
  return { filePath: join(userDataDir, 'owner.db'), keyFilePath: join(userDataDir, 'owner.key'), open: openNativeSqlite };
}

/** Read-only state for the desktop's start-up cleanup: only `empty` (0 entries AND 0 grants) may be
 * deleted. A store holding entries is `available` while the dry run would import something new, and
 * `settled` once nothing is new (so the notice stops after an import). No key is read for counting,
 * and nothing is deleted here: the desktop removes an `empty` store after this process has exited.
 * @complexity Two count queries; a dry-run plan only when the store holds entries.
 */
async function legacyStatus({ userDataDir }: { userDataDir: string }, optional: Optional = {}): Promise<Record<string, unknown>> {
  const files = legacyFiles({ userDataDir });
  if (!existsSync(files.filePath)) return { legacy: 'none', entries: 0, grants: 0 };
  const counts = await countLegacyOwnerStore(files);
  if (counts.entries === 0 && counts.grants === 0) return { legacy: 'empty', ...counts };
  // A store that holds data but cannot be planned (lost key, locked project) still says so: the
  // import then reports the precise refusal. Only a clean "nothing new" plan settles it.
  const report = await importRequest({ request: { source: 'owner-store', apply: false }, userDataDir }, optional).catch(() => null);
  return { legacy: report === null || report.items.some(item => item.status === 'new') ? 'available' : 'settled', ...counts };
}

/** Dry run or apply. An empty source (no owner.db, no entries, an empty backup) returns the empty
 * report before project.db is even opened, so it changes nothing anywhere. Each call rereads the
 * source, so the dry run reports a digest of what it read and an apply must name it: a source
 * replaced while the confirmation was open is refused instead of importing keys nobody reviewed.
 * @complexity O(entries + payload bytes); see importLegacyKeys.
 */
async function importRequest({ request, userDataDir }: { request: Record<string, unknown>; userDataDir: string }, optional: Optional = {}): Promise<LegacyImportReport> {
  if (typeof request.apply !== 'boolean') throw new OwnerStoreInputError();
  const snapshot = request.source === 'owner-store' ? await legacyStore({ request, userDataDir }) : await legacyBackup({ request });
  if (snapshot === null || snapshot.entries.length === 0) return EMPTY_IMPORT;
  // The legacy readers order every row, so the same source always serializes the same way.
  const sourceDigest = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  if (request.apply && request.expectedDigest !== sourceDigest) throw new ImportSourceChangedError();
  const entries = await Promise.all(snapshot.entries.map(async entry => entry.ownerKey === 'tovu'
    ? { ...entry, ...await mapOwnerApiKey({ row: entry, payload: entry.payload }) } : entry));
  const report = await withProjectVault({ userDataDir, loadInventory: true, work: target => importLegacyKeys({ snapshot: { ...snapshot, entries }, target }, { apply: request.apply as boolean }) }, optional);
  return { ...report, sourceDigest };
}

/** owner.db read-only; its key is only read. An empty store needs no key and yields nothing. */
async function legacyStore({ request, userDataDir }: { request: Record<string, unknown>; userDataDir: string }, _options = {}): Promise<LegacyOwnerSnapshot | null> {
  if (request.filePath !== undefined || request.passphrase !== undefined) throw new OwnerStoreInputError();
  const files = legacyFiles({ userDataDir });
  if (!existsSync(files.filePath) || (await countLegacyOwnerStore(files)).entries === 0) return null;
  return readLegacyOwnerStore(files, { metaParsers: vaultRegistry({ owner: true }).metaParsers });
}

/** The v1/v2 passphrase backup, read (never moved or deleted) and validated by Jini before use. */
async function legacyBackup({ request }: { request: Record<string, unknown> }, _options = {}): Promise<LegacyOwnerSnapshot | null> {
  if (request.source !== 'backup') throw new OwnerStoreInputError();
  const filePath = absolutePath({ value: request.filePath });
  if (!filePath.endsWith(".tovu-owner-backup")) throw new OwnerStoreInputError();
  const passphrase = stringValue({ value: request.passphrase });
  const envelope = await readPromptFromFlags({ flags: { "prompt-file": filePath } }, { maxBytes: 32 * 1024 * 1024 });
  if (!envelope?.trim()) return null;
  return readLegacyOwnerBackup({ envelope, passphrase });
}

/** Parse bounded JSON without allowing parser diagnostics (which can quote secrets) to escape. */
function requestObject({ text }: { text: string | null }, _options = {}): Record<string, unknown> {
  try {
    if (text === null || Buffer.byteLength(text) > 64 * 1024) throw new OwnerStoreInputError();
    return objectValue({ value: JSON.parse(text) });
  } catch { throw new OwnerStoreInputError(); }
}

/** Unknown fields fail before any file is opened; sensitive input cannot become an accidental
 * future option. These are the per-action additions to the shared userDataDir field.
 */
function assertRequestFields({ action, request }: { action: OwnerStoreAction; request: Record<string, unknown> }, _options = {}): void {
  const fields: Record<OwnerStoreAction, readonly string[]> = { status: [], list: ['store'], put: ["entry", 'store'], delete: ["id", "expectedRevision"],
    import: ['source', 'apply', 'filePath', 'passphrase', 'expectedDigest'] };
  assertFields({ record: request, fields: ["userDataDir", ...fields[action]] });
  if (request.store !== undefined && request.store !== 'project') throw new OwnerStoreInputError();
}

function assertFields({ record, fields }: { record: Record<string, unknown>; fields: readonly string[] }, _options = {}): void {
  if (Object.keys(record).some(field => !fields.includes(field))) throw new OwnerStoreInputError();
}

function objectValue({ value }: { value: unknown }, _options = {}): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OwnerStoreInputError();
  return value as Record<string, unknown>;
}

function stringValue({ value }: { value: unknown }, _options = {}): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) throw new OwnerStoreInputError();
  return value;
}

/** Absolute and free of `..` segments on both separators, so a request cannot walk out of the
 * directory it names (Windows accepts `/` and `\`; drive and UNC roots stay absolute).
 */
function absolutePath({ value }: { value: unknown }, _options = {}): string {
  const path = stringValue({ value });
  if (!isAbsolute(path) || path.split(/[\\/]/).includes("..")) throw new OwnerStoreInputError();
  return path;
}

function revision({ value }: { value: unknown }, _options = {}): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new OwnerStoreInputError();
  return value;
}

/** Tovu's copyable feature scopes; personal/custom credentials never become shared keys.
 * The published vault validates payload/meta; Tovu supplies its existing safe metadata policy.
 * @throws OwnerStoreInputError for malformed input; vault errors retain fixed codes at the wire.
 * @complexity O(entry JSON); no I/O, new CRUD lifecycle or cipher implementation.
 */
function putInput({ request }: { request: Record<string, unknown> }, _options = {}): Omit<VaultPutInput, "workspaceId" | "principalId"> {
  const entry = objectValue({ value: request.entry });
  assertFields({ record: entry, fields: ["id", "kind", "expectedRevision", "label", "provider", "meta", "payload"] });
  const kind = (entry.kind ?? "vendor") as VaultKind;
  assertCopyableKind({ kind });
  const label = stringValue({ value: entry.label });
  const provider = entry.provider === null ? null : stringValue({ value: entry.provider });
  assertCredentialFreeField({ value: label, field: "label" });
  if (provider !== null) assertCredentialFreeField({ value: provider, field: "provider" });
  const expectedRevision = entry.expectedRevision === null ? null : revision({ value: entry.expectedRevision });
  const id = entry.id === undefined ? undefined : stringValue({ value: entry.id });
  if (expectedRevision !== null && id === undefined) throw new OwnerStoreInputError();
  const payload = objectValue({ value: entry.payload }) as VaultMeta;
  const meta = objectValue({ value: entry.meta });

  return { id, kind, ownerKey: "tovu", binding: null, expectedRevision, label, provider, meta, payload };
}

function assertCopyableKind({ kind }: { kind: VaultKind }, _options = {}): void {
  if (![...VAULT_KINDS, "custom"].includes(kind) || !(isCopyableKind[kind] || kind === "custom" || kind === "api-connection")) throw new OwnerStoreInputError();
}

/** Reuse the host's safe-metadata policy on writes and legacy reads. Vendor/custom remains
 * per-site even when its physical vault kind is vendor (the unified credentials representation).
 */
function vaultRegistry({ owner }: { owner: boolean }, _options = {}): ReturnType<typeof createTovuVaultKinds> {
  return createTovuVaultKinds({ policy: {
    validateMeta: ({ kind, meta }) => {
      if (owner && kind === "vendor" && meta.credentialType !== "vendor") throw new VaultError({ code: "invalid-meta" });
      return meta;
    }, legacyPublishCredential: () => undefined, tokenField: () => undefined,
  } });
}

/** Whitelist the read model rather than serializing a vault row that may gain sensitive fields. */
function entryView({ row }: { row: VaultSummary }, _options = {}): OwnerStoreEntry {
  assertCredentialFreeField({ value: row.label, field: "label" });
  if (row.provider !== null) assertCredentialFreeField({ value: row.provider, field: "provider" });
  return { id: row.id, kind: row.kind, label: row.label, provider: row.provider, revision: row.revision,
    configured: row.configured, isDefault: row.isDefault, worksFor: (row.meta.worksFor ?? []) as string[] };
}

/** Never forward Error.message/cause/stack: JSON, crypto and SQLite can embed secret input. */
function safeError({ error }: { error: unknown }, _options = {}): { code: string; message: string } {
  if (error instanceof SharedKeyInUseError) return { code: "key-in-use", message: "This key is still granted to a site. Revoke its site grants before deleting it. Details: P25_KEY_IN_USE; secret values omitted." };
  if (error instanceof OwnerStoreInputError) return { code: "invalid-input", message: error.message };
  if (error instanceof OwnerStoreRecoveryError) return { code: "recovery-required", message: "The older shared-key store cannot be opened. Restore its original owner.key." };
  if (error instanceof OwnerStoreBackupError) return { code: error.code, message: "Import requires a valid encrypted backup." };
  if (error instanceof ImportSourceChangedError) return { code: "source-changed", message: "The import source changed after it was reviewed. Run the import again." };
  if (error instanceof VaultError) return { code: error.code, message: `Shared Keys could not save or remove this entry. Refresh the key list and submit its secure form again. Details: OWNER_STORE_VAULT_${error.code.toUpperCase()}; secret values omitted.` };
  return { code: "operation-failed", message: "Shared Keys could not finish this request. Reopen Shared Keys and retry the selected action. Details: OWNER_STORE_OPERATION_FAILED; secret values omitted." };
}

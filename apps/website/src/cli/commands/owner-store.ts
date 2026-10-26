import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { readPromptFromFlags } from "@jini-ai/cli";
import { exportOwnerStore, openOwnerStore, OwnerStoreBackupError, OwnerStoreRecoveryError,
  restoreOwnerStore, type OwnerPutInput, type OwnerStoreService, type OwnerSyncTarget } from "@jini-ai/server/owner-store";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { isCopyableKind, SecretsVaultService, VAULT_KINDS, VaultError,
  type VaultKind, type VaultMeta, type VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import { assertCredentialFreeField } from "#src/contracts/core/credential-token";
import { EnvOrFileKeyring, inspectSiteKeyMaterial } from "#src/features/webhooks/keyring.env";
import { resolveSiteKeyFingerprint, siteKeySourcesForSiteDir } from "#src/features/webhooks/site-key-sources";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { openNativeSqlite, openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { resolveSiteStorage } from "#src/platform/site-dir/site-storage";
import { resolveWorkspace } from "#src/platform/site-dir/resolve-workspace";
import { assertTestHomeIsolation, createSitesWorkspace, type SitesWorkspace } from "#src/platform/site-dir/sites-home";
import { openProjectStore } from '#src/server/runtime/composition/project-store';

/** @file Desktop-to-CLI boundary: only this payload process opens owner.db. Jini owns the
 * store, grants, copies, key creation and encrypted backups. Requests never travel in argv/env.
 * S3 wire v1: one stdin object with userDataDir (Electron's resolved userData, Roaming on Windows),
 * one stdout JSON line {version:1,ok,action,data|error}. No secret values or key hints are returned.
 * Export/restore use {filePath,passphrase}; put uses {entry}; delete uses {entryId,expectedRevision};
 * grant uses {entryId,consumerId} (canonical site directory); sync/revoke take --site instead.
 */
export const OWNER_STORE_ACTIONS = ["status", "list", "put", "delete", "grant", "revoke", "sync", "export", "restore"] as const;
export type OwnerStoreAction = typeof OWNER_STORE_ACTIONS[number];

/** Stdin contract for S3; kind defaults to vendor, ownership is always Tovu/site-wide.
 * Payload follows the plugin's existing vault format (for example {vendorId, token}).
 */
export type OwnerStoreRequestByAction = {
  status: { userDataDir: string };
  list: { userDataDir: string; store?: 'project' };
  put: { userDataDir: string; store?: 'project'; entry: Pick<OwnerPutInput, "id" | "expectedRevision" | "label" | "meta"> & { kind?: VaultKind; provider: string; payload: VaultMeta } };
  delete: { userDataDir: string; entryId: string; expectedRevision: number };
  grant: { userDataDir: string; entryId: string; consumerId: string };
  revoke: { userDataDir: string; entryId: string };
  sync: { userDataDir: string };
  export: { userDataDir: string; filePath: string; passphrase: string };
  restore: { userDataDir: string; filePath: string; passphrase: string };
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

class OwnerStoreInputError extends Error {
  constructor() { super("Provide a valid owner-store JSON request on stdin."); }
}

/** Execute one private request, close all handles, and emit exactly one safe JSON line.
 * @param required Commander's action and optional local target directory (never credentials).
 * @param optional Injectable stdin/output, exit status, native/store openers, home and workspace.
 * @returns The same wire reply written to stdout; errors set exit code 1 and never expose causes.
 * @complexity O(request + inventory + granted payload bytes); stdin capped at 64 KiB, backups at 32 MiB.
 * @example await runOwnerStoreCommand({ action: "status" });
 */
export async function runOwnerStoreCommand(required: { action: OwnerStoreAction; site?: string }, optional: {
  readRequest?: () => Promise<string>; output?: (line: string) => void; setExitCode?: (code: number) => void;
  openStore?: typeof openOwnerStore; openSite?: typeof openSqliteFileKernel; home?: string; workspace?: SitesWorkspace;
} = {}): Promise<OwnerStoreReply> {
  let reply: OwnerStoreReply;
  try {
    const text = await readPromptFromFlags({ flags: { "prompt-file": "-" } }, { maxBytes: 64 * 1024, readStdin: optional.readRequest });
    const request = requestObject({ text });
    assertRequestFields({ action: required.action, request });
    const userDataDir = absolutePath({ value: request.userDataDir });
    // The desktop owns OS profile selection: accepting its resolved directory avoids a second
    // platform policy (especially LocalAppData vs Roaming) and keeps owner files outside sites.
    assertTestHomeIsolation({ homeDir: optional.home ?? homedir() }, { paths: [userDataDir] });
    const data = request.store === 'project'
      ? await projectRequest({ action: required.action, request, userDataDir }, optional)
      : await ownerRequest({ ...required, request, userDataDir }, optional);
    reply = { version: 1, ok: true, action: required.action, data };
  } catch (error) {
    reply = { version: 1, ok: false, action: required.action, error: safeError({ error }) };
  }
  // The reply itself is the CLI's structured operation signal. No raw errors, request dumps,
  // database diagnostics or additional logs may share this channel with the desktop protocol.
  (optional.output ?? ((line) => { process.stdout.write(line); }))(`${JSON.stringify(reply)}\n`);
  if (!reply.ok) (optional.setExitCode ?? ((code) => { process.exitCode = code; }))(1);
  return reply;
}

/** Legacy grants and encrypted backups retain their owner.db lifecycle and key format. */
async function ownerRequest({ userDataDir, ...input }: {
  action: OwnerStoreAction; site?: string; request: Record<string, unknown>; userDataDir: string;
}, optional: Parameters<typeof runOwnerStoreCommand>[1] = {}): Promise<Record<string, unknown>> {
  mkdirSync(userDataDir, { recursive: true, mode: 0o700 });
  const registry = vaultRegistry({ owner: true });
  const store = await (optional.openStore ?? openOwnerStore)({ filePath: join(userDataDir, 'owner.db'),
    keyFilePath: join(userDataDir, 'owner.key'), open: openNativeSqlite }, { metaParsers: registry.metaParsers });
  try { return await executeRequest({ ...input, store: store.service }, { ...optional, appDataDir: userDataDir }); }
  finally { await store.close(); }
}

/** Shared Keys uses the same project identity, encryption and vault mutation owner as site tools.
 * Saving never attaches a row or creates a legacy copy. O(inventory) metadata, no payload reads.
 */
async function projectRequest({ action, request, userDataDir }: {
  action: OwnerStoreAction; request: Record<string, unknown>; userDataDir: string;
}, optional: Parameters<typeof runOwnerStoreCommand>[1] = {}): Promise<Record<string, unknown>> {
  if (action !== 'list' && action !== 'put') throw new OwnerStoreInputError();
  const home = optional.home ?? homedir();
  const workspace = optional.workspace ?? createSitesWorkspace({}, { homeDir: home, appDataDir: userDataDir });
  const store = await openProjectStore({ sitesHome: workspace.home({}), home });
  try {
    const scope = store.vault;
    const vault = new SecretsVaultService({ repo: scope.repo, keyring: scope.keyring, sealer: scope.sealer,
      metaParsers: vaultRegistry({ owner: false }).metaParsers, now: () => new Date().toISOString(), newId: () => randomUUID(),
      authorize: async ({ context }) => {
        if (context.workspaceId !== scope.workspaceId || context.ownerKey !== 'tovu' || context.principalId !== null || !isCopyableKind[context.kind]) throw new VaultError({ code: 'context' });
      } });
    if (action === 'put') return { entry: entryView({ row: await vault.put({ ...putInput({ request }), workspaceId: scope.workspaceId, principalId: null }) }) };
    const rows = (await Promise.all(VAULT_KINDS.filter(kind => isCopyableKind[kind]).map(kind => vault.list({ workspaceId: scope.workspaceId, kind, ownerKey: 'tovu', principalId: null })))).flat();
    return { entries: rows.filter(row => row.kind !== 'vendor' || row.meta.credentialType === 'vendor').map(row => entryView({ row })), grants: [] };
  } finally { store.close({}); }
}

/** Parse bounded JSON without allowing parser diagnostics (which can quote secrets) to escape. */
function requestObject({ text }: { text: string | null }, _options = {}): Record<string, unknown> {
  try {
    if (text === null || Buffer.byteLength(text) > 64 * 1024) throw new OwnerStoreInputError();
    return objectValue({ value: JSON.parse(text) });
  } catch { throw new OwnerStoreInputError(); }
}

/** Unknown fields fail before any owner files are opened; sensitive input cannot become an
 * accidental future option. These are the per-action additions to the shared userDataDir field.
 */
function assertRequestFields({ action, request }: { action: OwnerStoreAction; request: Record<string, unknown> }, _options = {}): void {
  const fields: Record<OwnerStoreAction, readonly string[]> = { status: [], list: ['store'], put: ["entry", 'store'],
    delete: ["entryId", "expectedRevision"], grant: ["entryId", "consumerId"], revoke: ["entryId"],
    sync: [], export: ["filePath", "passphrase"], restore: ["filePath", "passphrase"] };
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

/** Dispatch remains split at the target boundary: non-target commands never open a site DB.
 * @complexity O(inventory + payload bytes); Jini owns transactions, CAS and per-row copy results.
 */
async function executeRequest({ action, request, store, site }: {
  action: OwnerStoreAction; request: Record<string, unknown>; store: OwnerStoreService; site?: string;
}, options: { openSite?: typeof openSqliteFileKernel; home?: string; workspace?: SitesWorkspace; appDataDir?: string }): Promise<Record<string, unknown>> {
  switch (action) {
    case "status": return { ready: true, entries: (await store.list({})).length, grants: (await store.grants({})).length };
    case "list": return { entries: (await store.list({})).map(row => entryView({ row })), grants: await store.grants({}) };
    case "put": return { entry: entryView({ row: await store.put(putInput({ request })) }) };
    case "delete": return { deleted: await store.delete({ entryId: stringValue({ value: request.entryId }),
      expectedRevision: revision({ value: request.expectedRevision }) }) };
    case "grant": {
      const consumerId = realpathSync(absolutePath({ value: request.consumerId }));
      await store.grant({ entryId: stringValue({ value: request.entryId }), consumerId });
      return { granted: true, consumerId };
    }
    case "export": return exportBackup({ request, store });
    case "restore": return restoreBackup({ request, store });
    case "sync": case "revoke": return targetRequest({ action, request, store, site }, options);
    default: return unhandledAction({ action });
  }
}

function unhandledAction(_required: { action: never }, _options = {}): never {
  throw new OwnerStoreInputError();
}

/** Tovu's copyable feature scopes; personal/custom credentials never acquire owner grants.
 * The published vault validates payload/meta; Tovu supplies its existing safe metadata policy.
 * @throws OwnerStoreInputError for malformed input; vault errors retain fixed codes at the wire.
 * @complexity O(entry JSON); no I/O, new CRUD lifecycle or cipher implementation.
 */
function putInput({ request }: { request: Record<string, unknown> }, _options = {}): OwnerPutInput {
  const entry = objectValue({ value: request.entry });
  assertFields({ record: entry, fields: ["id", "kind", "expectedRevision", "label", "provider", "meta", "payload"] });
  const kind = (entry.kind ?? "vendor") as VaultKind;
  assertCopyableKind({ kind });
  const label = stringValue({ value: entry.label });
  const provider = stringValue({ value: entry.provider });
  assertCredentialFreeField({ value: label, field: "label" });
  assertCredentialFreeField({ value: provider, field: "provider" });
  const expectedRevision = entry.expectedRevision === null ? null : revision({ value: entry.expectedRevision });
  const id = entry.id === undefined ? undefined : stringValue({ value: entry.id });
  if (expectedRevision !== null && id === undefined) throw new OwnerStoreInputError();
  const payload = objectValue({ value: entry.payload }) as VaultMeta;
  const meta = objectValue({ value: entry.meta });
  // A vendor row with custom subtype is still per-site, even though the physical kind is vendor.
  if (kind === "vendor" && meta.credentialType !== "vendor") throw new OwnerStoreInputError();
  return { id, kind, ownerKey: "tovu", binding: null, expectedRevision, label, provider, meta, payload };
}

function assertCopyableKind({ kind }: { kind: VaultKind }, _options = {}): void {
  if (!VAULT_KINDS.includes(kind as typeof VAULT_KINDS[number]) || !isCopyableKind[kind]) throw new OwnerStoreInputError();
}

/** Reuse the host's safe-metadata policy on writes, copies and restores. Vendor/custom remains
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

/** Canonical folder identity matches desktop tracked-site IDs, including attached :3000 sites.
 * @complexity O(granted payload bytes); copies are individually reported, never silently dropped.
 */
async function targetRequest({ action, request, store, site }: {
  action: "sync" | "revoke"; request: Record<string, unknown>; store: OwnerStoreService; site?: string;
}, options: { openSite?: typeof openSqliteFileKernel; home?: string; workspace?: SitesWorkspace; appDataDir?: string } = {}): Promise<Record<string, unknown>> {
  const siteDir = realpathSync(absolutePath({ value: site }));
  const opened = await openTarget({ siteDir, action }, options);
  try {
    if (action === "revoke") {
      await store.revoke({ entryId: stringValue({ value: request.entryId }), target: opened.target });
      return { revoked: true, consumerId: siteDir };
    }
    const results = await store.syncTo({ target: opened.target });
    // copyToSite can return last4. The desktop needs only the per-entry outcome and fixed code.
    return { consumerId: siteDir, results: results.map(({ id, kind, status, reasonCode }) => ({ id, kind, status, ...(reasonCode === undefined ? {} : { reasonCode }) })) };
  } finally { await opened.close(); }
}

/** Open an existing local site's vault using the SAME placement and key policy as cross-site
 * credential copy. No site boot/migrations, implicit database creation or key generation.
 * @throws On unsupported/uninitialized sites or unavailable/mismatched keys; caller sanitizes.
 * @complexity O(catalog + workspace rows); constant key/file probes before any copy.
 */
async function openTarget({ siteDir, action }: { siteDir: string; action: "sync" | "revoke" }, {
  openSite = openSqliteFileKernel, home = homedir(), appDataDir,
  workspace = createSitesWorkspace({}, { homeDir: home, appDataDir }),
}: { openSite?: typeof openSqliteFileKernel; home?: string; workspace?: SitesWorkspace; appDataDir?: string } = {}): Promise<{
  target: OwnerSyncTarget; close: () => Promise<void>;
}> {
  if (resolveSiteStorage(siteDir).kind !== "sqlite") throw new OwnerStoreInputError();
  const resolved = resolveSiteDatabasePaths({ dir: siteDir }, { workspace, reserveIdentity: false });
  if (!existsSync(resolved.contentDbPath)) throw new OwnerStoreInputError();
  const kernel = openSite<SecretsVaultDatabase>(resolved.contentDbPath);
  try {
    const workspaceRow = await resolveWorkspace({ kernel: kernel as unknown as ContentKernel });
    const sources = siteKeySourcesForSiteDir({ siteDir, mode: "local", env: {}, home, cwd: siteDir });
    // Revoke is metadata-only: losing the destination key must not prevent deleting a copy.
    if (action === "sync") assertTargetKey({ sources, siteDir });
    const keyring = new EnvOrFileKeyring({ sources }, { env: () => ({}) });
    const registry = vaultRegistry({ owner: false });
    const vault = new SecretsVaultService({ repo: new SqlSecretsVaultRepo({ kernel }), keyring,
      sealer: new AesGcmSecretSealer({ keyring }), metaParsers: registry.metaParsers,
      now: () => new Date().toISOString(), newId: () => randomUUID(), authorize: async ({ context }) => {
        if (context.workspaceId !== workspaceRow.id || context.ownerKey !== "tovu" || context.principalId !== null) throw new VaultError({ code: "context" });
        if ("binding" in context && context.binding !== null) throw new VaultError({ code: "context" });
      } });
    return { target: { consumerId: siteDir, workspaceId: workspaceRow.id, vault }, close: () => kernel.close() };
  } catch (error) { await kernel.close(); throw error; }
}

/** Readers never mint keys or consult this CLI process's ambient TOVU_SITE_KEY. */
function assertTargetKey({ sources, siteDir }: {
  sources: ReturnType<typeof siteKeySourcesForSiteDir>; siteDir: string;
}, _options = {}): void {
  const status = inspectSiteKeyMaterial({ sources }, { env: () => ({}) });
  const fingerprint = resolveSiteKeyFingerprint({ siteDir });
  if (!status.active || (fingerprint !== undefined && fingerprint !== status.fingerprint)) throw new OwnerStoreInputError();
}

/** Encrypted backups are a separate portable file; exclusive writes cannot clobber owner.key/db.
 * @complexity O(snapshot bytes) memory and bounded Jini scrypt work; no plaintext on stdout.
 */
async function exportBackup({ request, store }: { request: Record<string, unknown>; store: OwnerStoreService }, _options = {}): Promise<Record<string, unknown>> {
  const filePath = backupPath({ request });
  const envelope = await exportOwnerStore({ store, passphrase: stringValue({ value: request.passphrase }) });
  await writeFile(filePath, envelope, { flag: "wx", mode: 0o600 });
  return { exported: true };
}

/** Jini authenticates before one empty-store restore transaction; grants are deliberately absent.
 * @complexity O(backup bytes), at most 32 MiB read; bounded Jini KDF work.
 */
async function restoreBackup({ request, store }: { request: Record<string, unknown>; store: OwnerStoreService }, _options = {}): Promise<Record<string, unknown>> {
  const filePath = backupPath({ request });
  const envelope = await readPromptFromFlags({ flags: { "prompt-file": filePath } }, { maxBytes: 32 * 1024 * 1024 });
  return restoreOwnerStore({ store, envelope: stringValue({ value: envelope }), passphrase: stringValue({ value: request.passphrase }) });
}

function backupPath({ request }: { request: Record<string, unknown> }, _options = {}): string {
  const filePath = absolutePath({ value: request.filePath });
  if (!filePath.endsWith(".tovu-owner-backup")) throw new OwnerStoreInputError();
  return filePath;
}

/** Never forward Error.message/cause/stack: JSON, crypto and SQLite can embed secret input. */
function safeError({ error }: { error: unknown }, _options = {}): { code: string; message: string } {
  if (error instanceof OwnerStoreInputError) return { code: "invalid-input", message: error.message };
  if (error instanceof OwnerStoreRecoveryError) return { code: "recovery-required", message: "Restore the original owner.key, or restore an encrypted backup into an empty owner store." };
  if (error instanceof OwnerStoreBackupError) return { code: error.code, message: "Restore requires a valid encrypted backup and an empty owner store." };
  if (error instanceof VaultError) return { code: error.code, message: "The credential operation was refused. Refresh the inventory and grants before retrying." };
  return { code: "operation-failed", message: "The owner-store operation failed. Check the store, site key and backup passphrase before retrying." };
}

import { sql } from "kysely";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { buildVaultAad, type VaultQuery, type VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SealedSecret, SecretSealerPort, SiteKeyHandle } from "@jini-ai/platform/secrets";
import type { ContentKernel } from "./content-kernel.js";
import type { StorageKernel } from "./kernel/port.js";
import { listColumns, listTables } from "./kernel/dialect.js";
import { deviceAad } from "./repos/oauth-pending-store.js";

/** @file Host inventory over Jini's vault plus catalog coverage for unknown sealed columns.
 * Jini owns vault persistence and AAD; the host scan adds unknown plugin columns and the retained
 * device-code store (`oauth_device_authorizations`).
 * Catalog discovery must remain: a plugin's unregistered sealed table must never disappear from
 * the count guarding a key replacement. Restore copies are artifacts, not live credentials.
 * Only safe identity and enum reasons leave this module; payloads, metadata, hints and errors do not.
 */
export type OpensUnderActiveKey = true | false | "unknown";
export type SealedCredentialUnknownReason = "no-descriptor" |
  "incomplete-sealed-row" | "unrecognized-aad-version" | "unsupported-alg" | "no-site-key" | "active-key-unavailable";
export interface SealedCredentialEntry {
  table: string; column: string; workspaceId: string | null; rowId: string | null;
  label: string; sealedKeyId: string | null; opensUnderActiveKey: OpensUnderActiveKey;
  unknownReason: SealedCredentialUnknownReason | null;
}
export interface SealedColumnSummary {
  table: string; column: string; coverage: "classified" | "no-descriptor"; sealedRows: number;
}
export interface SealedCredentialInventory {
  activeKeyId: string | null; columns: readonly SealedColumnSummary[]; entries: readonly SealedCredentialEntry[];
  /** Configurations without envelopes survive discard and do not count as sealed values. */
  metadataOnly: readonly Pick<SealedCredentialEntry, "workspaceId" | "rowId" | "label">[];
  /** Envelopes still awaiting the host boot/recovery codec. */
  legacySealed: number;
  totals: { sealed: number; opens: number; doesNotOpen: number; unknown: number };
}
export interface VaultCredentialKeyDeps {
  kernel: ContentKernel; sealer: Pick<SecretSealerPort, "open">;
  /** The host's migration codec chooses precisely one legacy AAD; ordinary rows use Jini's AAD. */
  aadFor?: (input: { record: VaultRecord }) => string | undefined;
}
export interface SealedCredentialInventoryDeps extends VaultCredentialKeyDeps {
  sealer: Pick<SecretSealerPort, "seal" | "open">; keyring: Pick<KeyringPort, "activeKey">;
  /** Prevent a file-generating keyring from minting a key merely to inspect locked data. */
  hasSiteKeySource: () => boolean;
}
export interface SealedCredentialInventoryOptions { maxEntries?: number }
export class SealedCredentialInventoryLimitError extends Error {
  readonly sealedRows: number; readonly maxEntries: number;
  constructor(input: { sealedRows: number; maxEntries: number }) {
    super("Sealed credential inventory exceeds its limit; refusing an understated count");
    this.name = "SealedCredentialInventoryLimitError";
    this.sealedRows = input.sealedRows; this.maxEntries = input.maxEntries;
  }
}
export interface DiscoveredSealedColumn {
  table: string; column: string; tableColumns: ReadonlySet<string>; notNull: boolean;
}
/** Internal snapshot. Never serialize it: envelopes and vault metadata are private. */
export interface VaultCredentialValue {
  ref: DiscoveredSealedColumn; sealed: SealedSecret | null; ciphertext: string;
  entry: Pick<SealedCredentialEntry, "table" | "column" | "workspaceId" | "rowId" | "label" | "sealedKeyId">;
  record?: VaultRecord; device?: { workspaceId: string; serverId: string };
  guard?: Record<string, unknown>;
  aad: string | undefined; reason: SealedCredentialUnknownReason | null;
}
export interface VaultCredentialSnapshot {
  values: VaultCredentialValue[]; metadataOnly: SealedCredentialInventory["metadataOnly"]; columns: SealedColumnSummary[];
}

/** Quad siblings for a catalog name, quoted verbatim by callers. */
export function siblingColumns(column: string): { keyId: string; nonce: string; alg: string } {
  const prefix = column.slice(0, -"sealed_ciphertext".length);
  return { keyId: `${prefix}sealed_key_id`, nonce: `${prefix}sealed_nonce`, alg: `${prefix}sealed_alg` };
}
/** Shared restore-artifact classification for inventory and the key-minting gate. */
export function isVaultRestoreArtifact({ table }: { table: string }, _options = {}): boolean {
  return table.startsWith("_vault_backup_");
}
/** Catalog truth, in code-unit order. O(t) catalog reads for t live tables. */
export async function discoverSealedColumns(kernel: ContentKernel): Promise<DiscoveredSealedColumn[]> {
  const catalog = kernel as unknown as StorageKernel<unknown>;
  const refs: DiscoveredSealedColumn[] = [];
  for (const table of (await listTables(catalog)).sort()) {
    if (isVaultRestoreArtifact({ table })) continue;
    const columns = await listColumns(catalog, table);
    const tableColumns = new Set(columns.map(column => column.name));
    for (const column of columns) {
      if (column.name.endsWith("sealed_ciphertext")) refs.push({ table, column: column.name, tableColumns, notNull: column.notNull });
    }
  }
  return refs;
}
/** Use the owning Jini adapter's row decoding, one read per kind/owner/principal group, never per row. */
async function readVault({ deps, ref }: { deps: VaultCredentialKeyDeps; ref: DiscoveredSealedColumn }): Promise<{
  values: VaultCredentialValue[]; metadataOnly: SealedCredentialInventory["metadataOnly"];
}> {
  const repo = new SqlSecretsVaultRepo({ kernel: deps.kernel as unknown as StorageKernel<SecretsVaultDatabase> });
  const scopes = await deps.kernel.query<{ workspace_id: string; kind: VaultQuery["kind"]; owner_key: string; principal_id: string | null }>(sql`
    SELECT DISTINCT workspace_id,kind,owner_key,principal_id FROM secrets_vault ORDER BY workspace_id,kind,owner_key`);
  const values: VaultCredentialValue[] = [];
  const metadataOnly: Array<SealedCredentialInventory["metadataOnly"][number]> = [];
  for (const scope of scopes) {
    for (const record of await repo.list({ workspaceId: scope.workspace_id, kind: scope.kind, ownerKey: scope.owner_key, principalId: scope.principal_id })) {
      // The kind and ID are safe handles. Never trust arbitrary metadata or a legacy label here.
      const identity = { workspaceId: record.workspaceId, rowId: record.id, label: `${record.kind} (${record.id})` };
      if (!record.sealed) { metadataOnly.push(identity); continue; }
      let aad: string | undefined;
      let reason: SealedCredentialUnknownReason | null = null;
      try {
        if (deps.aadFor) aad = deps.aadFor({ record });
        else if (record.meta.legacyAad !== undefined) reason = "unrecognized-aad-version";
        else aad = buildVaultAad(record);
      } catch { reason = "unrecognized-aad-version"; }
      values.push({ ref, record, sealed: record.sealed, ciphertext: record.sealed.ciphertext, aad, reason,
        entry: { ...identity, table: ref.table, column: ref.column, sealedKeyId: record.sealed.keyId } });
    }
  }
  return { values, metadataOnly };
}
/** Device codes still have a live owner. Other catalog columns remain visible but unclassified. */
async function readOther({ deps, ref }: { deps: VaultCredentialKeyDeps; ref: DiscoveredSealedColumn }): Promise<VaultCredentialValue[]> {
  const siblings = siblingColumns(ref.column);
  const optional = (name: string) => ref.tableColumns.has(name) ? sql.id(name) : sql`NULL`;
  const device = ref.table === "oauth_device_authorizations" && ref.column === "sealed_ciphertext" &&
    ref.tableColumns.has("workspace_id") && ref.tableColumns.has("server_id");
  const rows = await deps.kernel.query<Record<string, unknown>>(sql`SELECT ${sql.id(ref.column)} AS ciphertext,
    ${optional(siblings.keyId)} AS key_id, ${optional(siblings.nonce)} AS nonce, ${optional(siblings.alg)} AS alg,
    ${device ? sql.id("workspace_id") : sql`NULL`} AS workspace_id,
    ${device ? sql.id("server_id") : sql`NULL`} AS server_id FROM ${sql.id(ref.table)} WHERE ${sql.id(ref.column)} IS NOT NULL`);
  return rows.map(row => {
    const sealed = [row.key_id, row.ciphertext, row.nonce, row.alg].every(value => typeof value === "string")
      ? { keyId: row.key_id as string, ciphertext: row.ciphertext as string, nonce: row.nonce as string, alg: row.alg as string } : null;
    const identity = device && typeof row.workspace_id === "string" && typeof row.server_id === "string"
      ? { workspaceId: row.workspace_id, serverId: row.server_id } : undefined;
    return { ref, sealed, ciphertext: String(row.ciphertext),
      guard: Object.fromEntries([[ref.column, row.ciphertext], [siblings.keyId, row.key_id], [siblings.nonce, row.nonce], [siblings.alg, row.alg]]
        .filter(([column]) => ref.tableColumns.has(column as string))), ...(identity ? { device: identity } : {}),
      aad: identity ? deviceAad(identity.workspaceId, identity.serverId) : undefined,
      reason: !sealed ? "incomplete-sealed-row" : identity ? null : "no-descriptor",
      entry: { table: ref.table, column: ref.column, workspaceId: identity?.workspaceId ?? null,
        rowId: identity?.serverId ?? null, label: identity ? `Pending device sign-in (${identity.serverId})` : `Unclassified ${ref.table}.${ref.column}`,
        sealedKeyId: typeof row.key_id === "string" ? row.key_id : null } };
  });
}
/** One consistent snapshot; count first and refuse truncation. O(catalog + groups + rows) reads/storage. */
export async function snapshotVaultCredentials(deps: VaultCredentialKeyDeps,
  { maxEntries = 10_000 }: SealedCredentialInventoryOptions = {},
): Promise<VaultCredentialSnapshot> {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new RangeError("maxEntries must be a positive integer");
  return deps.kernel.transaction(async () => {
    const refs = await discoverSealedColumns(deps.kernel);
    let count = 0;
    for (const ref of refs) {
      const [row] = await deps.kernel.query<{ count: number | string }>(sql`SELECT COUNT(*) AS count FROM ${sql.id(ref.table)} WHERE ${sql.id(ref.column)} IS NOT NULL`);
      count += Number(row?.count ?? 0);
    }
    if (count > maxEntries) throw new SealedCredentialInventoryLimitError({ sealedRows: count, maxEntries });
    const snapshot: VaultCredentialSnapshot = { values: [], metadataOnly: [], columns: [] };
    for (const ref of refs) {
      const read = ref.table === "secrets_vault" && ref.column === "sealed_ciphertext"
        ? await readVault({ deps, ref }) : { values: await readOther({ deps, ref }), metadataOnly: [] };
      snapshot.values.push(...read.values);
      snapshot.metadataOnly = [...snapshot.metadataOnly, ...read.metadataOnly];
      snapshot.columns.push({ table: ref.table, column: ref.column,
        coverage: ref.table === "secrets_vault" || ref.table === "oauth_device_authorizations" ? "classified" : "no-descriptor", sealedRows: read.values.length });
    }
    return snapshot;
  });
}
/** Exactly one selected AAD; failures are safe verdicts, never crypto error strings. */
export async function opensVaultCredential({ value, sealer }: { value: VaultCredentialValue; sealer: VaultCredentialKeyDeps["sealer"] }, _options = {}): Promise<boolean> {
  if (value.reason || !value.sealed) return false;
  try { await sealer.open({ sealed: value.sealed }, { aad: value.aad }); return true; } catch { return false; }
}
/** Probe before classification and after failed opens: a broken active key is unknown, not dead data. */
async function probe({ deps, key }: { deps: SealedCredentialInventoryDeps; key: SiteKeyHandle }): Promise<string | null> {
  try {
    const plaintext = "sealed-credential-inventory-probe";
    const aad = "sealed-credential-inventory-probe:v1";
    const sealed = await deps.sealer.seal({ plaintext, key, aad });
    return await deps.sealer.open({ sealed }, { aad }) === plaintext ? sealed.alg : null;
  } catch { return null; }
}
/** Read-only safe inventory; no key derivation without an existing source, no plaintext output. */
export async function inventoryVaultCredentials(deps: SealedCredentialInventoryDeps,
  options: SealedCredentialInventoryOptions = {},
): Promise<SealedCredentialInventory> {
  const snapshot = await snapshotVaultCredentials(deps, options);
  const present = deps.hasSiteKeySource();
  let key: SiteKeyHandle | null = null;
  if (present) { try { key = await deps.keyring.activeKey({}); } catch { /* Safe unknown verdict below. */ } }
  const alg = key ? await probe({ deps, key }) : null;
  const entries: SealedCredentialEntry[] = [];
  for (const value of snapshot.values) {
    let reason = value.reason;
    let opens: OpensUnderActiveKey = "unknown";
    if (!reason && !present) reason = "no-site-key";
    if (!reason && (!key || !alg)) reason = "active-key-unavailable";
    if (!reason && value.sealed?.alg !== alg) reason = "unsupported-alg";
    if (!reason) {
      opens = await opensVaultCredential({ value, sealer: deps.sealer });
      if (!opens && key && await probe({ deps, key }) === null) { opens = "unknown"; reason = "active-key-unavailable"; }
    }
    entries.push({ ...value.entry, opensUnderActiveKey: opens, unknownReason: reason });
  }
  return { activeKeyId: key?.keyId ?? null, columns: snapshot.columns, entries, metadataOnly: snapshot.metadataOnly,
    legacySealed: snapshot.values.filter(value => value.record?.meta.legacyAad !== undefined).length,
    totals: { sealed: entries.length, opens: entries.filter(row => row.opensUnderActiveKey === true).length,
      doesNotOpen: entries.filter(row => row.opensUnderActiveKey === false).length,
      unknown: entries.filter(row => row.opensUnderActiveKey === "unknown").length } };
}

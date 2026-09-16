import type Database from "better-sqlite3";

import type { KeyringPort, RootKeyHandle, SealedSecret, SecretSealerPort } from "#src/features/webhooks/index";

/**
 * @file Read-only inventory of every sealed credential in `content.db`: which rows exist, what they
 * are (by a non-secret label), which key generation stamped them, and whether each one opens under
 * the root key this process resolves right now.
 *
 * ## Why this exists
 * Every root-key lifecycle design (`ADS-memory/.local-artifacts/agent-reports/2026-09-16-w4-root-key-designs.md`
 * §9) rests on one capability nothing in the product had: knowing exactly which stored credentials
 * a key change would cost. "Replace the key" consent (Design D) and "is anything still sealed under
 * the old key?" (Design C) both trust this answer, so it is built alone, read-only, first.
 *
 * ## Discovery comes from the database catalog, not from a list
 * Sealed columns are found by reading `sqlite_master` + `pragma_table_info` for every column whose
 * name ends in `sealed_ciphertext` (which also catches `external_mcp_servers.oauth_sealed_ciphertext`).
 * A hand-maintained list is how the prior design went wrong: a sealed table with no entry would be
 * invisible to the very count that guards deleting a key. Here, a discovered column with no
 * {@link SealedColumnDescriptor} still yields one entry per sealed row, reported `"unknown"` with
 * reason `"no-descriptor"` — the count never drops because a descriptor is missing. The catalog is
 * the on-disk truth, so a table created by raw SQL, or one the Drizzle schema forgot, is found too.
 *
 * ## No generic cross-table decrypt
 * Each sealed column is opened only through its OWN store's AAD choice, supplied by its descriptor
 * (`sealed-credential-descriptors.sqlite.ts`, which imports each store's own AAD builder). This file
 * never guesses an AAD and never retries a failed open with a different one.
 *
 * ## What `opensUnderActiveKey` means, and when it is `"unknown"`
 * `true` — the store's own `sealer.open(...)` succeeded, exactly as the app itself would open the row
 * today. `false` — that open failed while the root key was demonstrably usable both before the scan
 * and immediately after the failure (a sealer round-trip probe), so the row is sealed under different
 * key material, bound to a different AAD, or corrupt: this key does not open it. `"unknown"` whenever
 * that cannot be established — never a guess, never defaulted to `true`. See
 * {@link SealedCredentialUnknownReason} for each case.
 *
 * ## Never emits a secret
 * Only columns a descriptor names as non-secret identity are ever selected besides the sealed quad
 * (`*_sealed_key_id/_ciphertext/_nonce/_alg`). The quad is handed to the sealer and nowhere else; the
 * plaintext `open()` returns is discarded without being bound. Thrown errors are caught without
 * reading their messages; the inventory carries enum reason codes only. Nothing here logs.
 *
 * ## Read-only
 * Every statement is checked with better-sqlite3's `Statement.readonly` before it runs, and all
 * reads happen in one deferred transaction so the counts and rows are one consistent snapshot. No
 * open (and so no keyring derivation) is attempted when `hasRootKeySource()` reports no key source:
 * a keyring allowed to auto-generate a key file would otherwise MINT one on first use.
 */

const SEALED_CIPHERTEXT_SUFFIX = "sealed_ciphertext";
const DEFAULT_MAX_ENTRIES = 10_000;
const PROBE_PLAINTEXT = "sealed-credential-inventory-probe";
const PROBE_AAD = "sealed-credential-inventory-probe:v1";

/** `true`/`false` only when established; see this file's header for the exact meaning of each. */
export type OpensUnderActiveKey = true | false | "unknown";

/**
 * Why a row's `opensUnderActiveKey` is `"unknown"`. Enum codes only — never an error message.
 * - `no-descriptor`: the column was discovered in the catalog but no descriptor is registered for it.
 * - `descriptor-schema-mismatch`: the descriptor names a column this table does not have, or names
 *   a sealed-quad column as identity (refused so ciphertext can never reach a label).
 * - `descriptor-error`: the descriptor could not read this row's identity (e.g. an unexpected NULL).
 * - `incomplete-sealed-row`: the ciphertext is set but its key id, nonce or alg is missing.
 * - `unrecognized-aad-version`: the row's AAD version is one its store's descriptor does not know.
 * - `unsupported-alg`: the row's alg is not the one this process's sealer produces.
 * - `no-root-key`: no root key source is present, so no open was attempted.
 * - `active-key-unavailable`: the sealer could not round-trip a probe value under the active key.
 */
export type SealedCredentialUnknownReason =
  | "no-descriptor"
  | "descriptor-schema-mismatch"
  | "descriptor-error"
  | "incomplete-sealed-row"
  | "unrecognized-aad-version"
  | "unsupported-alg"
  | "no-root-key"
  | "active-key-unavailable";

/** One sealed blob in one row. A row with two sealed columns yields two entries. */
export interface SealedCredentialEntry {
  readonly table: string;
  /** The sealed ciphertext column (`external_mcp_servers` carries two). */
  readonly column: string;
  /** The owning workspace when the descriptor knows it, else `null` (always `null` when unregistered). */
  readonly workspaceId: string | null;
  /** A non-secret row handle, or `null` when none exists (unregistered, or the key is itself a secret). */
  readonly rowId: string | null;
  /** Human-readable and non-secret: a name, provider, or created-at — never a value or a fragment. */
  readonly label: string;
  /** The row's own `*_sealed_key_id` stamp, or `null` when absent. */
  readonly sealedKeyId: string | null;
  readonly opensUnderActiveKey: OpensUnderActiveKey;
  /** Set exactly when `opensUnderActiveKey` is `"unknown"`. */
  readonly unknownReason: SealedCredentialUnknownReason | null;
}

/**
 * Per discovered sealed column: how it was classified and how many sealed rows it holds.
 * `classified` = a descriptor covers it and fits the table; otherwise the unknown reason its rows carry.
 */
export interface SealedColumnSummary {
  readonly table: string;
  readonly column: string;
  readonly coverage: "classified" | "no-descriptor" | "descriptor-schema-mismatch";
  readonly sealedRows: number;
}

export interface SealedCredentialInventory {
  /** `keyring.activeKey().keyId`, or `null` when it could not be read. */
  readonly activeKeyId: string | null;
  readonly columns: readonly SealedColumnSummary[];
  readonly entries: readonly SealedCredentialEntry[];
  readonly totals: {
    readonly sealed: number;
    readonly opens: number;
    readonly doesNotOpen: number;
    readonly unknown: number;
  };
}

/** A row's non-secret identity values, keyed by DB column name — only the columns its descriptor declared. */
export type SealedRowIdentity = Readonly<Record<string, unknown>>;

/** The AAD a store would open a row with: a string, `undefined` for a legacy no-AAD row, or not decidable. */
export type SealedRowAadSelection =
  | { readonly kind: "aad"; readonly aad: string | undefined }
  | { readonly kind: "unrecognized-aad-version" };

/**
 * How one store's sealed column is identified, labelled, and opened. Each callback receives ONLY
 * the identity columns the descriptor declared — never the ciphertext — so a label cannot leak it.
 */
export interface SealedColumnDescriptor {
  readonly table: string;
  readonly column: string;
  /** Non-secret columns to select for the callbacks below. Never a secret, a tail, or a mask. */
  readonly identityColumns: readonly string[];
  workspaceId(row: SealedRowIdentity): string | null;
  rowId(row: SealedRowIdentity): string | null;
  label(row: SealedRowIdentity): string;
  /** The owning store's own AAD selection for this row, including its `aad_version` branch. */
  aadFor(row: SealedRowIdentity): SealedRowAadSelection;
}

export interface SealedCredentialInventoryDeps {
  /** The `content.db` handle (`ContentDb.$client`). Only read statements are ever run on it. */
  readonly db: Pick<Database.Database, "prepare" | "transaction">;
  readonly sealer: Pick<SecretSealerPort, "seal" | "open">;
  readonly keyring: Pick<KeyringPort, "activeKey">;
  /**
   * Whether a root key source (env var or key file, valid or not) is present right now — e.g.
   * `inspectRootKeyMaterial().source !== "none"`. When `false`, no open is attempted. Wire the
   * sealer over a keyring with `allowFileAutoGenerate: false` too, which also closes the window
   * between this check and the first derivation.
   */
  readonly hasRootKeySource: () => boolean;
  readonly descriptors: readonly SealedColumnDescriptor[];
}

export interface SealedCredentialInventoryOptions {
  /** Refuse (throw) rather than truncate above this many sealed rows. Default 10,000. */
  readonly maxEntries?: number;
}

/** Thrown instead of returning a truncated — and therefore understated — inventory. */
export class SealedCredentialInventoryLimitError extends Error {
  readonly sealedRows: number;
  readonly maxEntries: number;

  constructor(input: { sealedRows: number; maxEntries: number }) {
    super(
      `sealed-credential inventory found ${input.sealedRows} sealed rows, over its limit of ${input.maxEntries}; refusing to return an understated count`
    );
    this.name = "SealedCredentialInventoryLimitError";
    this.sealedRows = input.sealedRows;
    this.maxEntries = input.maxEntries;
  }
}

/** A sealed column found in the catalog, with the full column set of its table. */
export interface DiscoveredSealedColumn {
  readonly table: string;
  readonly column: string;
  readonly tableColumns: ReadonlySet<string>;
}

interface SealedCells {
  readonly keyId: unknown;
  readonly ciphertext: unknown;
  readonly nonce: unknown;
  readonly alg: unknown;
}

interface SnapshotRow {
  readonly identity: SealedRowIdentity;
  readonly cells: SealedCells;
}

type ColumnSnapshot =
  | { readonly kind: "registered"; readonly ref: DiscoveredSealedColumn; readonly descriptor: SealedColumnDescriptor; readonly rows: readonly SnapshotRow[] }
  | { readonly kind: "unclassifiable"; readonly ref: DiscoveredSealedColumn; readonly reason: "no-descriptor" | "descriptor-schema-mismatch"; readonly keyIds: readonly unknown[] };

interface OpenVerdict {
  readonly opens: OpensUnderActiveKey;
  readonly reason: SealedCredentialUnknownReason | null;
}

interface ActiveKeyCheck {
  attemptOpen(input: { cells: SealedCells; aad: string | undefined }): Promise<OpenVerdict>;
}

function unknownVerdict(reason: SealedCredentialUnknownReason): OpenVerdict {
  return { opens: "unknown", reason };
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Runs one statement after proving it cannot write.
 *
 * @throws If the statement is not read-only — a programming error in this file, never data-driven.
 * @complexity O(rows returned).
 */
function readAll(db: Pick<Database.Database, "prepare">, source: string, params: readonly unknown[] = [], raw = false): unknown[] {
  const statement = db.prepare(source);
  if (!statement.readonly) {
    throw new Error("sealed-credential inventory refused to run a statement that can write");
  }
  return raw ? statement.raw(true).all(...params) : statement.all(...params);
}

/** The key-id/nonce/alg columns that sit beside a `<prefix>sealed_ciphertext` column. */
function siblingColumns(column: string): { keyId: string; nonce: string; alg: string } {
  const prefix = column.slice(0, column.length - SEALED_CIPHERTEXT_SUFFIX.length);
  return { keyId: `${prefix}sealed_key_id`, nonce: `${prefix}sealed_nonce`, alg: `${prefix}sealed_alg` };
}

/**
 * Every table column in the database whose name ends in `sealed_ciphertext`, read from the catalog.
 *
 * @complexity O(T·C) for T tables with C columns each — two catalog reads per table.
 */
export function discoverSealedColumns(db: Pick<Database.Database, "prepare">): DiscoveredSealedColumn[] {
  const tables = readAll(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name") as { name: string }[];
  const discovered: DiscoveredSealedColumn[] = [];
  for (const { name: table } of tables) {
    const columns = (readAll(db, "SELECT name FROM pragma_table_info(?)", [table]) as { name: string }[]).map((c) => c.name);
    const tableColumns = new Set(columns);
    for (const column of columns) {
      if (column.endsWith(SEALED_CIPHERTEXT_SUFFIX)) discovered.push({ table, column, tableColumns });
    }
  }
  return discovered;
}

function descriptorKey(input: { table: string; column: string }): string {
  return `${input.table} ${input.column}`;
}

/** The table has every column the descriptor needs, and no identity column is part of a sealed quad. */
function descriptorFits(ref: DiscoveredSealedColumn, descriptor: SealedColumnDescriptor): boolean {
  if (descriptor.identityColumns.some((column) => column.includes("sealed_"))) return false;
  const siblings = siblingColumns(ref.column);
  const needed = [...descriptor.identityColumns, siblings.keyId, siblings.nonce, siblings.alg];
  return needed.every((column) => ref.tableColumns.has(column));
}

/** Only the key-id stamp of each sealed row — for columns this inventory cannot classify. */
function readKeyIds(db: Pick<Database.Database, "prepare">, ref: DiscoveredSealedColumn): unknown[] {
  const { keyId } = siblingColumns(ref.column);
  const keyIdSelect = ref.tableColumns.has(keyId) ? quoteIdentifier(keyId) : "NULL";
  const source = `SELECT ${keyIdSelect} FROM ${quoteIdentifier(ref.table)} WHERE ${quoteIdentifier(ref.column)} IS NOT NULL`;
  return (readAll(db, source, [], true) as unknown[][]).map((row) => row[0]);
}

/** The descriptor's identity columns plus the sealed quad, positionally, so no alias can collide. */
function readRegisteredRows(db: Pick<Database.Database, "prepare">, ref: DiscoveredSealedColumn, descriptor: SealedColumnDescriptor): SnapshotRow[] {
  const siblings = siblingColumns(ref.column);
  const selected = [...descriptor.identityColumns, siblings.keyId, ref.column, siblings.nonce, siblings.alg];
  const source = `SELECT ${selected.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(ref.table)} WHERE ${quoteIdentifier(ref.column)} IS NOT NULL`;
  const width = descriptor.identityColumns.length;
  return (readAll(db, source, [], true) as unknown[][]).map((values) => ({
    identity: Object.fromEntries(descriptor.identityColumns.map((column, index) => [column, values[index]])),
    cells: { keyId: values[width], ciphertext: values[width + 1], nonce: values[width + 2], alg: values[width + 3] },
  }));
}

function snapshotColumn(db: Pick<Database.Database, "prepare">, ref: DiscoveredSealedColumn, descriptor: SealedColumnDescriptor | undefined): ColumnSnapshot {
  if (!descriptor) return { kind: "unclassifiable", ref, reason: "no-descriptor", keyIds: readKeyIds(db, ref) };
  if (!descriptorFits(ref, descriptor)) {
    return { kind: "unclassifiable", ref, reason: "descriptor-schema-mismatch", keyIds: readKeyIds(db, ref) };
  }
  return { kind: "registered", ref, descriptor, rows: readRegisteredRows(db, ref, descriptor) };
}

function countSealedRows(db: Pick<Database.Database, "prepare">, ref: DiscoveredSealedColumn): number {
  const source = `SELECT COUNT(*) AS n FROM ${quoteIdentifier(ref.table)} WHERE ${quoteIdentifier(ref.column)} IS NOT NULL`;
  return (readAll(db, source) as { n: number }[])[0].n;
}

/**
 * Discovery, the limit check, and every row read, in one deferred (read) transaction.
 *
 * @throws {SealedCredentialInventoryLimitError} Above `maxEntries` sealed rows.
 * @complexity O(T·C + R) for the catalog plus R sealed rows.
 */
function takeSnapshot(deps: SealedCredentialInventoryDeps, maxEntries: number): ColumnSnapshot[] {
  const byColumn = new Map(deps.descriptors.map((descriptor) => [descriptorKey(descriptor), descriptor]));
  const read = deps.db.transaction((): ColumnSnapshot[] => {
    const discovered = discoverSealedColumns(deps.db);
    const sealedRows = discovered.reduce((sum, ref) => sum + countSealedRows(deps.db, ref), 0);
    if (sealedRows > maxEntries) throw new SealedCredentialInventoryLimitError({ sealedRows, maxEntries });
    return discovered.map((ref) => snapshotColumn(deps.db, ref, byColumn.get(descriptorKey(ref))));
  });
  return read.deferred();
}

/**
 * Seals and re-opens a constant probe under the active key. Returns the sealer's alg on success,
 * `null` on any failure (whose message is never read).
 */
async function probeSealer(sealer: SealedCredentialInventoryDeps["sealer"], key: RootKeyHandle): Promise<string | null> {
  try {
    const sealed = await sealer.seal({ plaintext: PROBE_PLAINTEXT, key, aad: PROBE_AAD });
    const reopened = await sealer.open({ sealed, aad: PROBE_AAD });
    return reopened === PROBE_PLAINTEXT ? sealed.alg : null;
  } catch {
    return null;
  }
}

function toSealedSecret(cells: SealedCells): SealedSecret | null {
  const { keyId, ciphertext, nonce, alg } = cells;
  if (typeof keyId !== "string" || typeof ciphertext !== "string" || typeof nonce !== "string" || typeof alg !== "string") {
    return null;
  }
  return { keyId, ciphertext, nonce, alg };
}

/**
 * One open through the store-chosen AAD. `false` only when the probe still round-trips right after
 * the failure; otherwise the failure is attributed to the key being unusable, not the row.
 */
async function openWithWorkingKey(input: {
  sealer: SealedCredentialInventoryDeps["sealer"];
  key: RootKeyHandle;
  probeAlg: string;
  sealed: SealedSecret;
  aad: string | undefined;
}): Promise<OpenVerdict> {
  if (input.sealed.alg !== input.probeAlg) return unknownVerdict("unsupported-alg");
  try {
    await input.sealer.open({ sealed: input.sealed, aad: input.aad });
    return { opens: true, reason: null };
  } catch {
    const stillWorks = (await probeSealer(input.sealer, input.key)) !== null;
    return stillWorks ? { opens: false, reason: null } : unknownVerdict("active-key-unavailable");
  }
}

async function readActiveKey(keyring: SealedCredentialInventoryDeps["keyring"]): Promise<RootKeyHandle | null> {
  try {
    return await keyring.activeKey();
  } catch {
    return null;
  }
}

/** Decides once, up front, whether opens can be attempted at all — and never derives with no key source. */
async function createActiveKeyCheck(deps: SealedCredentialInventoryDeps, key: RootKeyHandle | null): Promise<ActiveKeyCheck> {
  if (!deps.hasRootKeySource()) return { attemptOpen: async () => unknownVerdict("no-root-key") };
  const probeAlg = key === null ? null : await probeSealer(deps.sealer, key);
  if (key === null || probeAlg === null) return { attemptOpen: async () => unknownVerdict("active-key-unavailable") };
  return {
    attemptOpen: async ({ cells, aad }) => {
      const sealed = toSealedSecret(cells);
      return sealed === null ? unknownVerdict("incomplete-sealed-row") : openWithWorkingKey({ sealer: deps.sealer, key, probeAlg, sealed, aad });
    },
  };
}

function keyIdText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function describeRow(descriptor: SealedColumnDescriptor, identity: SealedRowIdentity): Pick<SealedCredentialEntry, "workspaceId" | "rowId" | "label"> | null {
  try {
    return { workspaceId: descriptor.workspaceId(identity), rowId: descriptor.rowId(identity), label: descriptor.label(identity) };
  } catch {
    return null;
  }
}

function selectAad(descriptor: SealedColumnDescriptor, identity: SealedRowIdentity): SealedRowAadSelection | null {
  try {
    return descriptor.aadFor(identity);
  } catch {
    return null;
  }
}

async function classifyRegisteredRow(snapshot: Extract<ColumnSnapshot, { kind: "registered" }>, row: SnapshotRow, keyCheck: ActiveKeyCheck): Promise<SealedCredentialEntry> {
  const { table, column } = snapshot.ref;
  const sealedKeyId = keyIdText(row.cells.keyId);
  const described = describeRow(snapshot.descriptor, row.identity);
  const selection = described === null ? null : selectAad(snapshot.descriptor, row.identity);
  if (described === null || selection === null) {
    return { table, column, workspaceId: null, rowId: null, label: `Sealed credential in ${table}.${column}`, sealedKeyId, opensUnderActiveKey: "unknown", unknownReason: "descriptor-error" };
  }
  const verdict =
    selection.kind === "aad" ? await keyCheck.attemptOpen({ cells: row.cells, aad: selection.aad }) : unknownVerdict("unrecognized-aad-version");
  return { table, column, ...described, sealedKeyId, opensUnderActiveKey: verdict.opens, unknownReason: verdict.reason };
}

/** Sequential on purpose: a failed open re-probes the key, and interleaved probes would blur which failure they explain. */
async function classifyRegisteredRows(snapshot: Extract<ColumnSnapshot, { kind: "registered" }>, keyCheck: ActiveKeyCheck): Promise<SealedCredentialEntry[]> {
  const entries: SealedCredentialEntry[] = [];
  for (const row of snapshot.rows) entries.push(await classifyRegisteredRow(snapshot, row, keyCheck));
  return entries;
}

function unclassifiableEntries(snapshot: Extract<ColumnSnapshot, { kind: "unclassifiable" }>): SealedCredentialEntry[] {
  const { table, column } = snapshot.ref;
  const label =
    snapshot.reason === "no-descriptor"
      ? `Sealed credential in unregistered column ${table}.${column}`
      : `Sealed credential in ${table}.${column} (inventory descriptor does not match this table)`;
  return snapshot.keyIds.map((keyId) => ({
    table,
    column,
    workspaceId: null,
    rowId: null,
    label,
    sealedKeyId: keyIdText(keyId),
    opensUnderActiveKey: "unknown",
    unknownReason: snapshot.reason,
  }));
}

function tally(entries: readonly SealedCredentialEntry[]): SealedCredentialInventory["totals"] {
  const count = (opens: OpensUnderActiveKey) => entries.filter((entry) => entry.opensUnderActiveKey === opens).length;
  return { sealed: entries.length, opens: count(true), doesNotOpen: count(false), unknown: count("unknown") };
}

/**
 * Lists every sealed credential in the database. Read-only; see this file's header for the
 * discovery, AAD, honesty and no-secret rules it keeps.
 *
 * @param deps - Database handle, the app's sealer + keyring, a root-key-source check, and the
 *   per-store descriptors (production: `SEALED_COLUMN_DESCRIPTORS`).
 * @returns Entries in catalog order (table name, then column order), per-column summaries, totals.
 * @throws {SealedCredentialInventoryLimitError} Above `options.maxEntries` sealed rows. Database
 *   errors propagate. Sealer and keyring failures never throw — they become `"unknown"` entries.
 * @complexity O(T·C + R) reads for T tables, C columns, R sealed rows; up to three sealer calls per
 *   row that fails to open (the open plus a two-call probe), one call per row that opens.
 */
export async function listSealedCredentials(deps: SealedCredentialInventoryDeps, options: SealedCredentialInventoryOptions = {}): Promise<SealedCredentialInventory> {
  const snapshots = takeSnapshot(deps, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const activeKey = await readActiveKey(deps.keyring);
  const keyCheck = await createActiveKeyCheck(deps, activeKey);
  const entries: SealedCredentialEntry[] = [];
  const columns: SealedColumnSummary[] = [];
  for (const snapshot of snapshots) {
    const columnEntries = snapshot.kind === "registered" ? await classifyRegisteredRows(snapshot, keyCheck) : unclassifiableEntries(snapshot);
    entries.push(...columnEntries);
    const coverage = snapshot.kind === "registered" ? "classified" : snapshot.reason;
    columns.push({ table: snapshot.ref.table, column: snapshot.ref.column, coverage, sealedRows: columnEntries.length });
  }
  return { activeKeyId: activeKey?.keyId ?? null, columns, entries, totals: tally(entries) };
}

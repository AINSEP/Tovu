import type { ArchiveMediaSource, ArchiveMediaCopy } from "#src/features/site-backup/archive-media";
import { mkdtemp, rm, statfs, writeFile } from "node:fs/promises";
import { scheduler } from "node:timers/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "kysely";
import { redactSecretShapes } from "#src/contracts/core/secret-redaction";
import { validateValueAgainstSchema, type SettingValueSchema } from "@jini-ai/core/settings";
import type { JsonValue } from "@jini-ai/core/primitives";
import { PUBLISHABLE_SETTINGS } from "#src/features/settings/publish-content";
import { backfillPostSearchIndex } from "#src/features/post/index";
import { SHARE_TABLES, SHARE_LEGACY_PRIVATE_TABLES, SHARE_LIMITS, SiteShareRefusal, type ShareDatabaseProjection } from "#src/features/site-backup/share-policy";
import { requireShareSecretFree } from "#src/features/site-backup/share-file-policy";
import { computeBlobStorageKey, documentContentType } from "#src/features/media/index";
import { listColumns, listTables } from "../../../platform/db/kernel/dialect.js";
import { openSqliteFileKernel, sqliteKernel, sqliteClientOf, sqliteConnectionOf, closeSqliteConnection } from "../../../platform/db/kernel/drivers/sqlite.js";
import type { StorageKernel } from "../../../platform/db/kernel/port.js";
import { CHAT_TABLE_NAMES } from "../../../platform/db/sqlite/chat-orphan-check.js";
import { openContentDb } from "../../../platform/db/sqlite/content-db.js";
import { declareDataModule, type DataModuleDecl, type TableDecl } from "#src/features/plugins/data-module";

type Row = Record<string, unknown>;
type Tables = Record<string, Row>;
type Kernel = StorageKernel<Tables>;
/** Free-space probe for the private staging directory (`node:fs/promises` `statfs` by default). */
export type StagingSpacePort = (path: string) => Promise<{ bavail: number; bsize: number }>;

/** Build only present portable plugin tables through the existing trusted DDL owner.
 * Private tables contribute neither schema nor rows. O(declared tables + columns).
 * `modules` is the trusted bundled registry; tests pass their own typed declarations.
 * @throws SiteShareRefusal if the trusted declaration cannot be installed.
 */
export async function prepareSharePluginTables(required: { target: Kernel; present: ReadonlySet<string>; modules: readonly DataModuleDecl[] }, _optional: Record<string, never> = {}): Promise<{ portable: Set<string>; private: Set<string> }> {
  const portable = new Set<string>();
  const privateTables = new Set<string>();
  for (const decl of required.modules) {
    const plan = sharePluginPlan({ decl, present: required.present });
    plan.portable.forEach(name => portable.add(name));
    plan.private.forEach(name => privateTables.add(name));
    if (plan.tables.length) await declarePortableTables({ target: required.target, decl, tables: plan.tables });
  }
  return { portable, private: privateTables };
}

/** One trusted declaration's share plan: its present portable tables trimmed to their policy
 * columns, and the physical names of its private tables (present or not). Pure; O(tables + columns).
 * @throws SiteShareRefusal when a portable policy names a column the table does not declare.
 */
function sharePluginPlan(required: { decl: DataModuleDecl; present: ReadonlySet<string> }, _options: Record<string, never> = {}): { tables: TableDecl[]; portable: string[]; private: string[] } {
  const plan: { tables: TableDecl[]; portable: string[]; private: string[] } = { tables: [], portable: [], private: [] };
  for (const table of required.decl.tables) {
    const name = `p_${required.decl.pluginId}__${table.name}`;
    const policy = table.portability;
    if (policy?.kind === "private") plan.private.push(name);
    if (policy?.kind !== "portable" || !required.present.has(name)) continue;
    plan.portable.push(name);
    plan.tables.push(portableColumnsOnly({ name, table, columns: policy.columns }));
  }
  return plan;
}

/** The table declaration narrowed to exactly its portable policy columns. O(columns × policy columns).
 * @throws SiteShareRefusal when the policy names a column the declaration lacks. */
function portableColumnsOnly(required: { name: string; table: TableDecl; columns: readonly string[] }, _options: Record<string, never> = {}): TableDecl {
  const columns = required.table.columns.filter(column => required.columns.includes(column.name));
  if (columns.length !== required.columns.length) throw new SiteShareRefusal({ code: "UNSUPPORTED_SCHEMA", message: `Invalid portable columns for '${required.name}': its portability policy names a column the table does not declare.` });
  return { ...required.table, columns };
}

/** Installs the trimmed portable tables through `declareDataModule`, the trusted DDL owner.
 * @throws SiteShareRefusal carrying the declaration error when the owner refuses. */
async function declarePortableTables(required: { target: Kernel; decl: DataModuleDecl; tables: TableDecl[] }, _options: Record<string, never> = {}): Promise<void> {
  const result = await declareDataModule({ db: required.target, dbPath: ":memory:", decl: { ...required.decl, tables: required.tables } });
  if (!result.ok) throw new SiteShareRefusal({ code: "UNSUPPORTED_SCHEMA", message: `Cannot build portable plugin schema for '${required.decl.pluginId}': ${result.error?.message}` });
}

/** Never execute source DDL. Even an unknown empty table contributes no schema. O(tables).
 * `listTables` already omits SQLite's own `sqlite_*` tables. */
async function refuseUnknownTables(source: Kernel, trusted: Set<string>): Promise<void> {
  for (const table of await listTables(source)) {
    if (trusted.has(table) || SHARE_LEGACY_PRIVATE_TABLES.has(table) || CHAT_TABLE_NAMES.includes(table) || table.startsWith("_vault_backup_")) continue;
    const rows = await source.query<{ found: number }>(sql`SELECT 1 AS found FROM ${sql.id(table)} LIMIT 1`);
    if (rows.length) throw new SiteShareRefusal({ code: "UNSUPPORTED_DATA", message: `Cannot share unsupported nonempty table '${table}'. Add an approved portable-data policy for this table first.` });
  }
}

// Only the additive Library/source columns may be absent in an older share. Never accept an
// archive's DDL. Plugin owners explicitly allow dropping fields outside their column policy.
const ADDITIVE_COLUMN_DEFAULTS: ReadonlyMap<string, Row> = new Map<string, Row>([
  ["media", { kind: "media", original_filename: null, source_metadata_json: null }],
  ["asset_blobs", { document_owned: 0 }],
]);

/** Refuses a source table whose columns differ from the trusted target schema: an extra source
 * column (unless a portable plugin table, whose extra fields are dropped) or a missing column with
 * no additive default. Pure; O(columns²) over two short column lists.
 * @throws SiteShareRefusal UNSUPPORTED_SCHEMA naming the table. */
function requireTrustedColumns(required: { table: string; columns: string[]; sourceColumns: string[]; defaults: Row }, { portablePlugin = false }: { portablePlugin?: boolean } = {}): void {
  const extra = !portablePlugin && required.sourceColumns.some(column => !required.columns.includes(column));
  const missing = required.columns.some(column => !required.sourceColumns.includes(column) && !Object.hasOwn(required.defaults, column));
  if (extra || missing) throw new SiteShareRefusal({ code: "UNSUPPORTED_SCHEMA", message: `Cannot share '${required.table}': its columns differ from the trusted current schema. Update the site first.` });
}

/** Copy rows using the trusted schema, preserving only explicit portable plugin columns.
 * Core extension columns still refuse; historical Library columns retain their trusted defaults.
 * O(rows × columns) projection/insertion; rows remain bounded by the snapshot cap.
 * @throws SiteShareRefusal for missing required columns or unapproved core columns.
 */
async function copyTable({ source, target, table }: { source: Kernel; target: Kernel; table: string }, { signal, portablePlugin }: { signal?: AbortSignal; portablePlugin?: boolean } = {}): Promise<void> {
  const columns = (await listColumns(target, table)).map(row => row.name);
  const sourceColumns = (await listColumns(source, table)).map(row => row.name);
  const defaults = ADDITIVE_COLUMN_DEFAULTS.get(table) ?? {};
  requireTrustedColumns({ table, columns, sourceColumns, defaults }, { portablePlugin });
  const rows = await source.run(db => db.selectFrom(table).select(columns.filter(column => sourceColumns.includes(column))).execute());
  const project = await mediaRowProjection({ target, table });
  for (const [index, sourceRow] of rows.entries()) {
    if (index % 1000 === 0) { await scheduler.yield(); signal?.throwIfAborted(); }
    const row = project({ ...defaults, ...sourceRow });
    if (row) await target.run(db => db.insertInto(table).values(row).execute());
  }
}

const SIDECAR_TABLES: readonly string[] = ["media_slug_history", "asset_blobs", "asset_renditions"];

/** Who owns which bytes, from the retained (already projected) `media` rows. */
interface MediaOwners {
  readonly byId: ReadonlyMap<string, Row>;
  readonly byHash: ReadonlyMap<string, { document: boolean; media: boolean }>;
  /** Blob keys only a document owns: no active public-media owner shares the bytes. */
  readonly privateKeys: ReadonlySet<string>;
}

/** Workspace-scoped identity key for an owner lookup. O(1). */
function ownerKey(workspace: unknown, identity: unknown): string {
  return JSON.stringify([workspace, identity]);
}

/** Select sidecars from retained editorial owners, never the filesystem or orphan blobs.
 * One bounded owner scan per sidecar table, then O(1) lookup per row; O(media rows) space.
 * Document ownership is sticky even when an active public-media owner shares the bytes.
 */
async function mediaRowProjection(required: { target: Kernel; table: string }, _options: Record<string, never> = {}): Promise<(row: Row) => Row | null> {
  if (required.table === "media") return projectMediaRow;
  if (!SIDECAR_TABLES.includes(required.table)) return row => row;
  const owners = indexMediaOwners({ owners: await required.target.run(db => db.selectFrom("media").selectAll().execute()) });
  if (required.table === "asset_blobs") return row => projectAssetBlob({ row, owners });
  const ownerColumn = required.table === "media_slug_history" ? "media_id" : "asset_id";
  return row => {
    const owner = owners.byId.get(ownerKey(row.workspace_id, row[ownerColumn]));
    if (!owner) return null;
    return required.table === "asset_renditions" ? projectRendition({ row, owner, privateKeys: owners.privateKeys }) : row;
  };
}

/** Ordinary media travels as is; an active document loses its uploader; any other document drops.
 * @throws SiteShareRefusal INVALID_DOCUMENT for a kind other than media/document. O(1). */
function projectMediaRow(row: Row): Row | null {
  if (row.kind !== "media" && row.kind !== "document") throw new SiteShareRefusal({ code: "INVALID_DOCUMENT", message: "Unsupported media kind in share database." });
  if (row.kind === "media") return row;
  return row.status === "active" ? { ...row, created_by: null } : null;
}

/** Indexes the retained media rows by id and by content hash, and derives document-only blob keys.
 * O(media rows) time and space. */
function indexMediaOwners(required: { owners: Row[] }, _options: Record<string, never> = {}): MediaOwners {
  const byId = new Map(required.owners.map(row => [ownerKey(row.workspace_id, row.id), row]));
  const byHash = new Map<string, { document: boolean; media: boolean }>();
  for (const row of required.owners) {
    const hash = ownerKey(row.workspace_id, row.source_sha256);
    const kinds = byHash.get(hash) ?? { document: false, media: false };
    if (row.kind === "document") kinds.document = true;
    else if (row.status === "active") kinds.media = true;
    else {
      // Inactive non-document owners do not grant public media ownership.
    }
    byHash.set(hash, kinds);
  }
  const privateKeys = new Set(required.owners.filter(row => row.kind === "document" && !byHash.get(ownerKey(row.workspace_id, row.source_sha256))?.media)
    .map(row => computeBlobStorageKey({ workspaceId: String(row.workspace_id), sha256: String(row.source_sha256) })));
  return { byId, byHash, privateKeys };
}

/** A blob travels only with a retained owner of its bytes; document bytes stay marked share-owned. O(1). */
function projectAssetBlob(required: { row: Row; owners: MediaOwners }, _options: Record<string, never> = {}): Row | null {
  const kinds = required.owners.byHash.get(ownerKey(required.row.workspace_id, required.row.sha256));
  if (!kinds) return null;
  return { ...required.row, ...(kinds.document || required.row.document_owned === 1 ? { document_owned: 1, created_by_principal: "share" } : {}) };
}

/** A rendition of a retained owner: ordinary owners may not reach document-only bytes; a document
 * keeps only its `original`, which must be its own source blob. O(1).
 * @throws SiteShareRefusal INVALID_DOCUMENT for either forged reference. */
function projectRendition(required: { row: Row; owner: Row; privateKeys: ReadonlySet<string> }, _options: Record<string, never> = {}): Row | null {
  const { row, owner } = required;
  // A public rendition must never borrow a document-only source, even across owners.
  // Check before the import worker remaps keys and loses the source ownership boundary.
  if (owner.kind !== "document") {
    if (required.privateKeys.has(String(row.storage_key))) throw new SiteShareRefusal({ code: "INVALID_DOCUMENT", message: "Ordinary rendition references a private document blob." });
    return row;
  }
  if (row.transform_name !== "original") return null;
  if (row.storage_key !== computeBlobStorageKey({ workspaceId: String(owner.workspace_id), sha256: String(owner.source_sha256) })) throw new SiteShareRefusal({ code: "INVALID_DOCUMENT", message: "Document original rendition has an invalid blob key." });
  return row;
}

/** Validate document identity against its retained blob before reading bytes through storage.
 * O(media + blob rows) time/space; missing/corrupt document references explicitly refuse.
 */
async function documentReferences(required: { target: Kernel }, _options: Record<string, never> = {}): Promise<NonNullable<ShareDatabaseProjection["documents"]>> {
  const blobs = await required.target.run(db => db.selectFrom("asset_blobs").selectAll().execute());
  const byHash = new Map(blobs.map(row => [ownerKey(row.workspace_id, row.sha256), row]));
  const documents = await required.target.run(db => db.selectFrom("media").selectAll().where("kind", "=", "document").execute());
  return documents.map(row => {
    const sha256 = String(row.source_sha256);
    const blob = byHash.get(ownerKey(row.workspace_id, row.source_sha256));
    const storageKey = computeBlobStorageKey({ workspaceId: String(row.workspace_id), sha256 });
    const invalidBlob = !/^[a-f0-9]{64}$/.test(sha256) || !blob || blob.storage_key !== storageKey || blob.status !== "active";
    if (invalidBlob || typeof row.original_filename !== "string") throw new SiteShareRefusal({ code: "INVALID_DOCUMENT", message: "Document source blob is missing or has an invalid key/hash." });
    documentContentType({ filename: row.original_filename });
    return { storageKey, sha256, originalFilename: row.original_filename };
  });
}

/** True when `text` holds anything credential-shaped. O(text). */
function hasSecretShape(required: { text: string }, _options: Record<string, never> = {}): boolean {
  return redactSecretShapes({ text: required.text }).redactions > 0;
}

/**
 * Scans projected text values separately from SQLite's concatenated record encoding.
 * @throws SiteShareRefusal SECRET_IN_CONTENT without exposing a value, column or row.
 * @complexity O(projected bytes) time; O(largest table) space, bounded by the snapshot cap.
 */
async function requireProjectedSecretFree({ target }: { target: Kernel }, _options = {}): Promise<void> {
  for (const table of await listTables(target)) {
    const rows = await target.run(db => db.selectFrom(table).selectAll().execute());
    for (const row of rows) {
      Object.values(row).forEach(value => {
        if (typeof value === "string") requireShareSecretFree({ path: "database/content.db", bytes: Buffer.from(value) });
      });
    }
  }
}

/** Only non-secret portable definitions/workspace values travel. Secret-bearing definitions/values are omitted, never rewritten. */
async function copySettings(source: Kernel, target: Kernel): Promise<void> {
  const definitions = await source.run(db => db.selectFrom("setting_definitions").selectAll().where("secret", "=", 0).where("status", "=", "active").execute());
  for (const definition of definitions) {
    const schema = portableDefinitionSchema({ definition });
    if (!schema) continue;
    await target.run(db => db.insertInto("setting_definitions").values(definition).execute());
    await copyWorkspaceValues({ source, target, definition, schema });
  }
}

/** The value schema of a definition that may travel — workspace-scoped, publishable, secret-free,
 * with a default its own schema accepts — else null. O(definition text).
 * @throws SyntaxError when the stored schema or default is not JSON. */
function portableDefinitionSchema(required: { definition: Row }, _options: Record<string, never> = {}): SettingValueSchema | null {
  const { definition } = required;
  if (!(Number(definition.scopes) & 2) || !Object.hasOwn(PUBLISHABLE_SETTINGS, `${definition.namespace}:${definition.key}`)) return null;
  const schema = JSON.parse(String(definition.schema_json)) as SettingValueSchema;
  // Preserve ordinary SEO text verbatim. A secret anywhere in a definition omits it whole;
  // changing a schema or default to make redaction validate would silently damage the site.
  if (Object.values(definition).some(value => hasSecretShape({ text: String(value) }))) return null;
  const defaultValue = JSON.parse(String(definition.default_json)) as JsonValue;
  return validateValueAgainstSchema(schema, defaultValue) ? schema : null;
}

/** Copies the definition's current-version workspace values that may travel, stamped `share`.
 * O(values × value size). */
async function copyWorkspaceValues(required: { source: Kernel; target: Kernel; definition: Row; schema: SettingValueSchema }, _options: Record<string, never> = {}): Promise<void> {
  const { definition } = required;
  const rows = await required.source.run(db => db.selectFrom("setting_values_workspace").selectAll().where("setting_id", "=", definition.setting_id).where("def_version", "=", definition.version).execute());
  for (const row of rows) {
    const portable = portableValue({ row, schema: required.schema });
    if (portable) await required.target.run(db => db.insertInto("setting_values_workspace").values({ ...row, value_json: JSON.stringify(portable.value), updated_by: "share" }).execute());
  }
}

/** The value one workspace row carries (null when cleared), or null when the row must be omitted:
 * a secret-shaped stored value, or a set value its schema rejects. O(value size).
 * @throws SyntaxError when a set value is not JSON. */
function portableValue(required: { row: Row; schema: SettingValueSchema }, _options: Record<string, never> = {}): { value: JsonValue } | null {
  const { row } = required;
  const value = row.state === "cleared" ? null : JSON.parse(String(row.value_json)) as JsonValue;
  if (hasSecretShape({ text: String(row.value_json) }) || row.state !== "cleared" && !validateValueAgainstSchema(required.schema, value)) return null;
  return { value };
}

/**
 * Build a fresh database from a consistent snapshot through trusted bootstrap only. Source SQL,
 * triggers, search projections and migration rows are never copied. Queries and inserts use the
 * existing storage kernel; source FK order is replaced by the policy's parent-before-child order.
 * Source staging is private/read-only and always removed; the live database is never touched.
 * @throws SiteShareRefusal for caps, unknown populated tables, or unsupported schema.
 * @complexity O(snapshot + portable rows) time/space, bounded to the v1 expanded cap.
 */
export async function sanitizeShareDatabase(required: { snapshot: Buffer; modules: readonly DataModuleDecl[] }, optional: { signal?: AbortSignal; statfs?: StagingSpacePort } = {}): Promise<ShareDatabaseProjection> {
  optional.signal?.throwIfAborted();
  if (required.snapshot.length > SHARE_LIMITS.maxExpandedBytes) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Database exceeds the 300 MiB cap." });
  const staging = await mkdtemp(path.join(tmpdir(), "tovu-share-projection-"));
  let source: Kernel | undefined;
  let fresh: ReturnType<typeof openContentDb> | undefined;
  try {
    const filePath = path.join(staging, "snapshot.db");
    const space = await (optional.statfs ?? statfs)(staging);
    if (space.bavail * space.bsize < required.snapshot.length + 16 * 1024 * 1024) throw new SiteShareRefusal({ code: "INSUFFICIENT_STORAGE", message: "Insufficient private staging space for this database share." });
    await writeFile(filePath, required.snapshot, { flag: "wx", mode: 0o600 });
    source = openSqliteFileKernel<Tables>(filePath, { readOnly: true });
    fresh = openContentDb({ filePath: ":memory:" });
    const target = sqliteKernel<Tables>(fresh);
    const from = source;
    const present = new Set(await listTables(from));
    const plugins = await prepareSharePluginTables({ target, present, modules: required.modules });
    await refuseUnknownTables(source, new Set([...await listTables(target), ...plugins.private]));
    await target.transaction(async () => {
      for (const table of SHARE_TABLES) {
        if (!present.has(table)) throw new SiteShareRefusal({ code: "UNSUPPORTED_SCHEMA", message: `Share requires current table '${table}'. Update this site first.` });
        await copyTable({ source: from, target, table }, { signal: optional.signal });
      }
      for (const table of plugins.portable) await copyTable({ source: from, target, table }, { signal: optional.signal, portablePlugin: true });
      await copySettings(from, target);
    });
    await backfillPostSearchIndex(fresh);
    const documents = await documentReferences({ target });
    const media = [
      ...await target.run(db => db.selectFrom("asset_blobs").select(["storage_key as storageKey", "sha256"]).execute()) as { storageKey: string; sha256: string }[],
      ...await target.run(db => db.selectFrom("asset_renditions").select("storage_key as storageKey").execute()) as { storageKey: string }[],
    ];
    // Older shares included Trash/orphan sidecars. v2 emits only retained owners, so
    // arbitrary unreferenced archive media must refuse rather than be pruned on import.
    await requireProjectedSecretFree({ target });
    const bytes = sqliteClientOf(fresh).serialize();
    requireShareSecretFree({ path: "database/content.db", bytes });
    return { bytes, media, documents, archiveMedia: await archiveMediaSources({ target }) };
  } finally {
    await source?.close();
    if (fresh) closeSqliteConnection(fresh);
    await rm(staging, { recursive: true, force: true });
  }
}

/** Snapshot metadata for the archive selector. Three bulk reads, then indexed lookups per item. */
async function archiveMediaSources({ target }: { target: Kernel }): Promise<ArchiveMediaSource[]> {
  const rows = await target.run(db => db.selectFrom("media").selectAll().execute());
  const blobs = await target.run(db => db.selectFrom("asset_blobs").selectAll().execute());
  const renditions = await target.run(db => db.selectFrom("asset_renditions").selectAll().where("transform_name", "=", "public").execute());
  const transforms = await target.run(db => db.selectFrom("transform_registry").selectAll().where("name", "=", "public").orderBy("version", "asc").execute());
  const byHash = new Map(blobs.map(row => [ownerKey(row.workspace_id, row.sha256), row]));
  const byKey = new Map(blobs.map(row => [String(row.storage_key), row]));
  const definitions = new Map(transforms.map(row => [String(row.workspace_id), row]));
  const publics = new Map(renditions.map(row => [ownerKey(row.workspace_id, [row.asset_id, row.version]), row]));
  return rows.map(row => {
    const blob = byHash.get(ownerKey(row.workspace_id, row.source_sha256));
    if (!blob) throw new SiteShareRefusal({ code: "MISSING_MEDIA", message: `Media '${row.id}' has no source blob.` });
    const definition = definitions.get(String(row.workspace_id));
    const rendition = definition && publics.get(ownerKey(row.workspace_id, [row.id, definition.version]));
    return { id: String(row.id), workspaceId: String(row.workspace_id), slug: String(row.slug ?? row.id), kind: String(row.kind),
      originalFilename: row.original_filename === null ? null : String(row.original_filename), storageKey: String(blob.storage_key), sha256: String(blob.sha256), documentOwned: Boolean(blob.document_owned),
      ...(definition ? { public: { version: Number(definition.version), params: JSON.parse(String(definition.params_json)),
        ...(rendition ? { storageKey: String(rendition.storage_key), sha256: renditionHash({ key: String(rendition.storage_key), blob: byKey.get(String(rendition.storage_key)) }) } : {}) } } : {}) };
  });
}

/** Rewrites only the fresh share projection. No live DB or blob store is changed.
 * Rebuild sidecars so original and latest public point at the same copy; other renditions regenerate.
 * @throws SiteShareRefusal if copies do not cover the snapshot, or secret scanning refuses.
 * @complexity O(media + copies) indexed reads/writes, bounded by the share snapshot cap.
 */
export async function rewriteArchiveMedia(required: { bytes: Buffer; copies: readonly ArchiveMediaCopy[] }, optional: { signal?: AbortSignal } = {}): Promise<Buffer> {
  const staging = await mkdtemp(path.join(tmpdir(), "tovu-archive-media-"));
  let target: Kernel | undefined;
  try {
    const file = path.join(staging, "content.db");
    await writeFile(file, required.bytes, { mode: 0o600, flag: "wx" });
    target = openSqliteFileKernel<Tables>(file);
    await rewriteMediaRows({ target, copies: required.copies }, optional);
    await requireProjectedSecretFree({ target });
    const bytes = sqliteConnectionOf(target)!.serialize();
    requireShareSecretFree({ path: "content.db", bytes });
    return bytes;
  } finally { await target?.close(); await rm(staging, { recursive: true, force: true }); }
}

async function rewriteMediaRows(required: { target: Kernel; copies: readonly ArchiveMediaCopy[] }, optional: { signal?: AbortSignal }): Promise<void> {
  const { target } = required;
  const media = await target.run(db => db.selectFrom("media").selectAll().execute());
  const byId = new Map(media.map(row => [ownerKey(row.workspace_id, row.id), row]));
  const blobs = await target.run(db => db.selectFrom("asset_blobs").selectAll().execute());
  const byHash = new Map(blobs.map(row => [ownerKey(row.workspace_id, row.sha256), row]));
  if (byId.size !== required.copies.length) throw new SiteShareRefusal({ code: "INVALID_MEDIA", message: "Archive media does not cover the snapshot." });
  await target.transaction(async () => {
    await target.run(db => db.deleteFrom("asset_renditions").execute());
    await target.run(db => db.deleteFrom("asset_blobs").execute());
    for (const copy of required.copies) {
      optional.signal?.throwIfAborted();
      const row = byId.get(ownerKey(copy.workspaceId, copy.id));
      if (!row) throw new SiteShareRefusal({ code: "INVALID_MEDIA", message: "Unknown archive media item." });
      await target.run(db => db.updateTable("media").set({ source_sha256: copy.sha256 }).where("id", "=", copy.id).where("workspace_id", "=", copy.workspaceId).execute());
      await target.run(db => db.insertInto("asset_blobs").values(archiveBlobRow({ copy, media: row, existing: byHash.get(ownerKey(copy.workspaceId, copy.sha256)) }))
        .onConflict(oc => oc.columns(["workspace_id", "sha256"]).doUpdateSet({ document_owned: sql`max(document_owned, excluded.document_owned)` })).execute());
      for (const rendition of [{ name: "original", version: 1 }, ...(copy.publicVersion === undefined ? [] : [{ name: "public", version: copy.publicVersion }])]) {
        await target.run(db => db.insertInto("asset_renditions").values({ id: copy.id + ":" + rendition.name, workspace_id: copy.workspaceId, asset_id: copy.id, transform_name: rendition.name, version: rendition.version, storage_key: copy.storageKey, created_at: row.created_at }).execute());
      }
    }
  });
}

/** Preserve unchanged blob metadata and sticky document privacy while replacing its path/hash. */
function archiveBlobRow(required: { copy: ArchiveMediaCopy; media: Row; existing?: Row }): Row {
  const { copy, media } = required;
  const original: Row = required.existing ?? { id: copy.workspaceId + ":" + copy.sha256, created_by_principal: "share", created_at: media.created_at, status: "active", tombstoned_at: null };
  const documentOwned = Boolean(copy.documentOwned || media.kind === "document" || original.document_owned);
  const contentType = copy.contentType === "application/octet-stream" ? original.content_type ?? copy.contentType : copy.contentType;
  return { ...original, workspace_id: copy.workspaceId, sha256: copy.sha256, storage_key: copy.storageKey, content_type: contentType, document_owned: documentOwned ? 1 : 0 };
}

function renditionHash(required: { key: string; blob: Row | undefined }): string | undefined {
  if (typeof required.blob?.sha256 === "string") return required.blob.sha256;
  return /[a-f0-9]{64}$/.exec(required.key)?.[0];
}

import { mkdtemp, rm, statfs, writeFile } from "node:fs/promises";
import { scheduler } from "node:timers/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "kysely";
import { redactSecretShapes } from "#src/contracts/core/secret-redaction";
import { validateValueAgainstSchema, type SettingValueSchema } from "@jini-ai/core/settings";
import type { JsonValue } from "@jini-ai/core/primitives";
import { PUBLISHABLE_SETTINGS } from "#src/features/settings/publish-content";
import { backfillPostSearchIndex } from "#src/features/post/search-index";
import { SHARE_TABLES, SHARE_LEGACY_PRIVATE_TABLES, SHARE_LIMITS, SiteShareRefusal, type ShareDatabaseProjection } from "#src/features/site-backup/share-policy";
import { requireShareSecretFree } from "#src/features/site-backup/share-file-policy";
import { computeBlobStorageKey, documentContentType } from "#src/features/media/index";
import { listColumns, listTables } from "../kernel/dialect.js";
import { openSqliteFileKernel, sqliteKernel, sqliteClientOf, closeSqliteConnection } from "../kernel/drivers/sqlite.js";
import type { StorageKernel } from "../kernel/port.js";
import { CHAT_TABLE_NAMES } from "./chat-orphan-check.js";
import { openContentDb } from "./content-db.js";

type Row = Record<string, unknown>;
type Tables = Record<string, Row>;
type Kernel = StorageKernel<Tables>;

/** Never execute source DDL. Even an unknown empty table contributes no schema. O(tables). */
async function refuseUnknownTables(source: Kernel, trusted: Set<string>): Promise<void> {
  for (const table of await listTables(source)) {
    if (trusted.has(table) || SHARE_LEGACY_PRIVATE_TABLES.has(table) || CHAT_TABLE_NAMES.includes(table) || table.startsWith("sqlite_") || table.startsWith("_vault_backup_")) continue;
    const rows = await source.query<{ found: number }>(sql`SELECT 1 AS found FROM ${sql.id(table)} LIMIT 1`);
    if (rows.length) throw new SiteShareRefusal({ code: "UNSUPPORTED_DATA", message: `Cannot share unsupported nonempty table '${table}'. Add an approved portable-data policy for this table first.` });
  }
}

/** Bound columns to the trusted schema; unexpected extension columns require an explicit policy. */
async function copyTable(source: Kernel, target: Kernel, table: string, signal?: AbortSignal): Promise<void> {
  const columns = (await listColumns(target, table)).map(row => row.name);
  const sourceColumns = (await listColumns(source, table)).map(row => row.name);
  // Only the additive Library columns may be absent in an older share. Never accept an
  // archive's extra columns or substitute its DDL for the trusted destination schema.
  const defaults: Row = table === "media" ? { kind: "media", original_filename: null } : table === "asset_blobs" ? { document_owned: 0 } : {};
  if (sourceColumns.some(column => !columns.includes(column)) || columns.some(column => !sourceColumns.includes(column) && !Object.hasOwn(defaults, column))) throw new SiteShareRefusal({ code: "UNSUPPORTED_SCHEMA", message: `Cannot share '${table}': its columns differ from the trusted current schema. Update the site first.` });
  const rows = await source.run(db => db.selectFrom(table).selectAll().execute());
  const project = await mediaRowProjection({ target, table });
  for (const [index, sourceRow] of rows.entries()) {
    if (index % 1000 === 0) { await scheduler.yield(); signal?.throwIfAborted(); }
    const row = project({ ...defaults, ...sourceRow });
    if (!row) continue;
    await target.run(db => db.insertInto(table).values(row).execute());
  }
}

/** Select sidecars from retained editorial owners, never the filesystem or orphan blobs.
 * One bounded owner scan per sidecar table, then O(1) lookup per row; O(media rows) space.
 * Document ownership is sticky even when an active public-media owner shares the bytes.
 */
async function mediaRowProjection(required: { target: Kernel; table: string }, _options: Record<string, never> = {}): Promise<(row: Row) => Row | null> {
  if (required.table === "media") return row => {
    if (row.kind !== "media" && row.kind !== "document") throw new SiteShareRefusal({ code: "INVALID_DOCUMENT", message: "Unsupported media kind in share database." });
    if (row.kind === "document" && row.status !== "active") return null;
    return row.kind === "document" ? { ...row, created_by: null } : row;
  };
  if (!["media_slug_history", "asset_blobs", "asset_renditions"].includes(required.table)) return row => row;
  const owners = await required.target.run(db => db.selectFrom("media").selectAll().execute());
  const key = (workspace: unknown, identity: unknown) => JSON.stringify([workspace, identity]);
  const byId = new Map(owners.map(row => [key(row.workspace_id, row.id), row]));
  const byHash = new Map<string, { document: boolean; media: boolean }>();
  for (const row of owners) {
    const hash = key(row.workspace_id, row.source_sha256);
    const kinds = byHash.get(hash) ?? { document: false, media: false };
    if (row.kind === "document") kinds.document = true;
    else if (row.status === "active") kinds.media = true;
    byHash.set(hash, kinds);
  }
  const privateKeys = new Set(owners.filter(row => row.kind === "document" && !byHash.get(key(row.workspace_id, row.source_sha256))?.media)
    .map(row => computeBlobStorageKey({ workspaceId: String(row.workspace_id), sha256: String(row.source_sha256) })));
  return row => {
    if (required.table === "asset_blobs") {
      const kinds = byHash.get(key(row.workspace_id, row.sha256));
      if (!kinds) return null;
      return { ...row, ...(kinds.document || row.document_owned === 1 ? { document_owned: 1, created_by_principal: "share" } : {}) };
    }
    const owner = byId.get(key(row.workspace_id, required.table === "media_slug_history" ? row.media_id : row.asset_id));
    if (!owner) return null;
    // A public rendition must never borrow a document-only source, even across owners.
    // Check before the import worker remaps keys and loses the source ownership boundary.
    if (required.table === "asset_renditions" && owner.kind !== "document" && privateKeys.has(String(row.storage_key))) throw new SiteShareRefusal({ code: "INVALID_DOCUMENT", message: "Ordinary rendition references a private document blob." });
    if (required.table === "asset_renditions" && owner.kind === "document") {
      if (row.transform_name !== "original") return null;
      if (row.storage_key !== computeBlobStorageKey({ workspaceId: String(owner.workspace_id), sha256: String(owner.source_sha256) })) throw new SiteShareRefusal({ code: "INVALID_DOCUMENT", message: "Document original rendition has an invalid blob key." });
    }
    return row;
  };
}

/** Validate document identity against its retained blob before reading bytes through storage.
 * O(media + blob rows) time/space; missing/corrupt document references explicitly refuse.
 */
async function documentReferences(required: { target: Kernel }, _options: Record<string, never> = {}): Promise<NonNullable<ShareDatabaseProjection["documents"]>> {
  const blobs = await required.target.run(db => db.selectFrom("asset_blobs").selectAll().execute());
  const byHash = new Map(blobs.map(row => [JSON.stringify([row.workspace_id, row.sha256]), row]));
  const documents = await required.target.run(db => db.selectFrom("media").selectAll().where("kind", "=", "document").execute());
  return documents.map(row => {
    const sha256 = String(row.source_sha256);
    const blob = byHash.get(JSON.stringify([row.workspace_id, row.source_sha256]));
    const storageKey = computeBlobStorageKey({ workspaceId: String(row.workspace_id), sha256 });
    if (!/^[a-f0-9]{64}$/.test(sha256) || !blob || blob.storage_key !== storageKey || blob.status !== "active" || typeof row.original_filename !== "string") throw new SiteShareRefusal({ code: "INVALID_DOCUMENT", message: "Document source blob is missing or has an invalid key/hash." });
    documentContentType({ filename: row.original_filename });
    return { storageKey, sha256, originalFilename: row.original_filename };
  });
}

/** Only non-secret portable definitions/workspace values travel. Secret-bearing definitions/values are omitted, never rewritten. */
async function copySettings(source: Kernel, target: Kernel): Promise<void> {
  const definitions = await source.run(db => db.selectFrom("setting_definitions").selectAll().where("secret", "=", 0).where("status", "=", "active").execute());
  for (const definition of definitions) {
    if (!(Number(definition.scopes) & 2) || !Object.hasOwn(PUBLISHABLE_SETTINGS, `${definition.namespace}:${definition.key}`)) continue;
    const schema = JSON.parse(String(definition.schema_json)) as SettingValueSchema;
    // Preserve ordinary SEO text verbatim. A secret anywhere in a definition omits it whole;
    // changing a schema or default to make redaction validate would silently damage the site.
    if (Object.values(definition).some(value => redactSecretShapes({ text: String(value) }).redactions > 0)) continue;
    const defaultValue = JSON.parse(String(definition.default_json)) as JsonValue;
    if (!validateValueAgainstSchema(schema, defaultValue)) continue;
    await target.run(db => db.insertInto("setting_definitions").values(definition).execute());
    const rows = await source.run(db => db.selectFrom("setting_values_workspace").selectAll().where("setting_id", "=", definition.setting_id).where("def_version", "=", definition.version).execute());
    for (const row of rows) {
      const value = row.state === "cleared" ? null : JSON.parse(String(row.value_json)) as JsonValue;
      if (redactSecretShapes({ text: String(row.value_json) }).redactions > 0 || row.state !== "cleared" && !validateValueAgainstSchema(schema, value)) continue;
      await target.run(db => db.insertInto("setting_values_workspace").values({ ...row, value_json: JSON.stringify(value), updated_by: "share" }).execute());
    }
  }
}

/**
 * Build a fresh database from a consistent snapshot through trusted bootstrap only. Source SQL,
 * triggers, search projections and migration rows are never copied. Queries and inserts use the
 * existing storage kernel; source FK order is replaced by the policy's parent-before-child order.
 * Source staging is private/read-only and always removed; the live database is never touched.
 * @throws SiteShareRefusal for caps, unknown populated tables, or unsupported schema.
 * @complexity O(snapshot + portable rows) time/space, bounded to the v1 expanded cap.
 */
export async function sanitizeShareDatabase(required: { snapshot: Buffer }, optional: { signal?: AbortSignal } = {}): Promise<ShareDatabaseProjection> {
  optional.signal?.throwIfAborted();
  if (required.snapshot.length > SHARE_LIMITS.maxExpandedBytes) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Database exceeds the v1 300 MiB cap." });
  const staging = await mkdtemp(path.join(tmpdir(), "tovu-share-projection-"));
  let source: Kernel | undefined;
  let fresh: ReturnType<typeof openContentDb> | undefined;
  try {
    const filePath = path.join(staging, "snapshot.db");
    const space = await statfs(staging);
    if (space.bavail * space.bsize < required.snapshot.length + 16 * 1024 * 1024) throw new SiteShareRefusal({ code: "INSUFFICIENT_STORAGE", message: "Insufficient private staging space for this database share." });
    await writeFile(filePath, required.snapshot, { flag: "wx", mode: 0o600 });
    source = openSqliteFileKernel<Tables>(filePath, { readOnly: true });
    fresh = openContentDb({ filePath: ":memory:" });
    const target = sqliteKernel<Tables>(fresh);
    await refuseUnknownTables(source, new Set(await listTables(target)));
    const from = source;
    const present = new Set(await listTables(from));
    await target.transaction(async () => {
      for (const table of SHARE_TABLES) {
        if (!present.has(table)) throw new SiteShareRefusal({ code: "UNSUPPORTED_SCHEMA", message: `Share requires current table '${table}'. Update this site first.` });
        await copyTable(from, target, table, optional.signal);
      }
      await copySettings(from, target);
    });
    await backfillPostSearchIndex(fresh);
    const documents = await documentReferences({ target });
    const media = [
      ...await target.run(db => db.selectFrom("asset_blobs").select(["storage_key as storageKey", "sha256"]).execute()) as { storageKey: string; sha256: string }[],
      ...await target.run(db => db.selectFrom("asset_renditions").select("storage_key as storageKey").execute()) as { storageKey: string }[],
    ];
    // Older shares included Trash/orphan sidecars. Only explicitly projected-away keys may
    // be discarded on import; arbitrary unreferenced archive uploads must still refuse.
    const retainedKeys = new Set(media.map(row => row.storageKey));
    const sourceMedia = [
      ...await from.run(db => db.selectFrom("asset_blobs").select("storage_key as storageKey").execute()),
      ...await from.run(db => db.selectFrom("asset_renditions").select("storage_key as storageKey").execute()),
    ];
    const excludedBlobKeys = [...new Set(sourceMedia.map(row => String(row.storageKey)).filter(key => !retainedKeys.has(key)))];
    const bytes = sqliteClientOf(fresh).serialize();
    requireShareSecretFree({ path: "database/content.db", bytes });
    return { bytes, media, documents, excludedBlobKeys };
  } finally {
    await source?.close();
    if (fresh) closeSqliteConnection(fresh);
    await rm(staging, { recursive: true, force: true });
  }
}

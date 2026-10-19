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
  if (columns.join("\0") !== sourceColumns.join("\0")) throw new SiteShareRefusal({ code: "UNSUPPORTED_SCHEMA", message: `Cannot share '${table}': its columns differ from the trusted current schema. Update the site first.` });
  const rows = await source.run(db => db.selectFrom(table).selectAll().execute());
  for (const [index, row] of rows.entries()) {
    if (index % 1000 === 0) { await scheduler.yield(); signal?.throwIfAborted(); }
    await target.run(db => db.insertInto(table).values(row).execute());
  }
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
    const media = [
      ...await target.run(db => db.selectFrom("asset_blobs").select(["storage_key as storageKey", "sha256"]).execute()) as { storageKey: string; sha256: string }[],
      ...await target.run(db => db.selectFrom("asset_renditions").select("storage_key as storageKey").execute()) as { storageKey: string }[],
    ];
    const bytes = sqliteClientOf(fresh).serialize();
    requireShareSecretFree({ path: "database/content.db", bytes });
    return { bytes, media };
  } finally {
    await source?.close();
    if (fresh) closeSqliteConnection(fresh);
    await rm(staging, { recursive: true, force: true });
  }
}

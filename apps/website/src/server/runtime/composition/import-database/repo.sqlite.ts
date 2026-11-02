import { FIRST_PARTY_DATA_MODULES } from "../data-modules.js";
/** Trusted helper entrypoint. Never import archived code or execute source DDL/migrations.
 * SQLite native work is isolated from the serving process and killed by its parent deadline.
 */
import { sql } from "kysely";
import { openSqliteConnection, verifySqliteIntegrity } from "@jini-ai/db/sqlite";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { sqliteKernel, closeSqliteConnection, openNativeSqlite, openSqliteFileKernel, sqliteConnectionOf } from "#src/platform/db/kernel/drivers/sqlite";
import { listColumns } from "#src/platform/db/kernel/dialect";
import { sqliteForeignKeyCheckedTransaction, sqliteSchemaObjects, sqliteTableExtendedInfo, type SqliteSchemaObject } from "#src/platform/db/kernel/sqlite-only";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { sanitizeShareDatabase, prepareSharePluginTables, refuseUnknownShareTables } from "#src/features/site-backup/share-database/repo.sqlite";
import { SHARE_TABLES, IMPORT_SCHEMA_MISMATCH_EXIT_CODE, IMPORT_REFUSAL_EXIT_CODE, SHARE_VERSION_MISMATCH_MESSAGE, SiteShareRefusal, archiveRefusalName } from "#src/features/site-backup/share-policy";
import { readTemplate } from "#src/platform/site-dir/index";
import { computeBlobStorageKey } from "#src/features/media/index";

type ImportKernel = StorageKernel<Record<string, Record<string, unknown>>>;

/** Refuse an unsafe schema object by identity, never echoing its executable SQL.
 * Pure except for throwing INVALID_DATABASE; O(object-name bytes).
 */
function refuseSchemaObject(required: { object: SqliteSchemaObject }, _options = {}): never {
  const { object } = required;
  throw new SiteShareRefusal({ code: "INVALID_DATABASE", message: `Unsupported schema ${object.type} ${JSON.stringify(archiveRefusalName({ name: object.name }))}.` });
}

/** Ordinary column differences can be version drift. Hidden/generated columns
 * and changed DDL with identical column metadata retain their unsafe-schema refusal.
 * Reads metadata only; O(columns) time/space, bounded by the worker's byte/deadline caps.
 */
async function requireOrdinaryColumnChange(required: { source: ImportKernel; target: ImportKernel; object: SqliteSchemaObject }, _options = {}): Promise<void> {
  const actual = await sqliteTableExtendedInfo({ kernel: required.source, table: required.object.name });
  const expected = await sqliteTableExtendedInfo({ kernel: required.target, table: required.object.name });
  if (actual.some(column => column.hidden !== 0) || JSON.stringify(actual) === JSON.stringify(expected)) refuseSchemaObject(required);
}

/** One schema object: identical passes; an undeclared ordinary table (and its indices) is left
 * to the table-policy owner; anything else untrusted refuses by name; a changed table may only
 * be ordinary column drift. Reads metadata only; throws typed refusals.
 */
async function requireTrustedObject(required: { source: ImportKernel; target: ImportKernel; object: SqliteSchemaObject; trusted: SqliteSchemaObject | undefined; ordinaryUndeclared: ReadonlySet<string> }, _options = {}): Promise<void> {
  const { object, trusted } = required;
  if (JSON.stringify(object) === JSON.stringify(trusted)) return;
  // Undeclared ordinary tables and their indices belong to the existing table-policy
  // owner below, which names the populated table rather than its first sorted index.
  if (!trusted && required.ordinaryUndeclared.has(object.tbl_name)) return;
  if (!trusted || object.type !== "table") refuseSchemaObject({ object });
  await requireOrdinaryColumnChange(required);
}

/** Check non-version refusals before mapping ordinary table drift to version advice.
 * No source DDL is executed or accepted. Reads metadata and delegates bounded row-existence
 * checks to the existing table-policy owner; throws typed refusals.
 * O(schema objects + changed-table columns) time/space, plus one existence query per
 * undeclared table, under the worker's input/deadline caps.
 */
async function requireTrustedSchemaObjects(required: { source: ImportKernel; target: ImportKernel; actual: SqliteSchemaObject[]; expected: SqliteSchemaObject[] }, _options = {}): Promise<void> {
  const key = (object: SqliteSchemaObject) => `${object.type}/${object.name}`;
  const actual = new Map(required.actual.map(object => [key(object), object]));
  const expected = new Map(required.expected.map(object => [key(object), object]));
  const undeclaredTables = required.actual.filter(object => object.type === "table" && !expected.has(key(object)));
  const ordinaryUndeclared = new Set(undeclaredTables.filter(table => /^CREATE TABLE\b/i.test(table.sql ?? "")).map(table => table.name));
  for (const object of required.actual) await requireTrustedObject({ ...required, object, trusted: expected.get(key(object)), ordinaryUndeclared });
  await refuseUnknownShareTables({ source: required.source, trusted: new Set(required.expected.filter(object => object.type === "table").map(object => object.name)) });
  if (undeclaredTables.length) refuseSchemaObject({ object: undeclaredTables[0]! });
  // An index/trigger missing with its whole table is table drift; a missing object on a
  // surviving table is an independent unsafe-schema refusal and must win over version advice.
  const missing = required.expected.find(object => object.type !== "table" && actual.has(`table/${object.tbl_name}`) && !actual.has(key(object)));
  if (missing) refuseSchemaObject({ object: missing });
  if (JSON.stringify(required.actual) !== JSON.stringify(required.expected)) throw new SiteShareRefusal({ code: "SCHEMA_VERSION_MISMATCH", message: SHARE_VERSION_MISMATCH_MESSAGE });
}

/** These portable relationships are application-owned rather than SQLite FKs. Identity actor
 * strings are intentionally excluded: the share policy omits source accounts, not attribution.
 * Each join uses existing id/lookup indexes; the helper's byte/deadline caps bound the scan.
 * @throws Error if any fixed relationship is dangling; reads only.
 * @complexity O(portable rows) across six fixed joins, with at most one result per join.
 */
async function validatePortableReferences(required: { db: ImportKernel }, _options: Record<string, never> = {}): Promise<void> {
  const checks = [
    "SELECT 1 FROM nav_location_bindings b LEFT JOIN menus m ON m.workspace_id=b.workspace_id AND m.id=b.menu_id WHERE m.id IS NULL LIMIT 1",
    "SELECT 1 FROM media m LEFT JOIN asset_blobs b ON b.workspace_id=m.workspace_id AND b.sha256=m.source_sha256 WHERE b.id IS NULL LIMIT 1",
    "SELECT 1 FROM asset_renditions r LEFT JOIN media m ON m.workspace_id=r.workspace_id AND m.id=r.asset_id WHERE m.id IS NULL LIMIT 1",
    "SELECT 1 FROM posts p LEFT JOIN media m ON m.workspace_id=p.workspace_id AND m.id=p.featured_media_id WHERE p.featured_media_id IS NOT NULL AND m.id IS NULL LIMIT 1",
    "SELECT 1 FROM widget_region_bindings b LEFT JOIN entries e ON e.workspace_id=b.workspace_id AND e.id=b.area_entry_id WHERE e.id IS NULL LIMIT 1",
    "SELECT 1 FROM entry_terms r LEFT JOIN terms t ON t.workspace_id=r.workspace_id AND t.id=r.term_id WHERE t.id IS NULL LIMIT 1",
  ];
  for (const check of checks) if ((await required.db.query(sql.raw(check))).length) throw new Error("Dangling portable content reference");
}

/** Exact trusted schema equality rejects views, virtual-table substitutions, hidden/generated
 * columns, CHECK expressions, extension triggers and malicious indices before table reads.
 * The archive's migration ledger is data only and is never used to choose code to execute.
 * @complexity O(schema objects + database rows), bounded by the helper's input/deadline caps.
 */
async function run(required: { root: string }, _options: Record<string, never> = {}): Promise<void> {
  const sourceOptions = { readonly: true, fileMustExist: true, timeout: 1000 };
  const source = openSqliteConnection({ filePath: path.join(required.root, "input.db"),
    open: ({ filePath }) => openNativeSqlite(filePath, sourceOptions),
  }, { pragmas: ["trusted_schema = OFF", "query_only = ON"] });
  const sourceKernel = sqliteKernel<Record<string, Record<string, unknown>>>(source);
  const trusted = openContentDb({ filePath: ":memory:" });
  let portablePluginTables = new Set<string>();
  try {
    // Extension loading remains disabled: this helper never exposes/calls loadExtension.
    const actual = await sqliteSchemaObjects({ kernel: sourceKernel });
    const plugins = await prepareSharePluginTables({ modules: FIRST_PARTY_DATA_MODULES, target: sqliteKernel(trusted), present: new Set(actual.filter(object => object.type === "table").map(object => object.name)) });
    portablePluginTables = plugins.portable;
    const expected = await sqliteSchemaObjects({ kernel: sqliteKernel(trusted) });
    // No archived SQL is executed or relaxed: every table, index and trigger must match
    // this build. Historical ADD COLUMN schema variants are not part of the v2 contract.
    await requireTrustedSchemaObjects({ source: sourceKernel, target: sqliteKernel(trusted), actual, expected });
    if ((await sourceKernel.query(sql`SELECT id FROM workspaces LIMIT 2`)).length !== 1) throw new Error("Import requires one workspace");
    // Source FKs may reference private rows omitted by projection; validate rebuilt FKs below.
    if (verifySqliteIntegrity({ db: source, quick: true }).issues.some(issue => issue.kind === "integrity")) throw new Error("Invalid SQLite integrity");
  } finally { source.close(); closeSqliteConnection(trusted); }
  const omittedMediaIds = JSON.parse(await readFile(path.join(required.root, "omitted-media.json"), "utf8")) as string[];
  const projection = await sanitizeShareDatabase({ omittedMediaIds, modules: FIRST_PARTY_DATA_MODULES, snapshot: await readFile(path.join(required.root, "input.db")) });
  const output = path.join(required.root, "output.db");
  await writeFile(output, projection.bytes, { flag: "wx", mode: 0o600 });
  const fresh = openSqliteFileKernel<Record<string, Record<string, unknown>>>(output);
  const documentKeys = new Map<string, string>();
  try {
    const workspaces = await fresh.query<{ id: string }>(sql`SELECT id FROM workspaces LIMIT 2`);
    if (workspaces.length !== 1) throw new Error("Import requires exactly one workspace");
    const recipient = readTemplate({ templateId: "starter" }).seed.workspace.id;
    // Runtime queries use the recipient template workspace. Content/media IDs stay stable.
    // Defer FKs while both sides change, then validate before commit through the kernel owner.
    await sqliteForeignKeyCheckedTransaction({ kernel: fresh, onViolation: () => new Error("Invalid imported references"), work: async () => {
      for (const table of [...SHARE_TABLES, ...portablePluginTables, "setting_values_workspace"]) {
        const columns = await listColumns(fresh, table);
        if (!columns.some(column => column.name === "workspace_id")) continue;
        if ((await fresh.query(sql`SELECT 1 FROM ${sql.table(table)} WHERE workspace_id <> ${workspaces[0]!.id} LIMIT 1`)).length) throw new Error("Portable row belongs to a missing workspace");
        // Identifiers come exclusively from the trusted core allowlist and bundled declarations.
        await fresh.execute(sql`UPDATE ${sql.table(table)} SET workspace_id = ${recipient}`);
      }
      await fresh.execute(sql`UPDATE workspaces SET id = ${recipient}`);
      // Documents must keep canonical keys in the recipient workspace, including blobs shared
      // with ordinary media. Return the mapping so the verifier moves only verified bytes.
      const documents = await fresh.query<{ storage_key: string; sha256: string }>(sql`SELECT DISTINCT b.storage_key, b.sha256 FROM asset_blobs b JOIN media m ON m.workspace_id=b.workspace_id AND m.source_sha256=b.sha256 WHERE m.kind='document'`);
      for (const blob of documents) {
        const destination = computeBlobStorageKey({ workspaceId: recipient, sha256: blob.sha256 });
        documentKeys.set(blob.storage_key, destination);
        await fresh.execute(sql`UPDATE asset_blobs SET storage_key=${destination} WHERE workspace_id=${recipient} AND sha256=${blob.sha256}`);
      }
      // Scan renditions once rather than issuing one unindexed storage-key scan per blob.
      const renditions = await fresh.query<{ id: string; storage_key: string }>(sql`SELECT id,storage_key FROM asset_renditions`);
      for (const rendition of renditions) {
        const destination = documentKeys.get(rendition.storage_key);
        if (destination) await fresh.execute(sql`UPDATE asset_renditions SET storage_key=${destination} WHERE id=${rendition.id}`);
      }
    } });
    await validatePortableReferences({ db: fresh });
    if (!verifySqliteIntegrity({ db: sqliteConnectionOf(fresh)!, quick: true }).ok) throw new Error("Invalid rebuilt database");
  } finally { await fresh.close(); }
  const media = projection.media.map(blob => documentKeys.has(blob.storageKey) ? { ...blob, destinationStorageKey: documentKeys.get(blob.storageKey) } : blob);
  await writeFile(path.join(required.root, "media.json"), JSON.stringify(media), { flag: "wx", mode: 0o600 });
  await writeFile(path.join(required.root, "notices.json"), JSON.stringify(projection.notices ?? []), { flag: "wx", mode: 0o600 });
  // sanitizeShareDatabase() always returns both lists; they are optional only on the shared projection type.
  await writeFile(path.join(required.root, "documents.json"), JSON.stringify(projection.documents!), { flag: "wx", mode: 0o600 });
}

// The helper writes only application-owned refusal text. Raw SQLite errors and source SQL
// stay private; version advice has its own exit code rather than swallowing every schema error.
run({ root: process.argv[2]! }).then(() => process.exit(0), async error => {
  if (!(error instanceof SiteShareRefusal)) process.exit(1);
  if (error.code === "SCHEMA_VERSION_MISMATCH") process.exit(IMPORT_SCHEMA_MISMATCH_EXIT_CODE);
  await writeFile(path.join(process.argv[2]!, "refusal.txt"), error.message, { flag: "wx", mode: 0o600 });
  process.exit(IMPORT_REFUSAL_EXIT_CODE);
});

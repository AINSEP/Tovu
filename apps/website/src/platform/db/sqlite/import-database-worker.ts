/** Trusted helper entrypoint. Never import archived code or execute source DDL/migrations.
 * SQLite native work is isolated from the serving process and killed by its parent deadline.
 */
import { sql } from "kysely";
import { openSqliteConnection, verifySqliteIntegrity } from "@jini-ai/db/sqlite";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openContentDb } from "./content-db.js";
import { sqliteKernel, closeSqliteConnection, openNativeSqlite, openSqliteFileKernel, sqliteConnectionOf } from "../kernel/drivers/sqlite.js";
import { listColumns } from "../kernel/dialect.js";
import { sqliteForeignKeyCheckedTransaction, sqliteSchemaObjects } from "../kernel/sqlite-only.js";
import type { StorageKernel } from "../kernel/port.js";
import { sanitizeShareDatabase, prepareSharePluginTables } from "./share-database.js";
import { SHARE_TABLES } from "#src/features/site-backup/share-policy";
import { readTemplate } from "#src/platform/site-dir/read-template";
import { computeBlobStorageKey } from "#src/features/media/index";

type ImportKernel = StorageKernel<Record<string, Record<string, unknown>>>;

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
    const plugins = await prepareSharePluginTables({ target: sqliteKernel(trusted), present: new Set(actual.filter(object => object.type === "table").map(object => object.name)) });
    portablePluginTables = plugins.portable;
    const expected = await sqliteSchemaObjects({ kernel: sqliteKernel(trusted) });
    // No archived SQL is executed or relaxed: every table, index and trigger must match
    // this build. Historical ADD COLUMN schema variants are not part of the v2 contract.
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Unsupported SQLite schema objects");
    if ((await sourceKernel.query(sql`SELECT id FROM workspaces LIMIT 2`)).length !== 1) throw new Error("Import requires one workspace");
    // Source FKs may reference private rows omitted by projection; validate rebuilt FKs below.
    if (verifySqliteIntegrity({ db: source, quick: true }).issues.some(issue => issue.kind === "integrity")) throw new Error("Invalid SQLite integrity");
  } finally { source.close(); closeSqliteConnection(trusted); }
  const projection = await sanitizeShareDatabase({ snapshot: await readFile(path.join(required.root, "input.db")) });
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
        if (columns.some(column => column.name === "workspace_id")) {
          if ((await fresh.query(sql`SELECT 1 FROM ${sql.table(table)} WHERE workspace_id <> ${workspaces[0]!.id} LIMIT 1`)).length) throw new Error("Portable row belongs to a missing workspace");
          // Identifiers come exclusively from the trusted core allowlist and bundled declarations.
          await fresh.execute(sql`UPDATE ${sql.table(table)} SET workspace_id = ${recipient}`);
        }
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
  // sanitizeShareDatabase() always returns both lists; they are optional only on the shared projection type.
  await writeFile(path.join(required.root, "documents.json"), JSON.stringify(projection.documents!), { flag: "wx", mode: 0o600 });
}

run({ root: process.argv[2]! }).then(() => process.exit(0), () => process.exit(1));

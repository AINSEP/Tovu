/** Trusted helper entrypoint. Never import archived code or execute source DDL/migrations.
 * SQLite native work is isolated from the serving process and killed by its parent deadline.
 */
import Database from "better-sqlite3";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openContentDb } from "./content-db.js";
import { closeSqliteConnection } from "../kernel/drivers/sqlite.js";
import { sanitizeShareDatabase } from "./share-database.js";
import { SHARE_TABLES } from "#src/features/site-backup/share-policy";
import { readTemplate } from "#src/platform/site-dir/read-template";

type SchemaObject = { type: string; name: string; tbl_name: string; sql: string | null };
const schemaSql = "SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name";

/** These portable relationships are application-owned rather than SQLite FKs. Identity actor
 * strings are intentionally excluded: the share policy omits source accounts, not attribution.
 * Each join uses existing id/lookup indexes; the helper's byte/deadline caps bound the scan.
 */
function validatePortableReferences(required: { db: Database.Database }, _options: Record<string, never> = {}): void {
  const checks = [
    "SELECT 1 FROM nav_location_bindings b LEFT JOIN menus m ON m.workspace_id=b.workspace_id AND m.id=b.menu_id WHERE m.id IS NULL LIMIT 1",
    "SELECT 1 FROM media m LEFT JOIN asset_blobs b ON b.workspace_id=m.workspace_id AND b.sha256=m.source_sha256 WHERE b.id IS NULL LIMIT 1",
    "SELECT 1 FROM asset_renditions r LEFT JOIN media m ON m.workspace_id=r.workspace_id AND m.id=r.asset_id WHERE m.id IS NULL LIMIT 1",
    "SELECT 1 FROM posts p LEFT JOIN media m ON m.workspace_id=p.workspace_id AND m.id=p.featured_media_id WHERE p.featured_media_id IS NOT NULL AND m.id IS NULL LIMIT 1",
    "SELECT 1 FROM widget_region_bindings b LEFT JOIN entries e ON e.workspace_id=b.workspace_id AND e.id=b.area_entry_id WHERE e.id IS NULL LIMIT 1",
    "SELECT 1 FROM entry_terms r LEFT JOIN terms t ON t.workspace_id=r.workspace_id AND t.id=r.term_id WHERE t.id IS NULL LIMIT 1",
  ];
  for (const check of checks) if (required.db.prepare(check).get()) throw new Error("Dangling portable content reference");
}

/** Exact trusted schema equality rejects views, virtual-table substitutions, hidden/generated
 * columns, CHECK expressions, extension triggers and malicious indices before table reads.
 * The archive's migration ledger is data only and is never used to choose code to execute.
 * @complexity O(schema objects + database rows), bounded by the helper's input/deadline caps.
 */
async function run(required: { root: string }, _options: Record<string, never> = {}): Promise<void> {
  const source = new Database(path.join(required.root, "input.db"), { readonly: true, fileMustExist: true, timeout: 1000 });
  const trusted = openContentDb({ filePath: ":memory:" });
  try {
    source.pragma("trusted_schema = OFF");
    source.pragma("query_only = ON");
    // Extension loading remains disabled: this helper never exposes/calls loadExtension.
    const actual = source.prepare(schemaSql).all() as SchemaObject[];
    const expected = trusted.$client.prepare(schemaSql).all() as SchemaObject[];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Unsupported SQLite schema objects");
    if (source.prepare("SELECT id FROM workspaces LIMIT 2").all().length !== 1) throw new Error("Import requires one workspace");
    if (source.pragma("quick_check", { simple: true }) !== "ok") throw new Error("Invalid SQLite integrity");
  } finally { source.close(); closeSqliteConnection(trusted); }
  const projection = await sanitizeShareDatabase({ snapshot: await readFile(path.join(required.root, "input.db")) });
  const output = path.join(required.root, "output.db");
  await writeFile(output, projection.bytes, { flag: "wx", mode: 0o600 });
  const fresh = new Database(output);
  try {
    const workspaces = fresh.prepare("SELECT id FROM workspaces LIMIT 2").all() as { id: string }[];
    if (workspaces.length !== 1) throw new Error("Import requires exactly one workspace");
    const recipient = readTemplate({ templateId: "starter" }).seed.workspace.id;
    // Runtime queries use the recipient template workspace. Content/media IDs stay stable.
    fresh.pragma("foreign_keys = OFF");
    fresh.transaction(() => {
      for (const table of [...SHARE_TABLES, "setting_values_workspace"]) {
        const columns = fresh.prepare("SELECT name FROM pragma_table_info(?)").all(table) as { name: string }[];
        if (columns.some(column => column.name === "workspace_id")) {
          if (fresh.prepare('SELECT 1 FROM "' + table + '" WHERE workspace_id <> ? LIMIT 1').get(workspaces[0]!.id)) throw new Error("Portable row belongs to a missing workspace");
          // Identifiers come exclusively from A's closed trusted-table allowlist.
          fresh.prepare('UPDATE "' + table + '" SET workspace_id = ?').run(recipient);
        }
      }
      fresh.prepare("UPDATE workspaces SET id = ?").run(recipient);
    })();
    fresh.pragma("foreign_keys = ON");
    if ((fresh.pragma("foreign_key_check") as unknown[]).length) throw new Error("Invalid imported references");
    validatePortableReferences({ db: fresh });
    if (fresh.pragma("quick_check", { simple: true }) !== "ok") throw new Error("Invalid rebuilt database");
  } finally { fresh.close(); }
  await writeFile(path.join(required.root, "media.json"), JSON.stringify(projection.media), { flag: "wx", mode: 0o600 });
}

run({ root: process.argv[2]! }).then(() => process.exit(0), () => process.exit(1));

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { listColumns, listTables } from "../dialect.js";
import { openPgliteKernel } from "../drivers/pglite.js";
import { sqliteKernel } from "../drivers/sqlite.js";
import { renderDatabaseTypes } from "../typegen.js";
import { ensurePgContentSchema } from "../../pglite/content-schema.js";
import { openContentDb } from "../../sqlite/content-db.js";

/**
 * @file The content database's Kysely types are exactly what the reference database says, and a
 * migrated SQLite database has the same shape.
 *
 * 1. Drift: `content-database.generated.ts` equals a fresh render from a fresh reference database.
 *    Regenerate with `UPDATE_DATABASE_TYPES=1` (then commit the file).
 * 2. Parity: every generated table and column exists in a freshly migrated SQLite `content.db`, with
 *    a storage class that holds the generated type. SQLite-only tables (the FTS projection, the
 *    migration journal) are listed below by name — a new one fails until it is named here.
 *
 * Columns only; keys, indexes, defaults and constraints join this check with the migrator (M1).
 */

const GENERATED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../content-database.generated.ts");
const REGENERATE = "`UPDATE_DATABASE_TYPES=1` + `kernel/__tests__/database-types.test.ts`";

/** Tables only SQLite has, each with its reason. */
const SQLITE_ONLY: ReadonlyMap<string, string> = new Map([
  ["__drizzle_migrations", "legacy Drizzle migration journal (frozen by M1)"],
  ["post_search_document", "SQLite FTS5 projection source; Postgres search is F1 (tsvector)"],
  ["post_search_fts", "FTS5 virtual table"],
]);

/** Which SQLite declared types can hold each generated TypeScript type. */
function sqliteHolds(tsType: string, sqliteType: string): boolean {
  const base = tsType.replace(/^Generated<(.*)>$/, "$1").replace(/ \| null$/, "");
  const declared = sqliteType.toLowerCase();
  if (base === "string") return declared === "text" || declared === "";
  if (base === "number") return ["integer", "real", "numeric"].includes(declared);
  if (["Bool", "GeneratedBool", "NullableBool"].includes(base)) return declared === "integer";
  if (base === "Uint8Array") return declared === "blob";
  return false;
}

const pg = openPgliteKernel({ prepare: ensurePgContentSchema });
after(() => pg.close());

test("content-database.generated.ts matches the reference database", async () => {
  const rendered = await renderDatabaseTypes(pg, {
    interfaceName: "ContentDatabase",
    source: "a fresh PGlite database with the content schema (`pglite/content-schema.ts`)",
    regenerate: REGENERATE,
  });
  if (process.env.UPDATE_DATABASE_TYPES === "1") fs.writeFileSync(GENERATED, rendered);
  assert.equal(fs.readFileSync(GENERATED, "utf8"), rendered, `stale generated types — regenerate: ${REGENERATE}`);
});

test("a migrated SQLite content.db has every generated table and column, with compatible storage", async () => {
  const text = fs.readFileSync(GENERATED, "utf8");
  const generated = new Map<string, Map<string, string>>();
  for (const block of text.matchAll(/export interface (\w+)Table \{\n([^}]*)\}/g)) {
    const columns = new Map<string, string>();
    for (const line of block[2]!.trim().split("\n")) {
      const [name, type] = line.trim().replace(/;$/, "").split(/: (.*)/s);
      columns.set(name!, type!);
    }
    generated.set(block[1]!, columns);
  }
  const sqlite = sqliteKernel(openContentDb(":memory:"));
  const tables = await listTables(sqlite);
  const problems: string[] = [];
  const pascal = (name: string) => name.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  const seen = new Set<string>();
  for (const table of tables) {
    const expected = generated.get(pascal(table));
    if (expected === undefined) {
      if (!SQLITE_ONLY.has(table) && !table.startsWith("post_search_fts_")) problems.push(`${table}: SQLite only, not named in SQLITE_ONLY`);
      continue;
    }
    seen.add(pascal(table));
    const actual = new Map((await listColumns(sqlite, table)).map((column) => [column.name, column.type]));
    for (const [column, tsType] of expected) {
      const declared = actual.get(column);
      if (declared === undefined) problems.push(`${table}.${column}: missing on SQLite`);
      else if (!sqliteHolds(tsType, declared)) problems.push(`${table}.${column}: ${tsType} vs SQLite ${declared}`);
    }
    for (const column of actual.keys()) if (!expected.has(column)) problems.push(`${table}.${column}: SQLite only`);
  }
  for (const table of generated.keys()) if (!seen.has(table)) problems.push(`${table}: missing on SQLite`);
  assert.deepEqual(problems, []);
});

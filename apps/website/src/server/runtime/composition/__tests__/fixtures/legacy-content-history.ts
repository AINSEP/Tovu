import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

/**
 * @file Helpers the legacy-history boot suites share (`open-site-content-db.legacy-fixtures` and
 * `open-site-content-db.real-sites`): fill every core table of a generated history with distinctive
 * rows, digest each table's CONTENT (not just its row count), and derive which tables a boot may
 * remove from the migration sources themselves — never from the boot's own output.
 */

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../../../../platform/db/migrations");
const DRIZZLE_DIR = path.resolve(import.meta.dirname, "../../../../../platform/db/drizzle");

/** A `const NAME = ["a", "b"]` list read out of a migration step's source text. The steps keep these
 *  lists private, and exporting them would change the step's pinned source checksum (`checksums.ts`). */
function constList(file: string, name: string): string[] {
  const text = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  const match = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(text);
  if (!match) throw new Error(`${file} no longer declares ${name}; update this fixture`);
  return [...match[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

/** Step 0002 drops these only when EMPTY (it keeps a populated one). */
export const LEGACY_CHAT_TABLES: ReadonlySet<string> = new Set(constList("0002_drop_empty_legacy_chat_tables.ts", "LEGACY_CHAT_TABLES"));

/** Step 0004 drops these unconditionally. */
const UNUSED_DEPLOYMENT_TABLES = constList("0004_drop_unused_deployment_tables.ts", "TABLES_IN_DROP_ORDER");

interface JournalEntry {
  tag: string;
}

function drizzleTail(appliedEntries: number): string[] {
  const journal = JSON.parse(fs.readFileSync(path.join(DRIZZLE_DIR, "meta/_journal.json"), "utf8")) as { entries: JournalEntry[] };
  return journal.entries.slice(appliedEntries).map((entry) => fs.readFileSync(path.join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8"));
}

const statementTargets = (sources: readonly string[], pattern: RegExp): Set<string> =>
  new Set(sources.flatMap((source) => [...source.matchAll(pattern)].map((m) => m[1]!)));

/**
 * Tables a boot of a history with `appliedEntries` drizzle entries may remove: the empty legacy chat
 * tables (0002), the unused deployment tables (0004), and every `DROP TABLE` in the drizzle tail the
 * boot applies. A drizzle table rebuild drops and re-creates the same name, so it never shows up as
 * removed — only real drops can.
 */
export function allowedRemovals(appliedEntries: number): Set<string> {
  const dropped = statementTargets(drizzleTail(appliedEntries), /^\s*DROP TABLE (?:IF EXISTS )?[`"]?(\w+)[`"]?/gim);
  return new Set([...LEGACY_CHAT_TABLES, ...UNUSED_DEPLOYMENT_TABLES, ...dropped]);
}

/** Tables the drizzle tail rewrites rows of (`UPDATE`/`DELETE FROM`): their content may change. */
export function rewrittenByTail(appliedEntries: number): Set<string> {
  return statementTargets(drizzleTail(appliedEntries), /^\s*(?:UPDATE|DELETE FROM) [`"]?(\w+)[`"]?/gim);
}

export interface TableContent {
  columns: string[];
  rows: number;
  /** One sha256 hex per row over `columns` (sorted, so row order does not matter). */
  rowHashes: string[];
}

/** Every table's columns, row count and per-row content hashes, read without writing anything. */
export function readContent(db: Database.Database): Record<string, TableContent> {
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as Array<{ name: string }>).map((row) => row.name);
  const out: Record<string, TableContent> = {};
  for (const table of tables) {
    const columns = (db.prepare(`SELECT name FROM pragma_table_info(?) ORDER BY cid`).all(table) as Array<{ name: string }>).map((row) => row.name);
    const rows = db.prepare(`SELECT * FROM "${table}"`).raw(false).all() as Array<Record<string, unknown>>;
    out[table] = { columns, rows: rows.length, rowHashes: hashRows(rows, columns) };
  }
  return out;
}

/** Per-row hashes over just `columns` (the columns a before/after pair has in common). */
export function hashRows(rows: ReadonlyArray<Record<string, unknown>>, columns: readonly string[]): string[] {
  const sorted = [...columns].sort();
  return rows
    .map((row) => crypto.createHash("sha256").update(JSON.stringify(sorted.map((column) => {
      const value = row[column];
      return Buffer.isBuffer(value) ? `blob:${value.toString("hex")}` : value;
    }))).digest("hex"))
    .sort();
}

/** Row hashes of `table` in `db` over `columns` only. */
export function contentOver(db: Database.Database, table: string, columns: readonly string[]): string[] {
  return hashRows(db.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>, columns);
}

/**
 * The row hashes of `before` that `after` no longer holds (a multiset difference): a rewritten or
 * deleted row shows up here, while rows a boot ADDS (the watermark row, first-run seeds for a
 * workspace the history lacks) do not.
 */
export function missingRows(before: readonly string[], after: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const hash of after) left.set(hash, (left.get(hash) ?? 0) + 1);
  const missing: string[] = [];
  for (const hash of before) {
    const n = left.get(hash) ?? 0;
    if (n === 0) missing.push(hash);
    else left.set(hash, n - 1);
  }
  return missing;
}

/**
 * Values a generic generator cannot derive from the column type or an `IN (...)` check, each forced
 * by a CHECK in the frozen chain: `commerce_*_currency_check` (3 lower-case letters),
 * `commerce_prices_compare_at_amount_cents_check` (NULL or above the unit amount) and
 * `posts_body_format_shape` (a 'doc' post has body_json and no body_html).
 */
const COLUMN_OVERRIDES: Record<string, (n: number) => unknown> = {
  "commerce_orders.currency": () => "usd",
  "commerce_prices.currency": () => "usd",
  "commerce_prices.compare_at_amount_cents": () => null,
  "posts.body_format": () => "doc",
  "posts.body_html": () => null,
};

/**
 * Puts two distinctive rows into every ordinary table of a generated history, except the legacy
 * chat tables (left empty, as every real site had them after the two-database split — step 0002
 * drops them only when empty) and FTS virtual/shadow tables (their triggers fill them). Key and
 * foreign-key columns get matching `k1`/`k2` (or 1/2) values so every reference resolves; other
 * columns get `"<table>.<column>.<n>"` — a JSON string, so no step that rewrites invalid JSON
 * (0003) mistakes it for legacy data. A CHECK those values cannot satisfy needs an entry in
 * {@link COLUMN_OVERRIDES}.
 *
 * @param optional.except tables a caller seeds itself.
 * @returns the tables it filled.
 * @throws naming the table when a row is refused, or when a foreign key is left dangling.
 */
export function fillEveryTable(db: Database.Database, optional: { except?: readonly string[] } = {}): string[] {
  db.pragma("foreign_keys = OFF");
  const tables = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name`).all() as Array<{ name: string; sql: string }>;
  const virtual = tables.filter((t) => /^CREATE VIRTUAL TABLE/i.test(t.sql)).map((t) => t.name);
  const keyColumns = new Set<string>();
  for (const { name } of tables) {
    for (const column of db.prepare(`SELECT name FROM pragma_table_info(?) WHERE pk > 0`).all(name) as Array<{ name: string }>) keyColumns.add(`${name}.${column.name}`);
    for (const fk of db.prepare(`SELECT "table" AS parent, "from" AS col, "to" AS ref FROM pragma_foreign_key_list(?)`).all(name) as Array<{ parent: string; col: string; ref: string | null }>) {
      keyColumns.add(`${name}.${fk.col}`);
      if (fk.ref) keyColumns.add(`${fk.parent}.${fk.ref}`);
    }
  }
  const filled: string[] = [];
  for (const { name, sql } of tables) {
    if (optional.except?.includes(name) || LEGACY_CHAT_TABLES.has(name) || virtual.includes(name) || virtual.some((v) => name.startsWith(`${v}_`))) continue;
    const columns = db.prepare(`SELECT name, type FROM pragma_table_info(?) ORDER BY cid`).all(name) as Array<{ name: string; type: string }>;
    for (let n = 1; n <= 2; n++) {
      const value = (column: (typeof columns)[number]): unknown => {
        const key = `${name}.${column.name}`;
        const override = COLUMN_OVERRIDES[key];
        if (override) return override(n);
        const type = column.type.toUpperCase();
        if (keyColumns.has(key)) return type.includes("INT") ? n : `k${n}`;
        const inList = new RegExp(`[\`"]?${column.name}[\`"]?\\s+IN\\s*\\(([^)]*)\\)`, "i").exec(sql);
        if (inList) {
          const options = inList[1]!.split(",").map((option) => option.trim());
          const option = options[n % options.length]!;
          return /^'.*'$/.test(option) ? option.slice(1, -1) : Number(option);
        }
        if (type.includes("INT")) return n * 10 + 1;
        if (type.includes("REAL") || type.includes("NUM")) return n + 0.5;
        if (type.includes("BLOB")) return Buffer.from(`${name}.${column.name}.${n}`);
        return JSON.stringify(`${name}.${column.name}.${n}`);
      };
      const insert = (picked: typeof columns, values: unknown[]) =>
        db.prepare(`INSERT INTO "${name}" (${picked.map((c) => `"${c.name}"`).join(", ")}) VALUES (${picked.map(() => "?").join(", ")})`).run(...values);
      try {
        insert(columns, columns.map(value));
      } catch (err) {
        throw new Error(`cannot fill ${name} (add a COLUMN_OVERRIDES entry): ${(err as Error).message}`);
      }
    }
    filled.push(name);
  }
  db.pragma("foreign_keys = ON");
  const dangling = db.prepare("PRAGMA foreign_key_check").all();
  if (dangling.length > 0) throw new Error(`generated rows left dangling foreign keys: ${JSON.stringify(dangling.slice(0, 5))}`);
  return filled;
}

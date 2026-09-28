import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "kysely";

import { listTables } from "../kernel/dialect.js";
import { openMemorySqliteKernel } from "../kernel/drivers/sqlite.js";
import type { StorageKernel } from "../kernel/port.js";
import { readSchemaShape, type SchemaShape } from "../kernel/schema-shape.js";
import { CHAT_TABLE_NAMES } from "../sqlite/chat-orphan-check.js";
import { LEDGER_TABLE } from "./runner.js";
import { LegacyHistoryError } from "./step.js";

/**
 * @file The FROZEN drizzle chain (`platform/db/drizzle/`, 0000–0077) as the SQLite half of
 * `0000_legacy_baseline` (ADR-066 §5): read it, reconcile a database's `__drizzle_migrations` against
 * it, apply a missing tail, verify the result.
 *
 * Drizzle's own migrator is never used on this chain again: it decides "applied" by comparing each
 * entry's journal `when` with the LAST recorded `created_at`, and 0068–0077 carry fake 2027 stamps, so
 * that rule is unsound here. This file decides by content hash (the same sha256 of the whole `.sql`
 * file drizzle records), and applies statements exactly as drizzle did: split on
 * `--> statement-breakpoint`, in journal order, with a `__drizzle_migrations` row per entry — so an
 * older runtime opening an adopted file still sees a fully migrated database.
 */

export const LEGACY_DRIZZLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

/** The chain as frozen. Adding an entry to `drizzle/` is refused (use a TS step instead). */
export const FROZEN_CHAIN = { length: 78, lastTag: "0077_external_mcp_tool_approvals" } as const;

const DRIZZLE_TABLE = "__drizzle_migrations";

export interface LegacyEntry {
  index: number;
  tag: string;
  /** The journal's `when` — informational only, never used to decide anything. */
  when: number;
  /** sha256 hex of the `.sql` file, as drizzle records it. */
  hash: string;
  statements: string[];
}

/** The frozen entries, in order. Throws when `drizzle/` no longer matches the freeze. */
export function readFrozenChain(dir: string = LEGACY_DRIZZLE_DIR): LegacyEntry[] {
  const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as {
    entries: Array<{ idx: number; tag: string; when: number }>;
  };
  const last = journal.entries.at(-1);
  if (journal.entries.length !== FROZEN_CHAIN.length || last?.tag !== FROZEN_CHAIN.lastTag) {
    throw new Error(
      `the legacy drizzle chain is frozen at ${FROZEN_CHAIN.length} entries ending ${FROZEN_CHAIN.lastTag}; ` +
        `found ${journal.entries.length} ending ${last?.tag}. Schema changes are TS steps in platform/db/migrations (ADR-066).`
    );
  }
  return journal.entries.map((entry, index) => {
    const text = fs.readFileSync(path.join(dir, `${entry.tag}.sql`), "utf8");
    return {
      index,
      tag: entry.tag,
      when: entry.when,
      hash: crypto.createHash("sha256").update(text).digest("hex"),
      statements: text.split("--> statement-breakpoint").filter((statement) => statement.trim() !== ""),
    };
  });
}

export interface LegacyReconciliation {
  /** No drizzle history and no tables: a brand-new database. */
  fresh: boolean;
  /** Entries recorded in `__drizzle_migrations` (matched by hash). */
  applied: number;
  /** The missing tail, in order. */
  pending: LegacyEntry[];
}

/**
 * Matches the database's drizzle history to the frozen chain by hash. Duplicate rows for one hash
 * (seen on real sites) count once.
 *
 * @throws LegacyHistoryError for tables without any drizzle history, a recorded hash that is not in
 *   the chain (an edited or foreign migration), or an entry missing BEFORE the last applied one.
 */
export async function reconcileLegacyHistory(kernel: StorageKernel<unknown>, chain: readonly LegacyEntry[]): Promise<LegacyReconciliation> {
  const tables = (await listTables(kernel)).filter((name) => name !== LEDGER_TABLE);
  if (!tables.includes(DRIZZLE_TABLE)) {
    if (tables.length > 0) {
      throw new LegacyHistoryError(`the database has tables (${tables.slice(0, 5).join(", ")}…) but no drizzle migration history; it is not a Tovu content database this runtime can adopt`);
    }
    return { fresh: true, applied: 0, pending: [...chain] };
  }
  const rows = await kernel.query<{ hash: string }>(sql`SELECT hash FROM ${sql.table(DRIZZLE_TABLE)}`);
  const byHash = new Map(chain.map((entry) => [entry.hash, entry]));
  const unknown = [...new Set(rows.map((row) => row.hash))].filter((hash) => !byHash.has(hash));
  if (unknown.length > 0) {
    throw new LegacyHistoryError(`__drizzle_migrations records ${unknown.length} migration(s) that are not in the frozen chain (hash ${unknown[0].slice(0, 12)}…); the history was edited or comes from another branch`);
  }
  const applied = new Set(rows.map((row) => (byHash.get(row.hash) as LegacyEntry).index));
  const last = Math.max(-1, ...applied);
  const gaps = chain.filter((entry) => entry.index < last && !applied.has(entry.index));
  if (gaps.length > 0) {
    throw new LegacyHistoryError(`the drizzle history skips ${gaps.map((entry) => entry.tag).join(", ")} but has later entries; apply or reconcile them by hand`);
  }
  return { fresh: false, applied: applied.size, pending: chain.filter((entry) => entry.index > last) };
}

/** Applies `entries` with drizzle's statement semantics, recording each in `__drizzle_migrations`. */
export async function applyLegacyEntries(kernel: StorageKernel<unknown>, entries: readonly LegacyEntry[]): Promise<void> {
  // Drizzle's own ledger DDL, verbatim (its `SERIAL` id is not a rowid alias on SQLite; ids stay null).
  await kernel.execute(sql`CREATE TABLE IF NOT EXISTS ${sql.table(DRIZZLE_TABLE)} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`);
  for (const entry of entries) {
    for (const statement of entry.statements) await kernel.execute(sql.raw(statement));
    await kernel.execute(sql`INSERT INTO ${sql.table(DRIZZLE_TABLE)} ("hash", "created_at") VALUES (${entry.hash}, ${entry.when})`);
  }
}

/** Tables the chain creates that `openContentDb` may later drop when empty (the two-db split). */
const DROPPABLE = new Set(CHAT_TABLE_NAMES);
const BOOKKEEPING = [DRIZZLE_TABLE, LEDGER_TABLE];

/** The chain's head schema, built fresh in memory. */
export async function frozenHeadShape(chain: readonly LegacyEntry[]): Promise<SchemaShape> {
  const scratch = openMemorySqliteKernel<unknown>();
  try {
    await scratch.transaction(async () => applyLegacyEntries(scratch, chain));
    return await readSchemaShape(scratch, { exclude: BOOKKEEPING });
  } finally {
    await scratch.close();
  }
}

export interface ShapeDifference {
  /** Expected, absent: tables, columns, indexes or constraints the database lacks or defines differently. */
  problems: string[];
  /** Present, not expected (plugin data-module tables and the like): reported, not refused. */
  extraTables: string[];
}

/** `actual` against `expected`, table by table, in both directions for shared tables. */
export function compareShapes(expected: SchemaShape, actual: SchemaShape, optional: { optionalTables?: ReadonlySet<string> } = {}): ShapeDifference {
  const problems: string[] = [];
  for (const [name, want] of Object.entries(expected.tables)) {
    const have = actual.tables[name];
    if (have === undefined) {
      if (!optional.optionalTables?.has(name)) problems.push(`missing table ${name}`);
      continue;
    }
    for (const part of ["columns", "indexes", "constraints"] as const) {
      const wanted = new Set(want[part]);
      const had = new Set(have[part]);
      for (const item of want[part]) if (!had.has(item)) problems.push(`${name}: expected ${part} entry "${item}"`);
      for (const item of have[part]) if (!wanted.has(item)) problems.push(`${name}: unexpected ${part} entry "${item}"`);
    }
  }
  const actualOthers = new Set(actual.others);
  for (const other of expected.others) if (!actualOthers.has(other)) problems.push(`missing ${other}`);
  const extraTables = Object.keys(actual.tables).filter((name) => expected.tables[name] === undefined);
  return { problems, extraTables };
}

/**
 * The SQLite `up` of `0000_legacy_baseline`: reconcile, apply the missing tail, verify against the
 * chain's head built fresh. Runs inside the runner's transaction (a failure rolls the tail back).
 */
export async function adoptLegacySqlite(kernel: StorageKernel<unknown>, note: (message: string) => void): Promise<void> {
  const chain = readFrozenChain();
  const state = await reconcileLegacyHistory(kernel, chain);
  await applyLegacyEntries(kernel, state.pending);
  if (!state.fresh && state.pending.length > 0) {
    note(`applied legacy migrations ${state.pending[0].tag} … ${state.pending.at(-1)?.tag} (${state.pending.length})`);
  }
  const difference = compareShapes(await frozenHeadShape(chain), await readSchemaShape(kernel, { exclude: BOOKKEEPING }), {
    optionalTables: DROPPABLE,
  });
  if (difference.problems.length > 0) {
    throw new LegacyHistoryError(
      `the database's schema does not match the frozen drizzle chain (${difference.problems.length} difference(s)):\n  ` +
        difference.problems.slice(0, 20).join("\n  ")
    );
  }
  if (difference.extraTables.length > 0) note(`tables outside the core schema kept as they are: ${difference.extraTables.join(", ")}`);
}

/**
 * @file Asserts the generated PostgreSQL schema carries the same structural elements as the SQLite
 * source it was derived from.
 *
 * Why this exists separately from the drift test: the drift test compares the committed file to
 * what the generator currently produces. That catches a stale file, but it is blind to a generator
 * that silently omits something — if the generator stops emitting foreign keys, it stops emitting
 * them consistently, and drift stays "in sync" while the PostgreSQL schema quietly loses
 * referential integrity.
 *
 * That is not hypothetical. The first version of the generator dropped **all 9 foreign keys and all
 * 7 CHECK constraints** and produced a file that typechecked cleanly and passed the drift test. The
 * CHECKs are the `*_sealed_shape` constraints on credential tables asserting that sealed columns
 * are either all NULL or all populated; losing them on PostgreSQL would silently permit half-sealed
 * credential rows that SQLite rejects.
 *
 * So this test compares against the SOURCE OF TRUTH — `schema.ts` introspected via Drizzle — rather
 * than against the generator's own output. Counts, not exact SQL, because the two dialects legibly
 * differ in type spelling; a count mismatch means something was dropped or invented.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { getTableConfig } from "drizzle-orm/sqlite-core";

import * as sqliteSchema from "../schema";

const GENERATED = fs.readFileSync(path.resolve(__dirname, "../schema.postgres.ts"), "utf8");
const DRIZZLE_IS_TABLE = Symbol.for("drizzle:IsDrizzleTable");

function sourceTables(): Array<{ exportName: string; table: never }> {
  return Object.entries(sqliteSchema)
    .filter(([, v]) => Boolean(v && typeof v === "object" && (v as Record<symbol, unknown>)[DRIZZLE_IS_TABLE]))
    .map(([exportName, table]) => ({ exportName, table: table as never }));
}

/** Counts non-overlapping occurrences of a literal token in the generated file. */
const occurrences = (token: string): number => GENERATED.split(token).length - 1;

test("every SQLite table is present in the generated PostgreSQL schema, by export name", () => {
  const missing = sourceTables()
    .map(({ exportName }) => exportName)
    .filter((name) => !new RegExp(`export const ${name} = pgTable\\(`).test(GENERATED));
  assert.deepEqual(missing, [], "tables missing from the generated schema");
});

test("every foreign key survives generation — losing one silently permits orphan rows", () => {
  const expected = sourceTables().reduce((n, { table }) => n + getTableConfig(table).foreignKeys.length, 0);
  assert.ok(expected > 0, "sanity: the source schema should declare foreign keys");
  assert.equal(occurrences("foreignKey({"), expected);
});

test("every CHECK constraint survives generation — these carry the credential sealed-shape invariants", () => {
  const expected = sourceTables().reduce((n, { table }) => n + getTableConfig(table).checks.length, 0);
  assert.ok(expected > 0, "sanity: the source schema should declare CHECK constraints");
  assert.equal(occurrences("check("), expected);
});

test("every composite primary key survives generation", () => {
  const expected = sourceTables().reduce((n, { table }) => n + getTableConfig(table).primaryKeys.length, 0);
  assert.ok(expected > 0, "sanity: the source schema should declare composite primary keys");
  assert.equal(occurrences("primaryKey({"), expected);
});

test("every index survives generation, unique and non-unique alike", () => {
  const all = sourceTables().flatMap(({ table }) => getTableConfig(table).indexes);
  const expectedUnique = all.filter((idx) => idx.config.unique).length;
  const expectedPlain = all.length - expectedUnique;
  assert.ok(all.length > 0, "sanity: the source schema should declare indexes");

  // `occurrences("index(")` counts only the non-unique builder: the literal "index(" does not
  // appear inside "uniqueIndex(", which has a capital I. Asserting the two separately also catches
  // a generator that emitted the right total while getting uniqueness wrong — which a bare sum
  // would silently accept, and which would let duplicate rows into a table SQLite keeps unique.
  assert.equal(occurrences("uniqueIndex("), expectedUnique, "unique index count differs");
  assert.equal(occurrences("index("), expectedPlain, "non-unique index count differs");
});

test("column count matches per table — a dropped column would not be caught by the drift test", () => {
  for (const { exportName, table } of sourceTables()) {
    const cfg = getTableConfig(table);
    const block = new RegExp(`export const ${exportName} = pgTable\\("[^"]+", \\{([\\s\\S]*?)\\n\\}`).exec(GENERATED);
    assert.ok(block, `no generated block found for ${exportName}`);
    const declared = (block[1].match(/^\s{2}\w+:/gm) ?? []).length;
    assert.equal(declared, cfg.columns.length, `${exportName} column count differs`);
  }
});

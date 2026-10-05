import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { BASELINE_PATH, type Counts, countRawSqlite, scan, sorted, stripComments } from "./raw-sqlite-scan.js";

/**
 * @file Ratchet: no NEW raw SQLite outside the storage kernel's drivers (storage-adapter plan,
 * `ADS-memory/.local-artifacts/plans/2026-09-28-storage-adapter-plan.md`).
 *
 * Code reaches its database through `platform/db/kernel` (async port, Drizzle query builder,
 * dialect helpers). Anything that talks SQLite directly — a better-sqlite3 import, `.prepare(`,
 * `$client`, PRAGMA, `sqlite_master`, `BEGIN IMMEDIATE`, SQLite-only JSON/time functions — locks
 * that code to one database. The files that do so today are listed in `raw-sqlite-baseline.json`
 * with a count per rule. The baseline may only SHRINK:
 *
 * - a file or rule not in the baseline, or a count above it → fails (move the code onto the kernel);
 * - a count below it → fails until the baseline is lowered, so the gain is locked in. Lower it with
 *   `UPDATE_RAW_SQLITE_BASELINE=1` on this test; that run writes only lowered counts and still
 *   fails on anything that grew.
 *
 * Matching runs on the source with every comment blanked out (from the TypeScript parser's own
 * comment ranges), so prose that mentions PRAGMA cannot count; SQL lives in strings and templates,
 * which are kept.
 */

test("comment stripping: prose never counts, SQL in strings and templates does", () => {
  const source = [
    "// PRAGMA foreign_keys in a line comment",
    "/** sqlite_master in JSDoc; `BEGIN IMMEDIATE` */",
    "const a = db.prepare(`SELECT json_extract(x, '$.a') FROM t`); /* $client */",
    'const b = sql`PRAGMA table_info(${t})`; // .inTransaction',
  ].join("\n");
  assert.deepEqual(countRawSqlite(stripComments("probe.ts", source)), { prepare: 1, "sqlite-json": 1, pragma: 1 });
});

test("a bare `.prepare()` (a lifecycle hook, no SQL) is not a prepared statement", () => {
  assert.deepEqual(countRawSqlite("await module.prepare();\nconst s = db.prepare(\n  `SELECT 1`\n);"), { prepare: 1 });
});

test("better-sqlite3's inTransaction property counts; the kernel port's inTransaction() call does not", () => {
  const source = ["if (client.inTransaction) return;", "const open = db.$client.inTransaction;", "if (kernel.inTransaction()) return work();"].join("\n");
  assert.deepEqual(countRawSqlite(stripComments("probe.ts", source)), { "in-transaction": 2, $client: 1 });
});

test("literal computed prepare calls cannot bypass the SQLite ratchet", () => {
  const source = [
    "db['prepare']('SELECT 1');",
    'db["prepare"]?.("SELECT 2");',
    "db[`prepare`]('SELECT 3');",
    "module['prepare']();",
    "// db['prepare']('SELECT 4');",
    'const prose = "db[\'prepare\'](sql)";',
  ].join("\n");
  assert.deepEqual(countRawSqlite(stripComments("probe.ts", source)), { prepare: 3 });
});

test("no new raw SQLite outside the storage kernel (ratchet: the baseline only shrinks)", () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Counts;
  const current = scan();
  const grew: string[] = [];
  const shrank: string[] = [];
  for (const [file, counts] of Object.entries(current)) {
    for (const [rule, count] of Object.entries(counts)) {
      const allowed = baseline[file]?.[rule] ?? 0;
      if (count > allowed) grew.push(`${file}: ${rule} ${allowed} -> ${count}`);
    }
  }
  for (const [file, counts] of Object.entries(baseline)) {
    for (const [rule, count] of Object.entries(counts)) {
      const now = current[file]?.[rule] ?? 0;
      if (now < count) shrank.push(`${file}: ${rule} ${count} -> ${now}`);
    }
  }
  if (process.env.UPDATE_RAW_SQLITE_BASELINE === "1" && grew.length === 0 && shrank.length > 0) {
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted(current), null, 2)}\n`);
    shrank.length = 0;
  }
  assert.deepEqual(
    grew,
    [],
    "New raw SQLite outside platform/db/kernel. Use the storage kernel (run/transaction + Drizzle, dialect.ts helpers) instead."
  );
  assert.deepEqual(
    shrank,
    [],
    "Raw SQLite went down — lock it in: rerun this test with UPDATE_RAW_SQLITE_BASELINE=1 and commit the baseline."
  );
});

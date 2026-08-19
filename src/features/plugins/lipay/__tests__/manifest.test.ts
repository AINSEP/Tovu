/**
 * @file The dataModule declaration — the tables and indexes core actually creates from
 * `LIPAY_MANIFEST`, plus the naming-grammar constraint that made single-word table names the only
 * legal choice (ADR-023's `IDENT` permits underscores and forbids hyphens; ADR-026 mandates
 * hyphens-or-nothing and forbids underscores; their intersection is a single segment).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { LIPAY_MANIFEST, LIPAY_PLUGIN_ID } from "../lipay-plugin.js";
import { cleanup, makeLipay } from "./support.js";

const objectNames = (db: import("better-sqlite3").Database, type: "table" | "index"): string[] =>
  (db.prepare(`SELECT name FROM sqlite_master WHERE type = ? ORDER BY name`).all(type) as { name: string }[]).map(
    (r) => r.name
  );

test("lipay: activation declares all three p_lipay__* tables through the never-brick seam", async () => {
  const { db, dir } = await makeLipay();

  const tables = objectNames(db, "table");
  assert.ok(tables.includes("p_lipay__payments"));
  assert.ok(tables.includes("p_lipay__events"));
  assert.ok(tables.includes("p_lipay__refunds"));

  cleanup(db, dir);
});

test("lipay: the idempotency and correlation indexes exist, and the dedupe ones are UNIQUE", async () => {
  const { db, dir } = await makeLipay();

  const indexes = objectNames(db, "index");
  for (const expected of [
    "idx_p_lipay__payments__idem",
    "idx_p_lipay__payments__ref",
    "idx_p_lipay__payments__wsstatus",
    "idx_p_lipay__events__dedupe",
    "idx_p_lipay__events__bypayment",
    "idx_p_lipay__refunds__idem",
    "idx_p_lipay__refunds__bypayment",
  ]) {
    assert.ok(indexes.includes(expected), `missing index ${expected}`);
  }

  // Replay protection is only replay protection if the constraint is actually unique.
  const uniqueness = (name: string): boolean =>
    (db.prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND name = ?`).get(name) as { sql: string }).sql
      .toUpperCase()
      .includes("UNIQUE INDEX");
  assert.ok(uniqueness("idx_p_lipay__events__dedupe"), "inbound event dedupe index must be UNIQUE");
  assert.ok(uniqueness("idx_p_lipay__payments__idem"), "outbound idempotency index must be UNIQUE");
  assert.ok(uniqueness("idx_p_lipay__refunds__idem"), "refund idempotency index must be UNIQUE");

  cleanup(db, dir);
});

test("lipay: activation is idempotent — declaring twice creates nothing new and does not throw", async () => {
  const { db, dir } = await makeLipay();
  const before = objectNames(db, "table").length;

  const { declareDataModule } = await import("../../data-module.js");
  const again = await declareDataModule({ db, dbPath: ":memory:", decl: LIPAY_MANIFEST });

  assert.equal(again.ok, true);
  assert.deepEqual(again.created, []);
  assert.equal(objectNames(db, "table").length, before);

  cleanup(db, dir);
});

test("lipay: plugin id and every table short name satisfy BOTH ADR-023's and ADR-026's grammars", () => {
  // ADR-023 `data-module.ts` IDENT allows underscores; ADR-026 forbids them and allows hyphens.
  // The only names that satisfy both are single lowercase alphanumeric segments.
  const bothGrammars = /^[a-z][a-z0-9]*$/;
  assert.match(LIPAY_PLUGIN_ID, bothGrammars);
  for (const table of LIPAY_MANIFEST.tables) {
    assert.match(table.name, bothGrammars, `table '${table.name}' would violate one of the two grammars`);
    for (const index of table.indexes ?? []) {
      assert.match(index.name, bothGrammars, `index '${index.name}' would violate one of the two grammars`);
    }
  }
  assert.equal(LIPAY_MANIFEST.pluginTier, "tier-2");
});

test("lipay: the manifest models no orders, no providers and no card data", () => {
  const tableNames = LIPAY_MANIFEST.tables.map((t) => t.name);
  assert.deepEqual(tableNames, ["payments", "events", "refunds"]);

  const columns = LIPAY_MANIFEST.tables.flatMap((t) => t.columns.map((c) => c.name));
  for (const forbidden of ["order_id", "card_number", "pan", "token", "secret"]) {
    assert.ok(!columns.includes(forbidden), `'${forbidden}' must not be a lipay column`);
  }
  // Money is minor units plus an explicit currency — never a bare "cents" integer.
  const payments = LIPAY_MANIFEST.tables[0];
  assert.ok(payments.columns.some((c) => c.name === "amount_minor" && c.type === "INTEGER"));
  assert.ok(payments.columns.some((c) => c.name === "currency" && c.notNull === true));
});

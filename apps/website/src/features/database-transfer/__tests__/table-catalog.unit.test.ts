import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { openSqliteSnapshotSource } from "../sqlite-source.js";
import { planSnapshotTables } from "../table-catalog.js";

test("plugin layout uses affinity, literal defaults and INTEGER identity; drops partial and expression indexes", (t) => {
  // F2.6: introspect a real snapshot, rather than faking PRAGMA results.
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE p_b08__items (id INTEGER PRIMARY KEY, label VARCHAR(20) DEFAULT 'O''Brien', score FLOAT DEFAULT -1.5, payload BLOB DEFAULT X'ff', amount NUMERIC DEFAULT 12, stamp TEXT DEFAULT CURRENT_TIMESTAMP, slug TEXT UNIQUE);
    CREATE INDEX b08_label ON p_b08__items(label);
    CREATE INDEX b08_partial ON p_b08__items(score) WHERE score > 0;
    CREATE INDEX b08_expression ON p_b08__items(lower(label));`);
  const source = openSqliteSnapshotSource(db.serialize());
  t.after(() => source.close());
  const planned = planSnapshotTables(source).tables.find((entry) => entry.name === "p_b08__items");
  assert.deepEqual(planned, {
    name: "p_b08__items", primaryKey: ["id"], columns: [
      { name: "id", sqlType: "bigint", notNull: true, identity: "BY DEFAULT" },
      { name: "label", sqlType: "text", notNull: false, default: "'O''Brien'" },
      { name: "score", sqlType: "double precision", notNull: false, default: "-1.5" },
      { name: "payload", sqlType: "bytea", notNull: false },
      { name: "amount", sqlType: "text", notNull: false, default: "12" },
      { name: "stamp", sqlType: "text", notNull: false },
      { name: "slug", sqlType: "text", notNull: false },
    ], indexes: [{ name: "b08_label", columns: ["label"], unique: false }, { name: "p_b08__items_slug_key", columns: ["slug"], unique: true }], foreignKeys: [], checks: [],
  });
});

test("composite keys follow declared key order and never become row-id identities", (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec("CREATE TABLE p_b08__pairs (a INTEGER, b INTEGER, PRIMARY KEY(b, a)); CREATE TABLE p_b08__child (id INT PRIMARY KEY, b INTEGER, a INTEGER, FOREIGN KEY(b, a) REFERENCES p_b08__pairs ON DELETE CASCADE ON UPDATE SET NULL)");
  const source = openSqliteSnapshotSource(db.serialize());
  t.after(() => source.close());
  const byName = new Map(planSnapshotTables(source).tables.map((entry) => [entry.name, entry]));
  assert.deepEqual(byName.get("p_b08__pairs")?.primaryKey, ["b", "a"]);
  assert.deepEqual(byName.get("p_b08__pairs")?.columns, [{ name: "a", sqlType: "bigint", notNull: true }, { name: "b", sqlType: "bigint", notNull: true }]);
  assert.deepEqual(byName.get("p_b08__child")?.columns, [{ name: "id", sqlType: "bigint", notNull: true }, { name: "b", sqlType: "bigint", notNull: false }, { name: "a", sqlType: "bigint", notNull: false }]);
  assert.deepEqual(byName.get("p_b08__child")?.foreignKeys, [{ name: "p_b08__child_b_a_fkey", columns: ["b", "a"], foreignTable: "p_b08__pairs", foreignColumns: null, onDelete: "cascade", onUpdate: "set null" }]);
});

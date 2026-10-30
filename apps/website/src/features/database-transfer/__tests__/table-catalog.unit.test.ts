import { createCoreTableCatalog } from "#src/server/runtime/composition/database-transfer-adapters";
import { openSqliteSnapshot } from "#src/platform/db/kernel/drivers/sqlite";
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { boolean, check, ForeignKeyBuilder, index, integer, jsonb, pgTable, primaryKey, text, unique } from "drizzle-orm/pg-core";

import { openSqliteSnapshotSource } from "../sqlite-source.js";
import { collectSchemaTables, collectTransferTables, planChatSnapshotTables, planSnapshotTables } from "../table-catalog.js";
import { indexSql } from "@jini-ai/db/transfer";

test("the host schema retains the submission-IP retention index's partial predicate", () => {
  const submissions = collectSchemaTables({ catalog: createCoreTableCatalog({}) }).find(table => table.name === "form_submissions");
  assert.deepEqual(submissions?.indexes.find(index => index.name === "idx_form_submissions_ip_retention"), {
    name: "idx_form_submissions_ip_retention", columns: ["submitted_at", "id"], unique: false,
    where: "source_ip IS NOT NULL",
  });
});

test("the full schema retains vault expression indexes with unqualified column references", () => {
  const vault = collectSchemaTables({ catalog: createCoreTableCatalog({}) }).find(table => table.name === "secrets_vault");
  assert.ok(vault);
  const ddl = indexSql({ schema: "public", table: vault });
  assert.ok(ddl.includes('CREATE UNIQUE INDEX "secrets_vault_default" ON "public"."secrets_vault" ("workspace_id", "kind", "owner_key", (("principal_id" IS NULL)), (coalesce("principal_id",\'\')), (("provider" IS NULL)), (coalesce("provider",\'\'))) WHERE is_default = true;'));
  assert.doesNotMatch(ddl, /"secrets_vault"\."(?:principal_id|provider)"/);
});

test("plugin layout uses affinity, literal defaults and INTEGER identity; drops partial and expression indexes", (t) => {
  // F2.6: introspect a real snapshot, rather than faking PRAGMA results.
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE p_b08__items (id INTEGER PRIMARY KEY, label VARCHAR(20) DEFAULT 'O''Brien', score FLOAT DEFAULT -1.5, payload BLOB DEFAULT X'ff', amount NUMERIC DEFAULT 12, stamp TEXT DEFAULT CURRENT_TIMESTAMP, slug TEXT UNIQUE);
    CREATE INDEX b08_label ON p_b08__items(label);
    CREATE INDEX b08_partial ON p_b08__items(score) WHERE score > 0;
    CREATE INDEX b08_expression ON p_b08__items(lower(label));`);
  const source = openSqliteSnapshotSource({ bytes: db.serialize(), open: data => openSqliteSnapshot({ data }) });
  t.after(() => source.close());
  const planned = planSnapshotTables({ source, catalog: createCoreTableCatalog({}) }).tables.find((entry) => entry.name === "p_b08__items");
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
  const source = openSqliteSnapshotSource({ bytes: db.serialize(), open: data => openSqliteSnapshot({ data }) });
  t.after(() => source.close());
  const byName = new Map(planSnapshotTables({ source, catalog: createCoreTableCatalog({}) }).tables.map((entry) => [entry.name, entry]));
  assert.deepEqual(byName.get("p_b08__pairs")?.primaryKey, ["b", "a"]);
  assert.deepEqual(byName.get("p_b08__pairs")?.columns, [{ name: "a", sqlType: "bigint", notNull: true }, { name: "b", sqlType: "bigint", notNull: true }]);
  assert.deepEqual(byName.get("p_b08__child")?.columns, [{ name: "id", sqlType: "bigint", notNull: true }, { name: "b", sqlType: "bigint", notNull: false }, { name: "a", sqlType: "bigint", notNull: false }]);
  assert.deepEqual(byName.get("p_b08__child")?.foreignKeys, [{ name: "p_b08__child_b_a_fkey", columns: ["b", "a"], foreignTable: "p_b08__pairs", foreignColumns: null, onDelete: "cascade", onUpdate: "set null" }]);
});

test("content.db's legacy chat tables are left out with a reason: chat.db is the one source of the conversation tables", (t) => {
  // A pre-split install keeps chat rows in content.db (0002 drops only empty ones); copying them
  // from both files declared each table twice and runCopy refused the whole copy.
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE ai_chats (id TEXT PRIMARY KEY); CREATE TABLE ai_chat_messages (id TEXT PRIMARY KEY); CREATE TABLE assistant_agent_sessions (id TEXT PRIMARY KEY);
    INSERT INTO ai_chats VALUES ('stranded');`);
  const source = openSqliteSnapshotSource({ bytes: db.serialize(), open: data => openSqliteSnapshot({ data }) });
  t.after(() => source.close());
  const plan = planSnapshotTables({ source, catalog: createCoreTableCatalog({}) });
  const chatTables = ["ai_chat_messages", "ai_chats", "assistant_agent_sessions"];
  assert.deepEqual(plan.tables.filter((entry) => chatTables.includes(entry.name)), []);
  assert.deepEqual(plan.leftOut.filter((entry) => chatTables.includes(entry.table)), chatTables.map((table) => ({ table, reason: "conversations are copied from chat.db; chat history still left in content.db from before the chat.db split is not copied" })));
});

test("core projection carries literal and SQL defaults, identity modes and application-generated defaults", () => {
  const table = pgTable("catalog_variants", {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    next: integer("next").generatedByDefaultAsIdentity(),
    label: text("label").notNull().default("O'Brien"),
    count: integer("count").default(7), enabled: boolean("enabled").default(false),
    expression: text("expression").default(sql`'ready'`),
    computed: text("computed").$defaultFn(() => "generated-in-app"),
  });
  assert.deepEqual(collectSchemaTables({ catalog: { schema: { table }, copyOrder: () => ["table"], derivedNames: new Set() } }), [{
    name: "catalog_variants", columns: [
      { name: "id", sqlType: "integer", notNull: true, identity: "ALWAYS" },
      { name: "next", sqlType: "integer", notNull: true, identity: "BY DEFAULT" },
      { name: "label", sqlType: "text", notNull: true, default: "'O''Brien'" },
      { name: "count", sqlType: "integer", notNull: false, default: "7" },
      { name: "enabled", sqlType: "boolean", notNull: false, default: "false" },
      { name: "expression", sqlType: "text", notNull: false, default: "'ready'" },
      { name: "computed", sqlType: "text", notNull: false },
    ], primaryKey: ["id"], indexes: [], foreignKeys: [], checks: [],
  }]);
});

test("core projection rejects unsupported defaults and missing manifest exports", () => {
  const unsupported = pgTable("bad_defaults", { payload: jsonb("payload").default({ bad: true }) });
  assert.throws(() => collectSchemaTables({ catalog: { schema: { unsupported }, copyOrder: () => ["unsupported"], derivedNames: new Set() } }), { message: "schema.postgres.ts: 'payload' has a default this copier cannot write" });
  for (const collect of [collectTransferTables, collectSchemaTables]) {
    assert.throws(() => collect({ catalog: { schema: {}, copyOrder: () => ["missing"], derivedNames: new Set() } }), { message: "schema.postgres.ts has no table exported as 'missing'; regenerate it" });
  }
});

test("core projection retains composite keys, unique columns and multi-column unique constraints", () => {
  const table = pgTable("catalog_keys", { a: text("a").unique(), b: text("b") }, columns => [
    primaryKey({ columns: [columns.b, columns.a] }), unique("catalog_pair").on(columns.a, columns.b),
    index().on(columns.b), check("catalog_a_present", sql`length(${columns.a}) > 0`),
  ]);
  const [projected] = collectSchemaTables({ catalog: { schema: { table }, copyOrder: () => ["table"], derivedNames: new Set() } });
  assert.deepEqual(projected!.primaryKey, ["b", "a"]);
  assert.deepEqual(projected!.indexes, [
    { name: "catalog_keys_idx", columns: ["b"], unique: false },
    { name: "catalog_keys_a_unique", columns: ["a"], unique: true },
    { name: "catalog_pair", columns: ["a", "b"], unique: true },
  ]);
  assert.deepEqual(projected!.checks, [{ name: "catalog_a_present", sql: 'length("catalog_keys"."a") > 0' }]);
});

test("chat snapshot order places the three owned tables first and sorts other tables by name", (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE z_extra (id TEXT); CREATE TABLE a_extra (id TEXT);
    CREATE TABLE assistant_agent_sessions (id TEXT); CREATE TABLE ai_chat_messages (id TEXT); CREATE TABLE ai_chats (id TEXT);`);
  const source = openSqliteSnapshotSource({ bytes: db.serialize(), open: data => openSqliteSnapshot({ data }) });
  t.after(() => source.close());
  assert.deepEqual(planChatSnapshotTables(source).tables.map(table => table.name), ["ai_chats", "ai_chat_messages", "assistant_agent_sessions", "a_extra", "z_extra"]);
});

test("foreign keys without actions project SQL's no-action defaults", () => {
  const parent = pgTable("catalog_parent", { id: integer("id").primaryKey() });
  const child = pgTable("catalog_child", { parentId: integer("parent_id") }, columns => [
    new ForeignKeyBuilder(() => ({ columns: [columns.parentId], foreignColumns: [parent.id] }), {}),
  ]);
  const [projected] = collectTransferTables({ catalog: { schema: { child }, copyOrder: () => ["child"], derivedNames: new Set() } });
  assert.deepEqual(projected!.foreignKeys, [{
    name: "catalog_child_parent_id_catalog_parent_id_fk", columns: ["parent_id"], foreignTable: "catalog_parent",
    foreignColumns: ["id"], onDelete: "no action", onUpdate: "no action",
  }]);
});

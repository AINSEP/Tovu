import assert from "node:assert/strict";
import test from "node:test";
import { CONTENT_MIGRATIONS } from "../../migrations/index.js";
import { readFrozenChain } from "../../migrations/legacy-sqlite.js";
import { openSqliteContentConnection, type ContentDb } from "../content-db.js";
import { bootstrapFreshContentDb } from "../fresh-content-db.js";

// Direct tests for the fresh-database constructor's own decisions: when it runs, its ledgers, its
// drift guard and its all-or-nothing transaction. Schema parity with the real TS runner is
// content-db-fresh.integration.test.ts's job. In-memory databases only.
const BEHIND = "fresh content bootstrap is behind CONTENT_MIGRATIONS; update its fresh-only operations and schema parity guard";
const tables = (db: ContentDb) => (db.$client.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name);
function withDb(work: (db: ContentDb) => void) {
  const db = openSqliteContentConnection(":memory:");
  try { work(db); } finally { db.$client.close(); }
}

test("an empty database is built at head with both ledgers in step order", () => withDb(db => {
  const before = new Date().toISOString();
  assert.equal(bootstrapFreshContentDb({ db }), true);
  const after = new Date().toISOString();
  const ledger = db.$client.prepare("SELECT id, checksum, applied_at FROM tovu_migrations ORDER BY rowid").all() as Array<{ id: string; checksum: string; applied_at: string }>;
  assert.deepEqual(ledger.map(row => [row.id, row.checksum]), CONTENT_MIGRATIONS.map(step => [step.id, step.checksum]));
  for (const row of ledger) assert.ok(row.applied_at >= before && row.applied_at <= after, row.applied_at);
  const drizzle = db.$client.prepare("SELECT hash, created_at FROM __drizzle_migrations ORDER BY id").all() as Array<{ hash: string; created_at: number }>;
  assert.deepEqual(drizzle.map(row => [row.hash, Number(row.created_at)]), readFrozenChain().map(entry => [entry.hash, entry.when]));
  const names = tables(db);
  for (const dropped of ["ai_chats", "ai_chat_messages", "assistant_agent_sessions", "deployment_runs", "releases"]) assert.equal(names.includes(dropped), false, dropped);
  for (const added of ["publish_backstop_log", "form_submissions", "media"]) assert.equal(names.includes(added), true, added);
}));

test("0006 relaxes form_submissions.source_ip and keeps the table's indexes", () => withDb(db => {
  bootstrapFreshContentDb({ db });
  const sourceIp = (db.$client.prepare("PRAGMA table_info(form_submissions)").all() as Array<{ name: string; notnull: number }>).find(column => column.name === "source_ip");
  assert.equal(sourceIp?.notnull, 0);
  const indexes = (db.$client.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'form_submissions' AND sql IS NOT NULL").all() as Array<{ name: string }>).map(row => row.name);
  assert.ok(indexes.includes("idx_form_submissions_ip_retention"), indexes.join());
  assert.ok(indexes.length > 1, "baseline indexes are recreated after the table rebuild");
  // 0003 normalized any non-JSON coercion text; on a fresh database every row is valid JSON.
  assert.equal((db.$client.prepare("SELECT COUNT(*) AS n FROM setting_definitions WHERE coercion_json IS NOT NULL AND json_valid(coercion_json) = 0").get() as { n: number }).n, 0);
}));

test("a database that already has any table is left untouched", () => withDb(db => {
  db.$client.exec("CREATE TABLE someone_elses (id TEXT)");
  assert.equal(bootstrapFreshContentDb({ db }), false);
  assert.deepEqual(tables(db), ["someone_elses"]);
}));

test("a second call on a built database is a no-op", () => withDb(db => {
  bootstrapFreshContentDb({ db });
  const built = tables(db);
  assert.equal(bootstrapFreshContentDb({ db }), false);
  assert.deepEqual(tables(db), built);
  assert.equal((db.$client.prepare("SELECT COUNT(*) AS n FROM tovu_migrations").get() as { n: number }).n, CONTENT_MIGRATIONS.length);
}));

test("a step list the bootstrap does not know refuses before writing anything", () => withDb(db => {
  const extra = { ...CONTENT_MIGRATIONS[0]!, id: "0099_future_step" };
  for (const migrations of [[...CONTENT_MIGRATIONS, extra], CONTENT_MIGRATIONS.slice(0, -1), [...CONTENT_MIGRATIONS.slice(0, -1), extra]]) {
    assert.throws(() => bootstrapFreshContentDb({ db }, { migrations }), { message: BEHIND });
    assert.deepEqual(tables(db), []);
  }
}));

test("a failing step rolls the whole build back, leaving an empty database that can be retried", () => withDb(db => {
  // A view is not a table, so the database still counts as empty, but 0007's CREATE TABLE collides.
  db.$client.exec("CREATE VIEW publish_backstop_log AS SELECT 1 AS x");
  assert.throws(() => bootstrapFreshContentDb({ db }), /already exists/);
  assert.deepEqual(tables(db), []);
  db.$client.exec("DROP VIEW publish_backstop_log");
  assert.equal(bootstrapFreshContentDb({ db }), true);
}));

test("if another connection built the file while this one waited for the write lock, nothing is written", () => {
  // Hand-written client: empty on the first look, populated once the IMMEDIATE transaction holds the lock.
  let looks = 0;
  const writes: string[] = [];
  const client = {
    prepare: (sql: string) => ({ get: () => (sql.startsWith("SELECT 1 FROM sqlite_schema") && looks++ === 0 ? undefined : { 1: 1 }), run: () => writes.push(sql), all: () => [] }),
    exec: (sql: string) => { writes.push(sql); },
    transaction: (fn: () => boolean) => ({ immediate: () => fn() }),
  };
  assert.equal(bootstrapFreshContentDb({ db: { $client: client } as unknown as ContentDb }), false);
  assert.equal(looks, 2);
  assert.deepEqual(writes, []);
});

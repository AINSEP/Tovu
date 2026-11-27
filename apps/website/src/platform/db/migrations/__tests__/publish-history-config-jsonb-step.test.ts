import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { publishDestinationHistory } from "../0016_publish_destination_history.js";
import { publishHistoryKind } from "../0017_publish_history_kind.js";

test("0016 and 0017 preserve legacy publish rows as static without inventing replay credentials", async t => {
  const kernel = openMemorySqliteKernel<unknown>();
  t.after(() => kernel.close());
  await kernel.execute(sql`CREATE TABLE publish_history (id TEXT PRIMARY KEY, target TEXT NOT NULL)`);
  await kernel.execute(sql`INSERT INTO publish_history VALUES ('legacy', 'github-pages')`);
  const steps = [publishDestinationHistory({ checksum: "a".repeat(64) }), publishHistoryKind({ checksum: "b".repeat(64) })];
  assert.deepEqual((await runMigrations({ kernel, steps })).applied, ["0016_publish_destination_history", "0017_publish_history_kind"]);
  const config = '{"directory":"public"}';
  await kernel.execute(sql`INSERT INTO publish_history (id, target, kind, credential_id, config_fields_json)
    VALUES ('deploy', 'server', 'deploy', 'deployment-key', ${config})`);
  await kernel.execute(sql`INSERT INTO publish_history (id, target) VALUES ('new-static', 'github-pages')`);
  assert.deepEqual(await kernel.query(sql`SELECT id, target, kind, credential_id, config_fields_json FROM publish_history ORDER BY id`), [
    { id: "deploy", target: "server", kind: "deploy", credential_id: "deployment-key", config_fields_json: config },
    { id: "legacy", target: "github-pages", kind: "static", credential_id: null, config_fields_json: null },
    { id: "new-static", target: "github-pages", kind: "static", credential_id: null, config_fields_json: null },
  ]);
  assert.deepEqual((await runMigrations({ kernel, steps })).applied, []);
});

for (const adapter of eachDialect({ tables: ["publish_history"], make: db => db })) {
  test(`[${adapter.name}] 0036 preserves destination JSON and SQL NULL and applies once`, async t => {
    const db = adapter.make();
    if (adapter.dialect === "sqlite") t.after(() => db.close());
    await db.execute(sql`DROP TABLE publish_history`);
    await db.execute(sql`CREATE TABLE publish_history (id text PRIMARY KEY, config_fields_json text)`);
    const config = { directory: "a'b", nested: { enabled: true }, names: ["é", "中文"] };
    await db.execute(sql`INSERT INTO publish_history VALUES ('json', ${JSON.stringify(config)}), ('legacy', NULL)`);
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === "0036_publish_history_config_jsonb")!;
    const options = { ledgerTable: "publish_config_test_migrations" };
    assert.deepEqual((await runMigrations({ kernel: db as KyselyKernel<unknown>, steps: [step] }, options)).applied, [step.id]);
    const rows = await db.query<{ id: string; config_fields_json: unknown }>(sql`SELECT * FROM publish_history ORDER BY id`);
    const value = rows[0]!.config_fields_json;
    assert.deepEqual(typeof value === "string" ? JSON.parse(value) : value, config);
    assert.deepEqual(rows[1], { id: "legacy", config_fields_json: null });
    const types = adapter.dialect === "postgres"
      ? await db.query<{ type: string }>(sql`SELECT udt_name AS type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'publish_history' AND column_name = 'config_fields_json'`)
      : await db.query<{ type: string }>(sql`SELECT type FROM pragma_table_info('publish_history') WHERE name = 'config_fields_json'`);
    assert.equal(types[0]!.type, adapter.dialect === "postgres" ? "jsonb" : "TEXT");
    assert.deepEqual((await runMigrations({ kernel: db as KyselyKernel<unknown>, steps: [step] }, options)).applied, []);
  });
}

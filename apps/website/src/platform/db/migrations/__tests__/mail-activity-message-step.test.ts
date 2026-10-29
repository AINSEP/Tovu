/** Step 0033 upgrades existing activity without rewriting its outcome or inventing error text. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";

for (const adapter of eachDialect({ tables: ["mail_activity_attempts"], make: db => db })) {
  test(`[${adapter.name}] 0033 preserves old activity and is applied once`, async t => {
    const db = adapter.make();
    if (adapter.dialect === "sqlite") t.after(() => db.close());
    await db.execute(sql`DROP TABLE mail_activity_attempts`);
    await db.execute(sql`CREATE TABLE mail_activity_attempts (id text PRIMARY KEY, error_code text, outcome text)`);
    await db.execute(sql`INSERT INTO mail_activity_attempts VALUES ('old', 'validation_error', 'failed')`);
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === "0033_mail_activity_message")!;
    const options = { ledgerTable: "mail_message_test_migrations" };
    assert.deepEqual((await runMigrations(db as StorageKernel<unknown>, [step], options)).applied, [step.id]);
    assert.deepEqual(await db.query(sql`SELECT * FROM mail_activity_attempts`), [{ id: "old", error_code: "validation_error", outcome: "failed", message: null }]);
    await db.execute(sql`UPDATE mail_activity_attempts SET message = 'Verify sender domain first' WHERE id = 'old'`);
    assert.deepEqual((await runMigrations(db as StorageKernel<unknown>, [step], options)).applied, []);
    assert.equal((await db.query<{ message: string }>(sql`SELECT message FROM mail_activity_attempts`))[0]!.message, "Verify sender domain first");
  });
}

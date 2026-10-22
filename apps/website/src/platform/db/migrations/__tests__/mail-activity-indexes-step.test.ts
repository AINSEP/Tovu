import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { MAIL_ACTIVITY_INDEXES_ID } from "../0029_mail_activity_indexes.js";
import { MAIL_LEDGERS_ID } from "../0023_mail_ledgers.js";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

/**
 * @file Migration 0029 (`0029_mail_activity_indexes`) on SQLite and PGlite: registered after 0028
 * with its pinned checksum, adds the two activity read indexes once, and keeps 0023's rows intact.
 */

const AT = "2026-10-22T12:00:00.000Z";

async function indexNames(kernel: StorageKernel<unknown>, name: "sqlite" | "pglite"): Promise<string[]> {
  const rows = name === "sqlite"
    ? await kernel.query<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_mail_%'`)
    : await kernel.query<{ name: string }>(sql`SELECT indexname AS name FROM pg_indexes WHERE indexname LIKE 'idx_mail_%'`);
  return rows.map(row => row.name).sort();
}

for (const adapter of eachDialect({ tables: ["mail_send_ledger", "workspaces"], make: kernel => kernel })) {
  const name = adapter.name as "sqlite" | "pglite";
  test(`[${name}] 0029 follows 0028 and adds the activity indexes once, rows untouched`, async () => {
    const kernel = adapter.make() as StorageKernel<unknown>;
    try {
      const ids = CONTENT_MIGRATIONS.map(entry => entry.id);
      assert.equal(ids.indexOf(MAIL_ACTIVITY_INDEXES_ID), ids.indexOf("0028_search_index_retired") + 1, "0029 follows 0028");
      const step = CONTENT_MIGRATIONS.find(entry => entry.id === MAIL_ACTIVITY_INDEXES_ID);
      const ledgers = CONTENT_MIGRATIONS.find(entry => entry.id === MAIL_LEDGERS_ID);
      assert.ok(step && ledgers);
      assert.equal(step.checksum, MIGRATION_CHECKSUMS[MAIL_ACTIVITY_INDEXES_ID]);
      await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('w', 'W', 'w', ${AT})`);
      for (const table of ["mail_send_ledger", "mail_suppression", "mail_feedback_inbox", "mail_capture"]) await kernel.execute(sql.raw(`DROP TABLE ${table}`));
      const options = { ledgerTable: "mail_activity_indexes_step_migrations" };
      await runMigrations(kernel, [ledgers], options);
      await kernel.execute(sql`INSERT INTO mail_send_ledger (workspace_id, idempotency_key, recipient, payload_hash, lane, provider_id, outcome, created_at, updated_at)
        VALUES ('w', 'members:signin:h', 'a@x.test', 'p', 'transactional', 'smtp', 'sent', ${AT}, ${AT})`);
      assert.deepEqual(await indexNames(kernel, name), ["idx_mail_capture_workspace_created"]);
      assert.deepEqual((await runMigrations(kernel, [ledgers, step], options)).applied, [MAIL_ACTIVITY_INDEXES_ID]);
      assert.deepEqual((await runMigrations(kernel, [ledgers, step], options)).applied, [], "a second run applies nothing");
      assert.deepEqual(await indexNames(kernel, name), ["idx_mail_capture_workspace_created", "idx_mail_feedback_inbox_workspace_message", "idx_mail_send_ledger_workspace_created"]);
      assert.deepEqual(await kernel.query(sql`SELECT idempotency_key, outcome FROM mail_send_ledger`), [{ idempotency_key: "members:signin:h", outcome: "sent" }]);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });
}

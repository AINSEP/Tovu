import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { MAIL_ACTIVITY_RETENTION_ID } from "../0031_mail_activity_retention.js";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

/** Upgrade 0030 → 0031 and fresh-bootstrap index parity on SQLite and PGlite. */
const AT = "2026-10-22T00:00:00.000Z";
const INDEXES = ["idx_mail_attempts_workspace_use_created", "idx_mail_attempts_workspace_effective_recipient", "idx_mail_attempts_workspace_recipient", "idx_mail_ledger_workspace_created_activity", "idx_mail_ledger_retention", "idx_mail_attempts_retention", "idx_mail_capture_retention", "idx_mail_feedback_retention"].sort();

for (const adapter of eachDialect({ tables: ["mail_activity_attempts", "mail_send_ledger", "workspaces"], make: kernel => kernel })) {
  test(`[${adapter.name}] 0031 adds indexed purposes and retention once, preserving historical outcomes`, async () => {
    const db = adapter.make() as StorageKernel<unknown>;
    try {
      const indexes = async () => {
        const rows = adapter.dialect === "sqlite"
          ? await db.query<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'index'`)
          : await db.query<{ name: string }>(sql`SELECT indexname AS name FROM pg_indexes`);
        return rows.map(row => row.name).filter(name => INDEXES.includes(name)).sort();
      };
      assert.deepEqual(await indexes(), INDEXES, "fresh bootstrap installs all 0031 indexes");
      const position = CONTENT_MIGRATIONS.findIndex(step => step.id === MAIL_ACTIVITY_RETENTION_ID);
      assert.equal(CONTENT_MIGRATIONS[position - 1]!.id, "0030_mail_suppression_admin");
      const step = CONTENT_MIGRATIONS[position]!;
      assert.equal(step.checksum, MIGRATION_CHECKSUMS[MAIL_ACTIVITY_RETENTION_ID]);
      await db.execute(sql`INSERT INTO workspaces (id,name,slug,created_at) VALUES ('w','W','w',${AT})`);
      for (const table of ["mail_activity_attempts", "mail_suppression_removals", "mail_send_ledger", "mail_suppression", "mail_feedback_inbox", "mail_capture"]) await db.execute(sql`DROP TABLE ${sql.table(table)}`);
      const previous = CONTENT_MIGRATIONS.filter(entry => ["0023_mail_ledgers", "0029_mail_activity_indexes", "0030_mail_suppression_admin"].includes(entry.id));
      const options = { ledgerTable: "mail_retention_step_migrations" };
      await runMigrations(db, previous, options);
      const keys = ["members:signin:one", "newsletter:confirm-email:one", "forms:notify:one", "mail:test:one", "newsletter:one", "opaque"];
      for (const [index, key] of keys.entries()) {
        await db.execute(sql`INSERT INTO mail_activity_attempts (id,workspace_id,idempotency_key,recipient,effective_recipient,delivery_mode,lane,provider_id,outcome,created_at,updated_at)
          VALUES (${String(index)},'w',${key},'a@x.test','a@x.test','off','transactional','smtp','sent',${AT},${AT})`);
      }
      const upgraded = [...previous, step];
      assert.deepEqual((await runMigrations(db, upgraded, options)).applied, [MAIL_ACTIVITY_RETENTION_ID]);
      assert.deepEqual(await indexes(), INDEXES, "upgrade matches fresh bootstrap");
      const rows = await db.query(sql`SELECT use_id, outcome FROM mail_activity_attempts ORDER BY id`);
      assert.deepEqual(rows, ["sign_in", "newsletter_confirmation", "form_notification", "test", "newsletter", "unknown"].map(use_id => ({ use_id, outcome: "sent" })));
      assert.deepEqual((await runMigrations(db, upgraded, options)).applied, []);
      assert.deepEqual(await db.query(sql`SELECT use_id, outcome FROM mail_activity_attempts ORDER BY id`), rows);
    } finally {
      if (adapter.dialect === "sqlite") await db.close();
    }
  });
}

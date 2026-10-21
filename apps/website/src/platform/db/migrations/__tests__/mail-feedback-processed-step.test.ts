import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { MAIL_FEEDBACK_PROCESSED_ID } from "../0025_mail_feedback_processed.js";
import { MAIL_LEDGERS_ID } from "../0023_mail_ledgers.js";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

/**
 * @file Migration 0025 (`0025_mail_feedback_processed`) on SQLite and PGlite: registered after 0024
 * with its pinned checksum, adds a nullable `processed_at` to the inbox once, and leaves rows that
 * predate it unprocessed (NULL) so a provider replay re-applies them.
 */

const AT = "2026-10-21T12:00:00.000Z";

for (const adapter of eachDialect({ tables: ["mail_feedback_inbox", "workspaces"], make: kernel => kernel })) {
  const name = adapter.name as "sqlite" | "pglite";
  test(`[${name}] 0025 is registered after 0024 and adds a nullable processed_at once`, async () => {
    const kernel = adapter.make() as StorageKernel<unknown>;
    try {
      const ids = CONTENT_MIGRATIONS.map(entry => entry.id);
      assert.equal(ids.indexOf(MAIL_FEEDBACK_PROCESSED_ID), ids.indexOf("0024_domain_bindings") + 1, "0025 follows 0024");
      const step = CONTENT_MIGRATIONS.find(entry => entry.id === MAIL_FEEDBACK_PROCESSED_ID);
      const ledgers = CONTENT_MIGRATIONS.find(entry => entry.id === MAIL_LEDGERS_ID);
      assert.ok(step && ledgers);
      assert.equal(step.checksum, MIGRATION_CHECKSUMS[MAIL_FEEDBACK_PROCESSED_ID]);
      await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('w', 'W', 'w', ${AT})`);
      // Rebuild the 0023 inbox, add a row from before 0025, then apply 0025 to it.
      for (const table of ["mail_send_ledger", "mail_suppression", "mail_feedback_inbox", "mail_capture"]) await kernel.execute(sql.raw(`DROP TABLE ${table}`));
      const options = { ledgerTable: "mail_feedback_processed_step_migrations" };
      await runMigrations(kernel, [ledgers], options);
      await kernel.execute(sql`INSERT INTO mail_feedback_inbox (provider_id, event_id, workspace_id, recipient, kind, hard_bounce, provider_message_id, occurred_at, received_at)
        VALUES ('resend', 'e1', 'w', 'a@x.test', 'bounced', 1, 'm1', ${AT}, ${AT})`);
      assert.deepEqual((await runMigrations(kernel, [ledgers, step], options)).applied, [MAIL_FEEDBACK_PROCESSED_ID]);
      assert.deepEqual((await runMigrations(kernel, [ledgers, step], options)).applied, [], "a second run applies nothing");
      assert.deepEqual(await kernel.query(sql`SELECT event_id, processed_at FROM mail_feedback_inbox`), [{ event_id: "e1", processed_at: null }]);
      await kernel.execute(sql`UPDATE mail_feedback_inbox SET processed_at = ${AT}`);
      assert.deepEqual(await kernel.query(sql`SELECT processed_at FROM mail_feedback_inbox`), [{ processed_at: AT }]);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });
}

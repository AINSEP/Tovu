import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { MAIL_SUPPRESSION_ADMIN_ID } from "../0030_mail_suppression_admin.js";
import { MAIL_LEDGERS_ID } from "../0023_mail_ledgers.js";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

/**
 * @file Migration 0030 (`0030_mail_suppression_admin`) on SQLite and PGlite: registered after 0029
 * with its pinned checksum, adds the two read indexes and the removal audit table once, keeps 0023's
 * suppression rows, constrains the audit scope and cascades it with its workspace.
 */

const AT = "2026-10-22T12:00:00.000Z";

for (const adapter of eachDialect({ tables: ["mail_suppression", "workspaces"], make: kernel => kernel })) {
  const name = adapter.name as "sqlite" | "pglite";
  test(`[${name}] 0030 follows 0029, adds the removal audit once, and leaves suppressions intact`, async () => {
    const kernel = adapter.make() as StorageKernel<unknown>;
    try {
      const ids = CONTENT_MIGRATIONS.map(entry => entry.id);
      assert.equal(ids.indexOf(MAIL_SUPPRESSION_ADMIN_ID), ids.indexOf("0029_mail_activity_indexes") + 1, "0030 follows 0029");
      const step = CONTENT_MIGRATIONS.find(entry => entry.id === MAIL_SUPPRESSION_ADMIN_ID);
      const ledgers = CONTENT_MIGRATIONS.find(entry => entry.id === MAIL_LEDGERS_ID);
      assert.ok(step && ledgers);
      assert.equal(step.checksum, MIGRATION_CHECKSUMS[MAIL_SUPPRESSION_ADMIN_ID]);
      await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('w', 'W', 'w', ${AT})`);
      // The dialect matrix built the head schema; rebuild 0023 alone, then apply 0030 to it.
      for (const table of ["mail_suppression_removals", "mail_send_ledger", "mail_suppression", "mail_feedback_inbox", "mail_capture"]) await kernel.execute(sql.raw(`DROP TABLE ${table}`));
      const options = { ledgerTable: "mail_suppression_admin_step_migrations" };
      await runMigrations(kernel, [ledgers], options);
      await kernel.execute(sql`INSERT INTO mail_suppression (workspace_id, normalized_address, scope, reason, created_at) VALUES ('w', 'a@x.test', 'all', 'bounced', ${AT})`);
      assert.deepEqual((await runMigrations(kernel, [ledgers, step], options)).applied, [MAIL_SUPPRESSION_ADMIN_ID]);
      assert.deepEqual((await runMigrations(kernel, [ledgers, step], options)).applied, [], "a second run applies nothing");
      assert.deepEqual(await kernel.query(sql`SELECT normalized_address FROM mail_suppression`), [{ normalized_address: "a@x.test" }]);
      const row = (id: string, scope: string) => sql`INSERT INTO mail_suppression_removals (id, workspace_id, normalized_address, scope, suppression_reason, suppressed_at, removal_reason, removed_by, removed_at)
        VALUES (${id}, 'w', 'a@x.test', ${scope}, 'bounced', ${AT}, 'mailbox fixed', 'owner', ${AT})`;
      await kernel.execute(row("r1", "all"));
      await assert.rejects(kernel.execute(row("r2", "everything")), "the audit scope is constrained like the suppression scope");
      await kernel.execute(sql`DELETE FROM workspaces WHERE id = 'w'`);
      assert.deepEqual(await kernel.query(sql`SELECT id FROM mail_suppression_removals`), [], "audit rows go with their workspace");
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });
}

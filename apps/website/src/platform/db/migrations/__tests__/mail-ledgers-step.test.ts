import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { MAIL_LEDGERS_ID } from "../0023_mail_ledgers.js";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

/**
 * @file Migration 0023 (`0023_mail_ledgers`) on SQLite and PGlite: registered with its pinned
 * checksum, creates the four tables once, and its keys and checks hold what the mail repos rely on:
 * one ledger row per (workspace, key, recipient), one suppression per (workspace, address, scope),
 * one inbox row per (provider, event id), closed value sets, and rows that go with their workspace.
 */

const TABLES = ["mail_send_ledger", "mail_suppression", "mail_feedback_inbox", "mail_capture"];
const DUPLICATE = { sqlite: /UNIQUE constraint failed/, pglite: /duplicate key value violates unique constraint/ };
const CHECK = { sqlite: /CHECK constraint failed/, pglite: /violates check constraint/ };
const AT = "2026-10-21T12:00:00.000Z";

for (const adapter of eachDialect({ tables: [...TABLES, "workspaces"], make: kernel => kernel })) {
  const name = adapter.name as "sqlite" | "pglite";
  const withKernel = async (body: (kernel: StorageKernel<unknown>) => Promise<void>) => {
    const kernel = adapter.make() as StorageKernel<unknown>;
    try {
      await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('w', 'W', 'w', ${AT}), ('w2', 'W2', 'w2', ${AT})`);
      await body(kernel);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  };
  const ledgerRow = (kernel: StorageKernel<unknown>, workspace: string, outcome = "reserved") =>
    kernel.execute(sql`INSERT INTO mail_send_ledger (workspace_id, idempotency_key, recipient, payload_hash, lane, provider_id, outcome, created_at, updated_at)
      VALUES (${workspace}, 'k', 'a@x.test', 'h', 'transactional', 'smtp', ${outcome}, ${AT}, ${AT})`);

  test(`[${name}] 0023 is registered with its pinned checksum and creates its tables once`, () => withKernel(async (kernel) => {
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === MAIL_LEDGERS_ID);
    assert.ok(step, "0023 must be registered in the active history");
    assert.equal(step.checksum, MIGRATION_CHECKSUMS[MAIL_LEDGERS_ID]);
    for (const table of TABLES) await kernel.execute(sql.raw(`DROP TABLE ${table}`));
    const options = { ledgerTable: "mail_ledgers_step_contract_migrations" };
    assert.deepEqual((await runMigrations(kernel, [step], options)).applied, [MAIL_LEDGERS_ID]);
    assert.deepEqual((await runMigrations(kernel, [step], options)).applied, [], "a second run applies nothing");
    for (const table of TABLES) assert.deepEqual(await kernel.query(sql.raw(`SELECT * FROM ${table}`)), [], `${table} exists and starts empty`);
  }));

  test(`[${name}] 0023 keeps one ledger row per (workspace, key, recipient) with a closed outcome set`, () => withKernel(async (kernel) => {
    await ledgerRow(kernel, "w");
    await ledgerRow(kernel, "w2");
    await assert.rejects(ledgerRow(kernel, "w"), DUPLICATE[name]);
    await assert.rejects(kernel.execute(sql`UPDATE mail_send_ledger SET outcome = 'bogus' WHERE workspace_id = 'w'`), CHECK[name]);
    await assert.rejects(kernel.execute(sql`UPDATE mail_send_ledger SET lane = 'bogus' WHERE workspace_id = 'w'`), CHECK[name]);
  }));

  test(`[${name}] 0023 keeps one suppression per (workspace, address, scope) and one inbox row per (provider, event)`, () => withKernel(async (kernel) => {
    const suppress = (scope: string) => kernel.execute(sql`INSERT INTO mail_suppression (workspace_id, normalized_address, scope, reason, created_at) VALUES ('w', 'a@x.test', ${scope}, 'bounced', ${AT})`);
    await suppress("all");
    await suppress("bulk");
    await assert.rejects(suppress("all"), DUPLICATE[name]);
    await assert.rejects(suppress("some"), CHECK[name]);
    const inbox = (workspace: string, hard: number) => kernel.execute(sql`INSERT INTO mail_feedback_inbox (provider_id, event_id, workspace_id, recipient, kind, hard_bounce, provider_message_id, occurred_at, received_at)
      VALUES ('resend', 'e1', ${workspace}, 'a@x.test', 'bounced', ${hard}, 'm1', ${AT}, ${AT})`);
    await assert.rejects(inbox("w", 2), CHECK[name]);
    await inbox("w", 1);
    await assert.rejects(inbox("w2", 0), DUPLICATE[name], "event ids are unique per provider, across workspaces");
  }));

  test(`[${name}] 0023 rows go with their workspace and require one that exists`, () => withKernel(async (kernel) => {
    await ledgerRow(kernel, "w");
    await ledgerRow(kernel, "w2");
    await kernel.execute(sql`INSERT INTO mail_capture (id, workspace_id, lane, idempotency_key, to_address, subject, payload_json, created_at) VALUES ('c1', 'w', 'bulk', 'k', 'a@x.test', 'Hi', '{}', ${AT})`);
    await kernel.execute(sql`DELETE FROM workspaces WHERE id = 'w'`);
    assert.deepEqual(await kernel.query(sql`SELECT workspace_id FROM mail_send_ledger`), [{ workspace_id: "w2" }]);
    assert.deepEqual(await kernel.query(sql`SELECT id FROM mail_capture`), []);
    await assert.rejects(ledgerRow(kernel, "missing"), /FOREIGN KEY|foreign key/);
  }));
}

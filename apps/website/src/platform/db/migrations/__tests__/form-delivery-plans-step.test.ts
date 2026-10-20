import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

/**
 * @file Migration 0019 (`0019_form_delivery_plans`) on SQLite and PGlite: registered with its pinned
 * checksum, creates the three tables from scratch, applies once, and its keys hold the invariants
 * the delivery code relies on: one plan per (workspace, submission), one job per binding per
 * submission, one pull row per (workspace, receiver) with a required last start.
 */

const ID = "0019_form_delivery_plans";
const TABLES = ["form_delivery_jobs", "form_delivery_plans", "form_receiver_pulls"];

/** The driver's refusal for a duplicate key or a missing required column. */
const DUPLICATE = { sqlite: /UNIQUE constraint failed/, pglite: /duplicate key value violates unique constraint/ };
const NOT_NULL = { sqlite: /NOT NULL constraint failed: form_receiver_pulls\.last_started_at/, pglite: /null value in column "last_started_at"/ };

for (const adapter of eachDialect({ tables: TABLES, make: kernel => kernel })) {
  const name = adapter.name as "sqlite" | "pglite";

  test(`[${name}] 0019 is registered with its pinned checksum and creates its tables once`, async () => {
    const kernel = adapter.make();
    try {
      const step = CONTENT_MIGRATIONS.find(entry => entry.id === ID);
      assert.ok(step, "0019 must be registered in the active history");
      assert.equal(step.checksum, MIGRATION_CHECKSUMS[ID]);
      for (const table of TABLES) await kernel.execute(sql.raw(`DROP TABLE ${table}`));
      const options = { ledgerTable: "form_delivery_step_contract_migrations" };
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, [step], options)).applied, [ID]);
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, [step], options)).applied, [], "a second run applies nothing");
      for (const table of TABLES) assert.deepEqual(await kernel.query(sql.raw(`SELECT * FROM ${table}`)), [], `${table} exists and starts empty`);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });

  test(`[${name}] 0019 keeps one plan per (workspace, submission)`, async () => {
    const kernel = adapter.make();
    try {
      await kernel.execute(sql`INSERT INTO form_delivery_plans (workspace_id, submission_id, form_id) VALUES ('w', 's1', 'f1')`);
      await kernel.execute(sql`INSERT INTO form_delivery_plans (workspace_id, submission_id, form_id) VALUES ('w2', 's1', 'f1')`);
      await assert.rejects(kernel.execute(sql`INSERT INTO form_delivery_plans (workspace_id, submission_id, form_id) VALUES ('w', 's1', 'f2')`), DUPLICATE[name]);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });

  test(`[${name}] 0019 keeps one delivery job per binding per submission`, async () => {
    const kernel = adapter.make();
    try {
      await kernel.execute(sql`INSERT INTO form_delivery_jobs (job_id, workspace_id, submission_id, binding_id, adapter_id) VALUES ('j1', 'w', 's1', 'b1', 'a')`);
      await kernel.execute(sql`INSERT INTO form_delivery_jobs (job_id, workspace_id, submission_id, binding_id, adapter_id) VALUES ('j2', 'w', 's1', 'b2', 'a')`);
      await assert.rejects(kernel.execute(sql`INSERT INTO form_delivery_jobs (job_id, workspace_id, submission_id, binding_id, adapter_id) VALUES ('j3', 'w', 's1', 'b1', 'a')`), DUPLICATE[name]);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });

  test(`[${name}] 0019 keeps one pull row per (workspace, receiver), with a required last start and an optional lease`, async () => {
    const kernel = adapter.make();
    try {
      await kernel.execute(sql`INSERT INTO form_receiver_pulls (workspace_id, receiver_key, last_started_at) VALUES ('w', 'r', '2026-10-20T12:00:00.000Z')`);
      await assert.rejects(kernel.execute(sql`INSERT INTO form_receiver_pulls (workspace_id, receiver_key, last_started_at) VALUES ('w', 'r', '2026-10-20T12:01:00.000Z')`), DUPLICATE[name]);
      await assert.rejects(kernel.execute(sql`INSERT INTO form_receiver_pulls (workspace_id, receiver_key) VALUES ('w', 'r2')`), NOT_NULL[name]);
      assert.deepEqual(await kernel.query(sql`SELECT lease_token, lease_expires_at FROM form_receiver_pulls WHERE receiver_key = 'r'`), [{ lease_token: null, lease_expires_at: null }]);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });
}

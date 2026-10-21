import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

/**
 * @file Migration 0023 (`0023_search_index`) on SQLite and PGlite: registered with its pinned
 * checksum, creates the three tables from scratch, applies once, and its keys and CHECKs hold what
 * the site-search store relies on: one state row per (target, key), one watermark per (target,
 * collection), one pointer row per site, statuses from the port's union only, 0/1 booleans, and a
 * pointer that is never half a target.
 */

const ID = "0023_search_index";
const TABLES = ["search_index_state", "search_index_targets", "search_index_watermarks"];

const DUPLICATE = { sqlite: /UNIQUE constraint failed/, pglite: /duplicate key value violates unique constraint/ };
const CHECK = { sqlite: /CHECK constraint failed/, pglite: /violates check constraint/ };

const state = (overrides: { status?: string; deleted?: number; docKey?: string } = {}) =>
  sql`INSERT INTO search_index_state (site_id, provider_id, generation, doc_key, workspace_id, collection, document_id, revision, deleted, status, updated_at_ms)
      VALUES ('s', 'builtin', 1, ${overrides.docKey ?? "s/w/post/1"}, 'w', 'post', '1', 1760000000000, ${overrides.deleted ?? 0}, ${overrides.status ?? "pending"}, 1760000000000)`;

for (const adapter of eachDialect({ tables: TABLES, make: kernel => kernel })) {
  const name = adapter.name as "sqlite" | "pglite";

  test(`[${name}] 0023 is registered with its pinned checksum and creates its tables once`, async () => {
    const kernel = adapter.make();
    try {
      const step = CONTENT_MIGRATIONS.find(entry => entry.id === ID);
      assert.ok(step, "0023 must be registered in the active history");
      assert.equal(step.checksum, MIGRATION_CHECKSUMS[ID]);
      assert.equal(CONTENT_MIGRATIONS.findIndex(entry => entry.id === ID), CONTENT_MIGRATIONS.findIndex(entry => entry.id === "0022_workspace_mcp_cascade") + 1, "0023 follows 0022");
      for (const table of TABLES) await kernel.execute(sql.raw(`DROP TABLE ${table}`));
      const options = { ledgerTable: "search_index_step_contract_migrations" };
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, [step], options)).applied, [ID]);
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, [step], options)).applied, [], "a second run applies nothing");
      for (const table of TABLES) assert.deepEqual(await kernel.query(sql.raw(`SELECT * FROM ${table}`)), [], `${table} exists and starts empty`);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });

  test(`[${name}] 0023 keeps one state row per (target, key) with attempts defaulting to 0`, async () => {
    const kernel = adapter.make();
    try {
      await kernel.execute(state());
      await kernel.execute(state({ docKey: "s/w/post/2" }));
      await assert.rejects(kernel.execute(state()), DUPLICATE[name]);
      assert.deepEqual(await kernel.query(sql`SELECT attempts, task_id, last_error FROM search_index_state WHERE doc_key = 's/w/post/1'`),
        [{ attempts: 0, task_id: null, last_error: null }]);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });

  test(`[${name}] 0023 refuses a status outside the port's union and a non-0/1 boolean`, async () => {
    const kernel = adapter.make();
    try {
      for (const status of ["pending", "indexed", "unknown", "failed"]) await kernel.execute(state({ status, docKey: status }));
      await assert.rejects(kernel.execute(state({ status: "done", docKey: "x" })), CHECK[name]);
      await assert.rejects(kernel.execute(state({ deleted: 2, docKey: "y" })), CHECK[name]);
      await assert.rejects(kernel.execute(sql`INSERT INTO search_index_watermarks (site_id, provider_id, generation, collection, done) VALUES ('s', 'b', 1, 'post', 2)`), CHECK[name]);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });

  test(`[${name}] 0023 keeps one watermark per (target, collection) and one pointer row per site, never half a target`, async () => {
    const kernel = adapter.make();
    try {
      await kernel.execute(sql`INSERT INTO search_index_watermarks (site_id, provider_id, generation, collection, done) VALUES ('s', 'b', 1, 'post', 0)`);
      await assert.rejects(kernel.execute(sql`INSERT INTO search_index_watermarks (site_id, provider_id, generation, collection, cursor, done) VALUES ('s', 'b', 1, 'post', 'c', 1)`), DUPLICATE[name]);
      await kernel.execute(sql`INSERT INTO search_index_targets (site_id, updated_at_ms) VALUES ('s', 1)`);
      await assert.rejects(kernel.execute(sql`INSERT INTO search_index_targets (site_id, updated_at_ms) VALUES ('s', 2)`), DUPLICATE[name]);
      await assert.rejects(kernel.execute(sql`INSERT INTO search_index_targets (site_id, active_provider_id, updated_at_ms) VALUES ('t', 'b', 1)`), CHECK[name]);
      await assert.rejects(kernel.execute(sql`INSERT INTO search_index_targets (site_id, building_generation, updated_at_ms) VALUES ('u', 1, 1)`), CHECK[name]);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });
}

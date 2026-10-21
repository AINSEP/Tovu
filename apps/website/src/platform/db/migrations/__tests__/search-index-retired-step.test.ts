import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

/**
 * @file Migration 0028 (`0028_search_index_retired`) on SQLite and PGlite: registered at the head
 * with its pinned checksum, creates its table once, and keeps one row per retired (site, provider,
 * generation).
 */

const ID = "0028_search_index_retired";
const DUPLICATE = { sqlite: /UNIQUE constraint failed/, pglite: /duplicate key value violates unique constraint/ };
const retire = (generation: number) =>
  sql`INSERT INTO search_index_retired (site_id, provider_id, generation, retired_at_ms) VALUES ('s', 'meilisearch', ${generation}, 1760000000000)`;

for (const adapter of eachDialect({ tables: ["search_index_retired"], make: kernel => kernel })) {
  const name = adapter.name as "sqlite" | "pglite";

  test(`[${name}] 0028 is the head, pinned, and creates its table once`, async () => {
    const kernel = adapter.make();
    try {
      const step = CONTENT_MIGRATIONS.find(entry => entry.id === ID);
      assert.ok(step, "0028 must be registered in the active history");
      assert.equal(step.checksum, MIGRATION_CHECKSUMS[ID]);
      assert.equal(CONTENT_MIGRATIONS.at(-1)?.id, ID, "0028 is the head");
      await kernel.execute(sql.raw("DROP TABLE search_index_retired"));
      const options = { ledgerTable: "search_index_retired_step_contract_migrations" };
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, [step], options)).applied, [ID]);
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, [step], options)).applied, [], "a second run applies nothing");
      assert.deepEqual(await kernel.query(sql`SELECT * FROM search_index_retired`), []);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });

  test(`[${name}] 0028 keeps one row per retired (site, provider, generation)`, async () => {
    const kernel = adapter.make();
    try {
      await kernel.execute(retire(1));
      await kernel.execute(retire(2));
      await assert.rejects(kernel.execute(retire(1)), DUPLICATE[name]);
      assert.equal((await kernel.query(sql`SELECT generation FROM search_index_retired`)).length, 2);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });
}

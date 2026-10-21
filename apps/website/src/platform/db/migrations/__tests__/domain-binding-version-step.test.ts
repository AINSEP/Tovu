import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { DOMAIN_BINDINGS_ID } from "../0024_domain_bindings.js";
import { DOMAIN_BINDING_VERSION_ID } from "../0026_domain_binding_version.js";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

/**
 * @file Migration 0026 (`0026_domain_binding_version`) on SQLite and PGlite: registered after 0025
 * with its pinned checksum, adds `domain_binding.version` once, starts rows that predate it at 0
 * (what the compare-and-swap store then expects) and refuses a negative version.
 */

const CHECK = { sqlite: /CHECK constraint failed/, pglite: /violates check constraint/ };
const AT = "2026-10-21T12:00:00.000Z";

for (const adapter of eachDialect({ tables: ["domain_binding", "workspaces"], make: kernel => kernel })) {
  const name = adapter.name as "sqlite" | "pglite";
  test(`[${name}] 0026 is registered after 0025 and adds a version column starting at 0`, async () => {
    const kernel = adapter.make() as StorageKernel<unknown>;
    try {
      const ids = CONTENT_MIGRATIONS.map(entry => entry.id);
      assert.equal(ids.indexOf(DOMAIN_BINDING_VERSION_ID), ids.indexOf("0025_mail_feedback_processed") + 1, "0026 follows 0025");
      const step = CONTENT_MIGRATIONS.find(entry => entry.id === DOMAIN_BINDING_VERSION_ID);
      const bindings = CONTENT_MIGRATIONS.find(entry => entry.id === DOMAIN_BINDINGS_ID);
      assert.ok(step && bindings);
      assert.equal(step.checksum, MIGRATION_CHECKSUMS[DOMAIN_BINDING_VERSION_ID]);
      await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('w', 'W', 'w', ${AT})`);
      // Rebuild the 0024 table, add a row from before 0026, then apply 0026 to it.
      await kernel.execute(sql.raw("DROP TABLE domain_binding"));
      const options = { ledgerTable: "domain_binding_version_step_migrations" };
      await runMigrations(kernel, [bindings], options);
      await kernel.execute(sql`INSERT INTO domain_binding (workspace_id, hostname, zone, requirements_json, status, started_at, created_at, updated_at)
        VALUES ('w', 'www.example.com', 'example.com', '[]', 'pending', ${AT}, ${AT}, ${AT})`);
      assert.deepEqual((await runMigrations(kernel, [bindings, step], options)).applied, [DOMAIN_BINDING_VERSION_ID]);
      assert.deepEqual((await runMigrations(kernel, [bindings, step], options)).applied, [], "a second run applies nothing");
      const [row] = await kernel.query<{ version: number | string }>(sql`SELECT version FROM domain_binding`);
      assert.equal(Number(row?.version), 0);
      await assert.rejects(kernel.execute(sql`UPDATE domain_binding SET version = -1`), CHECK[name]);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  });
}

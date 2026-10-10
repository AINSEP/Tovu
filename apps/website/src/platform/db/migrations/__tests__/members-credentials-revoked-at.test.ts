import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { listColumns } from "#src/platform/db/kernel/dialect";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

const ID = "0010_members_credentials_revoked_at";

for (const adapter of eachDialect({ tables: ["members"], make: kernel => kernel })) {
  test(`[${adapter.name}] member credential cutoff migration is nullable, preserves legacy rows, and applies once`, async () => {
    const kernel = adapter.make();
    try {
      const step = CONTENT_MIGRATIONS.find(entry => entry.id === ID);
      assert.ok(step, "credential cutoff must be registered in the active history");
      assert.equal(step.checksum, MIGRATION_CHECKSUMS[ID]);
      await kernel.execute(sql`ALTER TABLE members DROP COLUMN credentials_revoked_at`);
      await kernel.execute(sql`INSERT INTO members (id, workspace_id, email, status, created_at, updated_at, version)
        VALUES ('cutoff-legacy', 'ws', 'legacy@example.test', 'active', '2026-01-01', '2026-01-02', 7)`);
      const options = { ledgerTable: "cutoff_contract_migrations" };
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, [step], options)).applied, [ID]);
      const column = (await listColumns(kernel, "members")).find(column => column.name === "credentials_revoked_at");
      assert.equal(column?.notNull, false);
      assert.equal(column?.type.toLowerCase(), "text");
      assert.deepEqual(await kernel.query(sql`SELECT email, status, updated_at, version, credentials_revoked_at
        FROM members WHERE id = 'cutoff-legacy'`), [{ email: "legacy@example.test", status: "active",
          updated_at: "2026-01-02", version: 7, credentials_revoked_at: null }]);
      await kernel.execute(sql`UPDATE members SET credentials_revoked_at = '2026-10-09T12:00:00.000Z'
        WHERE id = 'cutoff-legacy'`);
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, [step], options)).applied, []);
      assert.deepEqual(await kernel.query(sql`SELECT credentials_revoked_at FROM members WHERE id = 'cutoff-legacy'`),
        [{ credentials_revoked_at: "2026-10-09T12:00:00.000Z" }]);
    } finally {
      await kernel.execute(sql`DELETE FROM members WHERE id = 'cutoff-legacy'`);
      if (adapter.name === "sqlite") await kernel.close();
    }
  });
}

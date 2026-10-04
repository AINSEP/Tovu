import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { listColumns } from "#src/platform/db/kernel/dialect";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { runMigrations } from "../runner.js";
import { mediaCreatedBy } from "../0005_media_createdby.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

/** Owner dispatch 2026-10-04: staged additive migration, legacy unknown and exactly-once apply. */
for (const adapter of eachDialect({ tables: ["media"], make: kernel => kernel })) {
  test(`[${adapter.name}] media creator migration leaves existing attribution NULL and applies once`, async () => {
    const kernel = adapter.make();
    if ((await listColumns(kernel, "media")).some(column => column.name === "created_by")) {
      await kernel.execute(sql`ALTER TABLE media DROP COLUMN created_by`);
    }
    await kernel.execute(sql`INSERT INTO media
      (id, workspace_id, title, slug, alt, caption, credit, source_sha256, status, created_at, updated_at, version)
      VALUES ('legacy', 'ws', 'Legacy', 'legacy', '', '', 'Generated with Higgsfield', 'hash', 'active', 'now', 'now', 1)`);
    const step = mediaCreatedBy({ checksum: MIGRATION_CHECKSUMS["0005_media_createdby"]! });
    const options = { ledgerTable: "media_createdby_test_migrations" };
    try {
      const first = await runMigrations(kernel as StorageKernel<unknown>, [step], options);
      assert.deepEqual(first.applied, ["0005_media_createdby"]);
      assert.deepEqual((await kernel.query<{ created_by: string | null }>(sql`SELECT created_by FROM media WHERE id = 'legacy'`)), [{ created_by: null }]);
      assert.equal((await listColumns(kernel, "media")).find(column => column.name === "created_by")?.notNull, false);
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, [step], options)).applied, []);
    } finally {
      await kernel.execute(sql`ALTER TABLE media DROP COLUMN created_by`);
      if (adapter.name === "sqlite") await kernel.close();
    }
  });
}

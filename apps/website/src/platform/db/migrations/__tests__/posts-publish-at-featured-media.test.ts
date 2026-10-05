import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { listColumns } from "#src/platform/db/kernel/dialect";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { runMigrations } from "../runner.js";
import { postsPublishAtFeaturedMedia } from "../0008_posts_publish_at_featured_media.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

const ID = "0008_posts_publish_at_featured_media";
const COLUMNS = ["publish_at", "featured_media_id"] as const;

/** Owner dispatch 2026-10-05: additive nullable columns; a legacy row reads back unscheduled with no image. */
for (const adapter of eachDialect({ tables: ["posts"], make: kernel => kernel })) {
  test(`[${adapter.name}] posts schedule/featured-image migration leaves legacy rows NULL and applies once`, async () => {
    const kernel = adapter.make();
    const present = async () => (await listColumns(kernel, "posts")).filter(column => (COLUMNS as readonly string[]).includes(column.name));
    for (const column of await present()) await kernel.execute(sql`ALTER TABLE posts DROP COLUMN ${sql.raw(column.name)}`);
    await kernel.execute(sql`INSERT INTO posts (id, workspace_id, title, slug, body_json, status, updated_at, version)
      VALUES ('legacy', 'ws', 'Legacy', 'legacy', '{}', 'published', 'now', 1)`);
    const step = postsPublishAtFeaturedMedia({ checksum: MIGRATION_CHECKSUMS[ID]! });
    const options = { ledgerTable: "posts_publish_at_test_migrations" };
    try {
      const first = await runMigrations(kernel as StorageKernel<unknown>, [step], options);
      assert.deepEqual(first.applied, [ID]);
      assert.deepEqual(
        await kernel.query<{ publish_at: string | null; featured_media_id: string | null }>(sql`SELECT publish_at, featured_media_id FROM posts WHERE id = 'legacy'`),
        [{ publish_at: null, featured_media_id: null }],
      );
      assert.deepEqual((await present()).map(column => [column.name, column.notNull]).sort(), [["featured_media_id", false], ["publish_at", false]]);
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, [step], options)).applied, []);
    } finally {
      await kernel.execute(sql`DELETE FROM posts WHERE id = 'legacy'`);
      if (adapter.name === "sqlite") await kernel.close();
    }
  });
}

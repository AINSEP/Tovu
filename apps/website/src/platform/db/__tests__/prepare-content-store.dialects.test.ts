import assert from "node:assert/strict";
import { test } from "node:test";

import { freshSqliteContentKernel, sharedPgContentKernel, type ContentKernel } from "../kernel/__tests__/dialect-matrix.js";
import { prepareContentStore } from "../prepare-content-store.js";
import { seededPosts, seededPresentation, seededWorkspace } from "#src/server/runtime/configuration/seed";

/**
 * @file `prepareContentStore` (watermark singleton + first-run demo seed) writes the same rows on
 * SQLite and PGlite, and is idempotent on both (storage plan R1c).
 */

const seed = { workspace: seededWorkspace, posts: seededPosts, presentation: seededPresentation };

async function snapshot(kernel: ContentKernel) {
  return kernel.run(async (db) => ({
    watermark: (await db.selectFrom("database_write_watermark").select(["id", "value", "last_stamped_at"]).execute()).map((row) => ({
      ...row,
      id: Number(row.id),
      value: Number(row.value),
    })),
    workspaces: await db.selectFrom("workspaces").select(["id", "name", "slug", "created_at"]).orderBy("id").execute(),
    posts: (
      await db
        .selectFrom("posts")
        .select(["id", "workspace_id", "title", "slug", "kind", "status", "body_json", "body_format", "body_html", "ext", "updated_at", "version"])
        .orderBy("id")
        .execute()
    ).map((row) => ({ ...row, version: Number(row.version), body_json: JSON.parse(String(row.body_json)), ext: JSON.parse(String(row.ext)) })),
    presentation: await db.selectFrom("presentation_settings").select(["workspace_id", "active_theme_id", "updated_at"]).execute(),
  }));
}

test("the watermark row and the demo seed are the same rows on SQLite and PGlite, and a second prepare changes nothing", async () => {
  const sqlite = freshSqliteContentKernel();
  const pg = sharedPgContentKernel();
  for (const kernel of [sqlite, pg]) {
    await prepareContentStore(kernel, { seed });
    await prepareContentStore(kernel, { seed });
  }
  const onSqlite = await snapshot(sqlite);
  const onPg = await snapshot(pg);
  assert.deepEqual(onSqlite.watermark, [{ id: 1, value: 0, last_stamped_at: null }]);
  assert.equal(onSqlite.workspaces.length, 1);
  assert.equal(onSqlite.posts.length, seededPosts.length);
  assert.deepEqual(onPg, onSqlite);
});

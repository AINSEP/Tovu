import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { seededPosts, seededPresentation, seededWorkspace } from "#src/server/runtime/configuration/seed";
import type { ContentDatabase } from "../content-database.generated.js";
import type { ContentKernel } from "../content-kernel.js";
import { openPostgresKernel, type StorageKernel } from "../kernel/index.js";
import { migrateContentDatabase } from "../migrations/index.js";
import { prepareContentStore } from "../prepare-content-store.js";
import { freshPostgresDatabase } from "./postgres-database.js";

/**
 * @file `prepareContentStore` on a REAL Postgres server brought to head by the migration runner
 * (R1c): the watermark singleton and the demo seed land once, and a second prepare changes nothing.
 * Fails (never skips) when the local server is down.
 */

const DATABASE = "tovu_seed_content_store_pg_fixture";

let kernel: ContentKernel;

before(async () => {
  kernel = openPostgresKernel<ContentDatabase>({ connectionString: freshPostgresDatabase(DATABASE) });
  await migrateContentDatabase(kernel as unknown as StorageKernel<unknown>);
});

after(async () => {
  await kernel?.close();
});

test("runner-to-head, then prepare twice: one watermark row, one seeded workspace with its posts and presentation", async () => {
  const seed = { workspace: seededWorkspace, posts: seededPosts, presentation: seededPresentation };
  await prepareContentStore(kernel, { seed });
  await prepareContentStore(kernel, { seed });

  const watermark = await kernel.run((db) => db.selectFrom("database_write_watermark").select(["id", "value"]).execute());
  assert.deepEqual(watermark.map((row) => ({ id: Number(row.id), value: Number(row.value) })), [{ id: 1, value: 0 }]);
  const workspaces = await kernel.run((db) => db.selectFrom("workspaces").select(["id", "slug"]).execute());
  assert.deepEqual(workspaces, [{ id: seededWorkspace.id, slug: seededWorkspace.slug }]);
  const posts = await kernel.run((db) => db.selectFrom("posts").select("id").orderBy("id").execute());
  assert.deepEqual(posts.map((row) => row.id), seededPosts.map((post) => post.id).sort());
  const presentation = await kernel.run((db) => db.selectFrom("presentation_settings").select(["workspace_id", "active_theme_id"]).execute());
  assert.deepEqual(presentation, [{ workspace_id: seededWorkspace.id, active_theme_id: seededPresentation.activeThemeId }]);
});

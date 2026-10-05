import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { openPostgresKernel, type StorageKernel } from "#src/platform/db/kernel/index";
import { migrateContentDatabase } from "#src/platform/db/migrations/index";
import { prepareContentStore } from "#src/platform/db/prepare-content-store";
import { dropDatabase, freshPostgresDatabase } from "#src/platform/db/__tests__/postgres-database";
import { removeUnreadableOwnerEntries, UNREADABLE_OWNER_ENTRIES_REPAIR_SETTING_ID } from "../../unreadable-owner-entries-repair.js";

/**
 * @file The unreadable-owner boot repair on a REAL Postgres server: two independent pools (the API
 * process and the agent daemon both boot through `preparePgStore`) running it at once remove each
 * row exactly once and write one marker; readable rows survive. Fails (never skips) when the local
 * server is down.
 */

const DATABASE = "tovu_unreadable_owner_entries_repair_pg_fixture";
const WS = "ws-repair";
const AT = "2026-10-04T00:00:00.000Z";

const opened: ContentKernel[] = [];
after(async () => {
  for (const kernel of opened) await kernel.close();
  dropDatabase(DATABASE);
});

async function insertEntry(kernel: ContentKernel, id: string, type: string, fields: unknown): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("entries")
      .values({
        id, workspace_id: WS, type, slug: id, status: "published", title: id, body_json: null, fields_json: JSON.stringify(fields),
        published_at: null, created_at: AT, updated_at: AT, version: 1, deleted_at: null,
      })
      .execute()
  );
}

test("two processes booting at once: the mismatched rows go exactly once, one marker, readable rows survive", async () => {
  const url = freshPostgresDatabase(DATABASE);
  const [api, daemon] = [0, 1].map(() => openPostgresKernel<ContentDatabase>({ connectionString: url }));
  opened.push(api!, daemon!);
  await migrateContentDatabase(api as unknown as StorageKernel<unknown>);
  await prepareContentStore(api!);
  await insertEntry(api!, "probe-widget", "widget", { ext: { site: { payload: "probe" } } });
  await insertEntry(api!, "probe-area", "widget_area", { ext: { site: { payload: "probe" } } });
  await insertEntry(api!, "valid-widget", "widget", { ext: { widget: { payload: "{}" } } });
  await insertEntry(api!, "both-widget", "widget", { ext: { widget: { payload: "{}" }, site: { payload: "stray" } } });
  await insertEntry(api!, "recipe", "recipe", { ext: { site: { servings: 2 } } });

  const results = await Promise.all([api!, daemon!].map((kernel) => removeUnreadableOwnerEntries({ kernel }, { log: () => {} })));

  assert.deepEqual(results.map((result) => result.ran).sort(), [false, true], "the second runner waits on the lock, then sees the marker");
  const winner = results.find((result) => result.ran)!;
  assert.deepEqual(winner.removed.map((row) => [row.id, row.via]), [["probe-area", "hard-delete"], ["probe-widget", "trash-purge"]]);
  const ids = await api!.run((db) => db.selectFrom("entries").select("id").orderBy("id").execute());
  assert.deepEqual(ids.map((row) => row.id), ["both-widget", "recipe", "valid-widget"]);
  const markers = await api!.run((db) => db.selectFrom("setting_values_global").select("setting_id").where("setting_id", "=", UNREADABLE_OWNER_ENTRIES_REPAIR_SETTING_ID).execute());
  assert.equal(markers.length, 1);
  const watermark = await api!.run((db) => db.selectFrom("database_write_watermark").select("value").where("id", "=", 1).executeTakeFirstOrThrow());
  assert.equal(Number(watermark.value), 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";

import { contentKernel } from "../../content-kernel.js";
import { closeSqliteConnection } from "../../kernel/drivers/sqlite.js";
import { openContentDb } from "../../sqlite/content-db.js";
import { listGridTrashDeadlines, readMediaGridItem, readMediaGridPage } from "../media-grid-query.js";

const WORKSPACE = "grid-test";
const NOW = "2026-01-01T00:00:00.000Z";

test("an empty alphabetical grid and an exact miss report numeric zero counts", async t => {
  const db = openContentDb(":memory:");
  t.after(() => closeSqliteConnection({ source: db }));
  const kernel = contentKernel({ store: db });
  const scope = { kernel, workspaceId: WORKSPACE, tab: "all" } as const;
  const summary = { counts: { all: 0, images: 0, videos: 0, trash: 0 }, hasUntypedActive: false };
  await kernel.execute(sql`INSERT INTO media (id, workspace_id, title, slug, alt, caption, credit, source_sha256, status, created_at, updated_at, version)
    VALUES ('elsewhere', 'other-workspace', 'Visible elsewhere', 'elsewhere', '', '', '', 'blob', 'active', ${NOW}, ${NOW}, 1)`);
  assert.deepEqual(await readMediaGridPage({ ...scope, orderBy: "alphabetical", limit: 2 }), { rows: [], ...summary });
  assert.deepEqual(await readMediaGridItem({ ...scope, id: "elsewhere" }), { row: null, ...summary });
});

test("alphabetical paging uses the saved cursor position after deletion and ignores another workspace's MIME", async t => {
  const db = openContentDb(":memory:");
  t.after(() => closeSqliteConnection({ source: db }));
  const kernel = contentKernel({ store: db });
  for (const [id, title, source] of [
    ["later", "zebra", "image-sha"],
    ["same-b", "  APPLE  ", "image-sha"],
    ["same-a", "apple", "image-sha"],
    ["foreign-typed", "aardvark", "foreign-sha"],
  ] as const) {
    await kernel.execute(sql`INSERT INTO media (id, workspace_id, title, slug, alt, caption, credit, source_sha256, status, created_at, updated_at, version)
      VALUES (${id}, ${WORKSPACE}, ${title}, ${id}, '', '', '', ${source}, 'active', ${NOW}, ${NOW}, 1)`);
  }
  await kernel.execute(sql`INSERT INTO asset_blobs (id, workspace_id, sha256, storage_key, created_by_principal, created_at, status, content_type)
    VALUES ('local-blob', ${WORKSPACE}, 'image-sha', 'images/local', 'owner', ${NOW}, 'active', 'image/png'),
           ('foreign-blob', 'other-workspace', 'foreign-sha', 'images/foreign', 'owner', ${NOW}, 'active', 'image/png')`);
  const request = { kernel, workspaceId: WORKSPACE, orderBy: "alphabetical", tab: "images", limit: 1 } as const;
  const first = await readMediaGridPage(request);
  assert.deepEqual(first.rows.map(row => row.id), ["same-a", "same-b"]);
  assert.deepEqual(first.counts, { all: 4, images: 3, videos: 0, trash: 0 });
  assert.equal(first.hasUntypedActive, true);

  await kernel.execute(sql`DELETE FROM media WHERE id = 'same-a'`);
  const second = await readMediaGridPage(request, { after: { id: "same-a", sortValue: "apple" } });
  assert.deepEqual(second.rows.map(row => row.id), ["same-b", "later"]);
  assert.deepEqual(second.counts, { all: 3, images: 2, videos: 0, trash: 0 });
});

test("grid Trash deadlines match only requested media ids in the workspace", async t => {
  const db = openContentDb(":memory:");
  t.after(() => closeSqliteConnection({ source: db }));
  const kernel = contentKernel({ store: db });
  const deadline = "2026-02-01T00:00:00.000Z";
  const unrelatedDeadline = "2026-04-01T00:00:00.000Z";
  await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at)
    VALUES (${WORKSPACE}, 'Grid', 'grid-test', ${NOW}), ('other-workspace', 'Other', 'grid-other', ${NOW})`);
  for (const [id, workspace, type, entity, purgeAfter] of [
    ["local-media", WORKSPACE, "media", "requested", deadline],
    ["local-post", WORKSPACE, "post", "post-only", unrelatedDeadline],
    ["foreign-media", "other-workspace", "media", "foreign-only", unrelatedDeadline],
    ["unrequested-media", WORKSPACE, "media", "unrequested", unrelatedDeadline],
  ] as const) {
    await kernel.execute(sql`INSERT INTO trashed_items (id, workspace_id, entity_type, entity_id, trashed_at, purge_after, actor_principal_id, display_title)
      VALUES (${id}, ${workspace}, ${type}, ${entity}, ${NOW}, ${purgeAfter}, 'owner', 'Trash fixture')`);
  }
  const scope = { kernel, workspaceId: WORKSPACE };
  assert.deepEqual(
    await listGridTrashDeadlines({ ...scope, ids: ["requested", "post-only", "foreign-only", "missing"] }),
    new Map([["requested", deadline]]),
  );
  assert.deepEqual(await listGridTrashDeadlines({ ...scope, ids: [] }), new Map());
});

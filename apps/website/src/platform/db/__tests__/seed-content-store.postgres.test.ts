import assert from "node:assert/strict";
import { after, test } from "node:test";

import { seededPosts, seededPresentation, seededWorkspace } from "#src/server/runtime/configuration/seed";
import type { ContentDatabase } from "../content-database.generated.js";
import type { ContentKernel } from "../content-kernel.js";
import { openPostgresKernel, type StorageKernel } from "../kernel/index.js";
import { migrateContentDatabase } from "../migrations/index.js";
import { prepareContentStore } from "../prepare-content-store.js";
import { dropDatabase, freshPostgresDatabase } from "./postgres-database.js";

/**
 * @file `prepareContentStore` on a REAL Postgres server brought to head by the migration runner
 * (R1c): the watermark singleton and the demo seed land once, and a second prepare changes nothing.
 * Real connections are the point: the seed's `lockKey` guard exists for two processes (API + agent
 * daemon) booting against one Postgres at once, which PGlite's single connection cannot show.
 * Fails (never skips) when the local server is down.
 *
 * Each test gets its own database (test-rigor F1606: the operator-edit, same-slug and concurrent-boot
 * cases need different starting rows).
 */

const DATABASE_PREFIX = "tovu_seed_content_store_pg_fixture";
const seed = { workspace: seededWorkspace, posts: seededPosts, presentation: seededPresentation };

const opened: ContentKernel[] = [];
const databases: string[] = [];

after(async () => {
  for (const kernel of opened) await kernel.close();
  for (const name of databases) dropDatabase(name);
});

/** A fresh database brought to head; `connections` independent kernels (separate pools) on it. */
async function freshKernels(suffix: string, connections = 1): Promise<ContentKernel[]> {
  const name = `${DATABASE_PREFIX}_${suffix}`;
  const url = freshPostgresDatabase(name);
  databases.push(name);
  const kernels = Array.from({ length: connections }, () => openPostgresKernel<ContentDatabase>({ connectionString: url }));
  opened.push(...kernels);
  await migrateContentDatabase(kernels[0] as unknown as StorageKernel<unknown>);
  return kernels;
}

/** Every persisted row the seed or an operator could touch, complete. */
async function snapshot(kernel: ContentKernel) {
  return kernel.run(async (db) => ({
    watermark: await db.selectFrom("database_write_watermark").selectAll().orderBy("id").execute(),
    workspaces: await db.selectFrom("workspaces").selectAll().orderBy("id").execute(),
    posts: await db.selectFrom("posts").selectAll().orderBy("id").execute(),
    presentation: await db.selectFrom("presentation_settings").selectAll().orderBy("workspace_id").execute(),
  }));
}

test("runner-to-head, then prepare twice: one watermark row, one seeded workspace with its posts and presentation", async () => {
  const [kernel] = await freshKernels("twice");
  await prepareContentStore(kernel!, { seed });
  await prepareContentStore(kernel!, { seed });

  const watermark = await kernel!.run((db) => db.selectFrom("database_write_watermark").select(["id", "value"]).execute());
  assert.deepEqual(watermark.map((row) => ({ id: Number(row.id), value: Number(row.value) })), [{ id: 1, value: 0 }]);
  const workspaces = await kernel!.run((db) => db.selectFrom("workspaces").select(["id", "slug"]).execute());
  assert.deepEqual(workspaces, [{ id: seededWorkspace.id, slug: seededWorkspace.slug }]);
  const posts = await kernel!.run((db) => db.selectFrom("posts").select("id").orderBy("id").execute());
  assert.deepEqual(posts.map((row) => row.id), seededPosts.map((post) => post.id).sort());
  const presentation = await kernel!.run((db) => db.selectFrom("presentation_settings").select(["workspace_id", "active_theme_id"]).execute());
  assert.deepEqual(presentation, [{ workspace_id: seededWorkspace.id, active_theme_id: seededPresentation.activeThemeId }]);
});

test("a restart never overwrites operator edits: edited, deleted and re-themed rows survive a second prepare byte for byte", async () => {
  const [kernel] = await freshKernels("edits");
  await prepareContentStore(kernel!, { seed });
  await kernel!.run(async (db) => {
    await db.updateTable("posts").set({ title: "Operator's edited title" }).where("id", "=", seededPosts[0]!.id).execute();
    await db.deleteFrom("posts").where("id", "=", seededPosts[1]!.id).execute();
    await db.updateTable("presentation_settings").set({ active_theme_id: "operator-theme" }).where("workspace_id", "=", seededWorkspace.id).execute();
  });
  const before = await snapshot(kernel!);
  assert.equal(before.posts.length, seededPosts.length - 1);

  await prepareContentStore(kernel!, { seed });
  assert.deepEqual(await snapshot(kernel!), before);
});

test("an existing workspace with the seed's SLUG but a different id is never seeded over: no second workspace, no demo posts", async () => {
  const [kernel] = await freshKernels("same_slug");
  await kernel!.run((db) =>
    db.insertInto("workspaces").values({ id: "operator-workspace", name: "Operator's site", slug: seededWorkspace.slug, created_at: "2026-01-01T00:00:00.000Z" }).execute()
  );
  await prepareContentStore(kernel!, { seed });
  const after = await snapshot(kernel!);
  assert.deepEqual(after.workspaces, [{ id: "operator-workspace", name: "Operator's site", slug: seededWorkspace.slug, created_at: "2026-01-01T00:00:00.000Z" }]);
  assert.deepEqual(after.posts, []);
  assert.deepEqual(after.presentation, []);
});

test("two processes booting at once: the second prepare WAITS on the seed lock the first holds, then seeds nothing twice", async () => {
  const [first, second] = await freshKernels("concurrent", 2);
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let locked!: () => void;
  const lockHeld = new Promise<void>((resolve) => { locked = resolve; });

  // "Process A" holds the seed lock inside its own transaction on its own connection.
  const holder = first!.transaction(async () => {
    await first!.lockKey("seed_content_store");
    locked();
    await released;
  });
  await lockHeld;

  // "Process B" boots. Without the lock it would read no workspace and insert the seed at once.
  let secondDone = false;
  const booting = prepareContentStore(second!, { seed }).then(() => { secondDone = true; });
  try {
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(secondDone, false, "the second boot must block on the seed lock while the first holds it");
  } finally {
    // Always end A's transaction, or a failed assertion leaves its connection open and after() hangs.
    release();
    await holder;
    await booting;
  }
  // And a real race of three more boots on the same database still leaves exactly one seed.
  await Promise.all([prepareContentStore(first!, { seed }), prepareContentStore(second!, { seed }), prepareContentStore(first!, { seed })]);

  const after = await snapshot(first!);
  assert.deepEqual(after.workspaces.map((row) => row.id), [seededWorkspace.id]);
  assert.deepEqual(after.posts.map((row) => row.id), seededPosts.map((post) => post.id).sort());
  assert.equal(after.presentation.length, 1);
  assert.equal(after.watermark.length, 1);
});

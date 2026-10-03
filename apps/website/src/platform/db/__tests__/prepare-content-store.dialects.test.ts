import assert from "node:assert/strict";
import { test } from "node:test";

import { emptiedPgContentKernel, freshSqliteContentKernel, sharedPgContentKernel, type ContentKernel } from "../kernel/__tests__/dialect-matrix.js";
import { kernelStampWatermark } from "../watermark-kernel.js";
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
    const before = await snapshot(kernel);
    await prepareContentStore(kernel, { seed });
    assert.deepEqual(await snapshot(kernel), before);
  }
  const onSqlite = await snapshot(sqlite);
  const onPg = await snapshot(pg);
  assert.deepEqual(onSqlite.watermark, [{ id: 1, value: 0, last_stamped_at: null }]);
  assert.equal(onSqlite.workspaces.length, 1);
  assert.equal(onSqlite.posts.length, seededPosts.length);
  assert.equal(onSqlite.presentation.length, 1);
  for (const actual of [onSqlite, onPg]) {
    assert.deepEqual(actual.workspaces, [{
      id: "workspace-local", name: "Local Tovu Workspace", slug: "local-tovu", created_at: "2026-04-06T00:00:00.000Z",
    }]);
    assert.deepEqual(actual.presentation, [{
      workspace_id: "workspace-local", active_theme_id: "tovu-starter", updated_at: "2026-04-06T00:00:00.000Z",
    }]);
    assert.deepEqual(actual.posts, seededPosts.map((post) => ({
      id: post.id, workspace_id: post.workspaceId, title: post.title, slug: post.slug,
      kind: post.kind, status: post.status, body_json: post.bodyJson,
      body_format: post.bodyFormat, body_html: post.bodyHtml, ext: post.ext ?? {},
      updated_at: post.updatedAt, version: post.version,
    })).sort((a, b) => a.id.localeCompare(b.id)));
    assert.deepEqual(actual.posts.find((post) => post.id === "page-blog")?.body_json, {
      type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Everything published on this site, newest first." }] }],
    });
    assert.deepEqual(actual.posts.map((post) => [post.id, post.title]), [
      ["page-blog", "Blog"], ["page-root", "Home"], ["post-about", "What Is Tovu?"],
      ["post-home", "Welcome to Tovu"], ["post-mornings", "Slow Mornings"],
      ["post-plugin-api", "The Plugin API"], ["post-plugins", "How Plugins Work"],
      ["post-self-hosting", "Self-Hosting — Coming Soon"], ["post-themes", "How Themes Work"],
      ["post-typography", "Field Notes: The Weight of Type"],
    ]);
  }
  assert.deepEqual(onPg, onSqlite);
});

for (const [dialect, makeKernel] of [
  ["sqlite", freshSqliteContentKernel], ["pglite", () => emptiedPgContentKernel(["posts", "presentation_settings", "workspaces", "database_write_watermark"])],
] as const) {
  test(`prepare preserves a stamped watermark and operator edits after a workspace slug rename [${dialect}]`, async () => {
    const kernel = makeKernel();
    await prepareContentStore(kernel, { seed });
    await kernelStampWatermark(kernel)();
    await kernel.run(async (db) => {
      await db.updateTable("posts").set({ title: "Operator's edited title", body_json: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Edited by the operator" }] }] }) })
        .where("id", "=", seededPosts[0]!.id).execute();
      await db.deleteFrom("posts").where("id", "=", seededPosts[1]!.id).execute();
      await db.updateTable("workspaces").set({ slug: "operator-renamed-workspace" })
        .where("id", "=", seededWorkspace.id).execute();
    });
    const before = await snapshot(kernel);
    assert.equal(before.watermark[0]?.value, 1);
    assert.ok(before.watermark[0]?.last_stamped_at);
    assert.equal(before.posts.length, seededPosts.length - 1);
    await prepareContentStore(kernel, { seed });
    assert.deepEqual(await snapshot(kernel), before);
  });
}

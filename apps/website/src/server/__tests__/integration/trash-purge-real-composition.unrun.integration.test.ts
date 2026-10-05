// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap #1 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — the Trash's irreversible
 * end (`POST .../trash/purge`) through the REAL site composition on both dialects.
 *
 * Existing coverage stops short of this seam: `admin-trash-routes.test.ts` proves purge against a
 * hand-assembled trash module over `openContentDb(":memory:")` (SQLite only, not the
 * `createSiteRouteDeps` wiring), and the PGlite composition smoke test
 * (`create-site-route-deps.pglite.integration.test.ts`) deletes a post into the Trash but never
 * purges or restores it. So whether the composed `deps.trash` really hard-deletes a post — and its
 * `post_revisions` ledger — on Postgres, and whether restore really clears the marker there, is
 * proven nowhere.
 *
 * Flow per dialect: create post → DELETE (soft) → listed in Trash → purge → row gone from `posts`,
 * its revisions gone, Trash empty, a repeat purge reports `not-found`. And: create → DELETE →
 * restore → the post lists again with `deleted_at` cleared.
 */

async function createPost(site: BootedSite, title: string): Promise<{ id: string; slug: string }> {
  const { post } = await expectJson<{ post: { id: string; slug: string } }>(
    await send(site, "POST", `${site.ws}/posts`, { title, status: "draft" }),
    201
  );
  return post;
}

async function trashRowFor(site: BootedSite, postId: string): Promise<{ id: string; entityType: string; entityId: string; title: string }> {
  const trash = await expectJson<{ items: Array<{ id: string; entityType: string; entityId: string; title: string }> }>(
    await send(site, "GET", `${site.ws}/trash`),
    200
  );
  const rows = trash.items.filter((item) => item.entityId === postId);
  assert.equal(rows.length, 1, `exactly one Trash row for ${postId}: ${JSON.stringify(trash.items)}`);
  return rows[0];
}

async function postRowCount(site: BootedSite, postId: string): Promise<{ posts: number; revisions: number; deletedAt: string | null }> {
  const kernel = site.deps.contentKernel;
  assert.ok(kernel, "the site composition exposes its content kernel");
  const rows = await kernel.run((db) => db.selectFrom("posts").select(["id", "deleted_at"]).where("id", "=", postId).execute());
  const revisions = await kernel.run((db) => db.selectFrom("post_revisions").select("post_id").where("post_id", "=", postId).execute());
  return { posts: rows.length, revisions: revisions.length, deletedAt: rows[0]?.deleted_at ?? null };
}

async function listedPostIds(site: BootedSite): Promise<string[]> {
  const listed = await expectJson<{ posts: Array<{ post: { id: string } }> }>(await send(site, "GET", `${site.ws}/posts`), 200);
  return listed.posts.map((row) => row.post.id);
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] trash purge [${dialect}]: a deleted post is listed in the Trash, purge hard-deletes the row and its revisions, a repeat purge is not-found`, async (t) => {
    const site = await bootSite(t, dialect);
    const post = await createPost(site, `Doomed on ${dialect}`);
    assert.deepEqual((await postRowCount(site, post.id)).posts, 1);

    const deleted = await expectJson<{ post: { id: string } }>(await send(site, "DELETE", `${site.ws}/posts/${post.id}`), 200);
    assert.equal(deleted.post.id, post.id);
    const softDeleted = await postRowCount(site, post.id);
    assert.equal(softDeleted.posts, 1, "a delete is a soft delete: the row stays until purge");
    assert.notEqual(softDeleted.deletedAt, null, "the soft delete stamps deleted_at");
    assert.equal((await listedPostIds(site)).includes(post.id), false, "a trashed post drops out of the admin list");

    const row = await trashRowFor(site, post.id);
    assert.equal(row.entityType, "post");
    assert.equal(row.title, `Doomed on ${dialect}`);

    const purged = await expectJson<unknown>(await send(site, "POST", `${site.ws}/trash/purge`, { ids: [row.id] }), 200);
    assert.deepEqual(purged, { purged: 1, results: [{ id: row.id, outcome: "purged" }] });

    assert.deepEqual(await postRowCount(site, post.id), { posts: 0, revisions: 0, deletedAt: null }, "purge removes the post row and its revision ledger");
    const after = await expectJson<{ items: Array<{ entityId: string }> }>(await send(site, "GET", `${site.ws}/trash`), 200);
    assert.equal(after.items.some((item) => item.entityId === post.id), false, "the purged row leaves the Trash");

    const again = await expectJson<unknown>(await send(site, "POST", `${site.ws}/trash/purge`, { ids: [row.id] }), 200);
    assert.deepEqual(again, { purged: 0, results: [{ id: row.id, outcome: "not-found" }] });
  });

  test(`[unrun] trash restore [${dialect}]: a deleted post restored from the Trash lists again with its marker cleared`, async (t) => {
    const site = await bootSite(t, dialect);
    const post = await createPost(site, `Rescued on ${dialect}`);
    await expectJson(await send(site, "DELETE", `${site.ws}/posts/${post.id}`), 200);
    await trashRowFor(site, post.id);

    const restored = await expectJson<unknown>(
      await send(site, "POST", `${site.ws}/trash/restore`, { items: [{ entityType: "post", entityId: post.id }] }),
      200
    );
    assert.deepEqual(restored, { restored: 1, results: [{ entityType: "post", entityId: post.id, outcome: "restored" }] });

    assert.equal((await postRowCount(site, post.id)).deletedAt, null, "restore clears deleted_at");
    assert.ok((await listedPostIds(site)).includes(post.id), "the restored post lists again");
    const trash = await expectJson<{ items: Array<{ entityId: string }> }>(await send(site, "GET", `${site.ws}/trash`), 200);
    assert.equal(trash.items.some((item) => item.entityId === post.id), false, "the restored post leaves the Trash");
  });

  test(`[unrun] trash purge [${dialect}]: a malformed selection is refused 400 INVALID_INPUT and destroys nothing`, async (t) => {
    const site = await bootSite(t, dialect);
    const post = await createPost(site, `Kept on ${dialect}`);
    await expectJson(await send(site, "DELETE", `${site.ws}/posts/${post.id}`), 200);
    const row = await trashRowFor(site, post.id);

    for (const body of [{}, { ids: [] }, { ids: [""] }, { ids: [row.id, 7] }]) {
      const refused = await expectJson<unknown>(await send(site, "POST", `${site.ws}/trash/purge`, body), 400);
      assert.deepEqual(refused, { error: "expected { ids: [string] } with 1..200 entries", code: "INVALID_INPUT" }, JSON.stringify(body));
    }
    assert.equal((await postRowCount(site, post.id)).posts, 1, "no refused selection reached purgeSelected");
    assert.equal((await trashRowFor(site, post.id)).id, row.id);
  });
}

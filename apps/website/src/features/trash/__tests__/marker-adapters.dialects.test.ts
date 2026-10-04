import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";

import { createMediaTrashAdapter } from "../adapters/media.js";
import { createPostTrashAdapter } from "../adapters/post.js";
import { createRedirectTrashAdapter } from "../adapters/redirect.js";

/**
 * @file The bespoke marker adapters (`marker-sql.ts`'s `flipMarker`/`compareAndDelete`) on every
 * dialect the storage kernel drives — ONE query body: post (timestamp marker, revisions cascade),
 * redirect (status marker, revisions + hits cascade), media (status marker, delegated purge).
 * The comments adapter's plugin table is not part of the core schema, so its SQLite suites cover it.
 */

const WS = "ws-marker-dialects";
const T0 = "2026-09-01T00:00:00.000Z";
const AT = "2026-09-28T12:00:00.000Z";

const TABLES = ["workspaces", "posts", "post_revisions", "redirects", "redirect_revisions", "redirect_hits", "media"] as const;

async function seedWorkspace(kernel: ContentKernel): Promise<void> {
  await kernel.run((db) =>
    db.insertInto("workspaces").values({ id: WS, name: WS, slug: WS, created_at: T0 }).onConflict((oc) => oc.doNothing()).execute()
  );
}

async function seedPost(kernel: ContentKernel, id: string): Promise<void> {
  await seedWorkspace(kernel);
  await kernel.run((db) =>
    db
      .insertInto("posts")
      .values({ id, workspace_id: WS, title: `Post ${id}`, slug: `p-${id}`, body_json: "{}", status: "published", updated_at: T0, version: 1 })
      .execute()
  );
  await kernel.run((db) =>
    db
      .insertInto("post_revisions")
      .values({ id: `rev-${id}`, post_id: id, workspace_id: WS, seq: 1, op: "create", state_json: "{}", content_hash: "h", actor_id: "a", recorded_at: T0 })
      .execute()
  );
}

async function seedRedirect(kernel: ContentKernel, id: string): Promise<void> {
  await seedWorkspace(kernel);
  await kernel.run((db) =>
    db
      .insertInto("redirects")
      .values({
        id,
        workspace_id: WS,
        match_type: "exact",
        from_pattern: `/from-${id}`,
        to_target: "/to",
        status_code: 301,
        status: "active",
        override: 0,
        priority: 0,
        source: "manual",
        created_by_principal: "p-1",
        created_at: T0,
        updated_at: T0,
        version: 1,
      })
      .execute()
  );
  await kernel.run((db) =>
    db
      .insertInto("redirect_revisions")
      .values({ redirect_id: id, workspace_id: WS, seq: 1, state_json: "{}", tombstoned: 0, actor_id: "a", recorded_at: T0 })
      .execute()
  );
  await kernel.run((db) => db.insertInto("redirect_hits").values({ redirect_id: id, workspace_id: WS, last_hit_at: T0 }).execute());
}

async function seedMedia(kernel: ContentKernel, id: string): Promise<void> {
  await seedWorkspace(kernel);
  await kernel.run((db) =>
    db
      .insertInto("media")
      .values({ id, workspace_id: WS, title: id, alt: "", caption: "", credit: "", source_sha256: "0".repeat(64), status: "active", created_at: T0, updated_at: T0, version: 1 })
      .execute()
  );
}

async function count(kernel: ContentKernel, table: (typeof TABLES)[number]): Promise<number> {
  const row = await kernel.run((db) => db.selectFrom(table).select((eb) => eb.fn.countAll().as("n")).executeTakeFirstOrThrow());
  return Number(row.n);
}

describeEachDialect("trash marker adapters", { tables: TABLES, make: (kernel: ContentKernel) => kernel }, (make) => {
  test("post: hide/unhide flip deleted_at under the version CAS; re-hide is idempotent; purge takes the revisions", async () => {
    const kernel = make();
    await seedPost(kernel, "p-1");
    const post = createPostTrashAdapter(kernel);

    assert.deepEqual(await post.hide({ workspaceId: WS, entityId: "p-1", at: AT, expectedVersion: 1 }), { ok: true, version: 2 });
    assert.deepEqual(await post.hide({ workspaceId: WS, entityId: "p-1", at: AT, expectedVersion: null }), { ok: true, version: 2 });
    assert.deepEqual(await post.hide({ workspaceId: WS, entityId: "p-1", at: AT, expectedVersion: 7 }), { ok: false, reason: "version-changed" });
    assert.deepEqual(await post.hide({ workspaceId: WS, entityId: "missing", at: AT, expectedVersion: null }), { ok: false, reason: "not-found" });
    const hidden = await kernel.run((db) => db.selectFrom("posts").select(["deleted_at", "updated_at"]).executeTakeFirstOrThrow());
    assert.deepEqual(hidden, { deleted_at: AT, updated_at: AT });

    assert.deepEqual(await post.unhide({ workspaceId: WS, entityId: "p-1", at: AT, expectedVersion: 2 }, { priorMarker: null }), { ok: true, version: 3 });
    assert.equal((await kernel.run((db) => db.selectFrom("posts").select("deleted_at").executeTakeFirstOrThrow())).deleted_at, null);

    assert.equal(await post.purge({ workspaceId: WS, entityId: "p-1", expectedVersion: 2 }), "version-changed", "a restore beats a stale purge");
    assert.equal(await post.purge({ workspaceId: WS, entityId: "p-1", expectedVersion: 3 }), "purged");
    assert.equal(await post.purge({ workspaceId: WS, entityId: "p-1", expectedVersion: 3 }), "already-gone");
    assert.equal(await count(kernel, "posts"), 0);
    assert.equal(await count(kernel, "post_revisions"), 0);
  });

  test("redirect: hide disables, unhide re-activates, purge takes revisions and hits", async () => {
    const kernel = make();
    await seedRedirect(kernel, "r-1");
    const redirect = createRedirectTrashAdapter(kernel);

    assert.deepEqual(await redirect.hide({ workspaceId: WS, entityId: "r-1", at: AT, expectedVersion: 1 }), { ok: true, version: 2 });
    assert.equal((await kernel.run((db) => db.selectFrom("redirects").select("status").executeTakeFirstOrThrow())).status, "disabled");
    assert.deepEqual(await redirect.unhide({ workspaceId: WS, entityId: "r-1", at: AT, expectedVersion: 2 }, { priorMarker: null }), { ok: true, version: 3 });
    assert.equal((await kernel.run((db) => db.selectFrom("redirects").select("status").executeTakeFirstOrThrow())).status, "active");

    assert.equal(await redirect.purge({ workspaceId: WS, entityId: "r-1", expectedVersion: null }), "purged");
    assert.equal(await count(kernel, "redirects"), 0);
    assert.equal(await count(kernel, "redirect_revisions"), 0);
    assert.equal(await count(kernel, "redirect_hits"), 0);
  });

  test("a failure after the row delete (inside the purge's transaction) rolls the delete back", async () => {
    const kernel = make();
    await seedPost(kernel, "p-1");
    await kernel.run((db) => db.updateTable("posts").set({ deleted_at: AT }).execute());

    const failing = {
      ...kernel,
      run: (async (fn) => {
        const result = await kernel.run(fn);
        // The first statement to run once the row is gone is the revisions cascade.
        if ((await count(kernel, "posts")) === 0) throw new Error("cascade failed");
        return result;
      }) as ContentKernel["run"],
    };
    await assert.rejects(() => createPostTrashAdapter(failing).purge({ workspaceId: WS, entityId: "p-1", expectedVersion: 1 }), /cascade failed/);
    assert.equal(await count(kernel, "posts"), 1, "the row delete rolled back with the failed cascade");
    assert.equal(await count(kernel, "post_revisions"), 1);
  });

  test("media: hide/unhide flip status; purge checks the version, then delegates the row delete", async () => {
    const kernel = make();
    await seedMedia(kernel, "m-1");
    const purged: string[] = [];
    const media = createMediaTrashAdapter({
      db: kernel,
      purgeAsset: async ({ entityId }) => {
        purged.push(entityId);
        await kernel.run((db) => db.deleteFrom("media").where("id", "=", entityId).execute());
      },
    });

    assert.deepEqual(await media.hide({ workspaceId: WS, entityId: "m-1", at: AT, expectedVersion: 1 }), { ok: true, version: 2 });
    assert.equal(await media.purge({ workspaceId: WS, entityId: "m-1", expectedVersion: 1 }), "version-changed");
    assert.deepEqual(purged, [], "a stale version never reaches the blob-aware purge");
    assert.equal(await media.purge({ workspaceId: WS, entityId: "m-1", expectedVersion: 2 }), "purged");
    assert.deepEqual(purged, ["m-1"]);
    assert.equal(await media.purge({ workspaceId: WS, entityId: "m-1", expectedVersion: 2 }), "already-gone");
  });

  test("media: unhide restores persisted active status and advances the version", async () => {
    const kernel = make();
    await seedMedia(kernel, "m-restore");
    const media = createMediaTrashAdapter({ db: kernel, purgeAsset: async () => assert.fail("restore must not purge") });
    assert.deepEqual(await media.hide({ workspaceId: WS, entityId: "m-restore", at: AT, expectedVersion: 1 }), { ok: true, version: 2 });
    assert.deepEqual(await kernel.run((db) => db.selectFrom("media").select(["status", "version"]).executeTakeFirstOrThrow()), { status: "trashed", version: 2 });
    assert.deepEqual(await media.unhide({ workspaceId: WS, entityId: "m-restore", at: AT, expectedVersion: 2 }), { ok: true, version: 3 });
    assert.deepEqual(await kernel.run((db) => db.selectFrom("media").select(["status", "version"]).executeTakeFirstOrThrow()), { status: "active", version: 3 });
  });
});

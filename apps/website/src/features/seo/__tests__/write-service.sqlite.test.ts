import assert from "node:assert/strict";
import test from "node:test";

import { SqlitePostRepo } from "../../post/index.js";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SeoEntryNotFoundError } from "../errors.js";
import { setEntrySeoOverrides } from "../write-service.js";

/**
 * @file T015 — failing-first integration certification of
 * `setEntrySeoOverrides` against the REAL SQLite `PostRepoPort` adapter
 * (Contract Test requirement, tasks.md Constraints): PUT-then-GET round trip
 * persists into `posts.seo_ext_json`; entry-not-found -> `SeoEntryNotFoundError`.
 */

const alwaysAllow = async () => ({ allowed: true, reason: "matched" });
const clock = { nowIso: () => "2026-09-18T00:00:00.000Z" };

function openTestDb() {
  // ADR-042 item 3: openContentDb no longer auto-seeds demo content (that was an infra->server
  // layer violation) - each test builds its own fixture row via the repo instead.
  return openContentDb(":memory:");
}

test("setEntrySeoOverrides: PUT-then-GET round trip persists into posts.seo_ext_json via the real SQLite adapter", async () => {
  const db = openTestDb();
  const repo = new SqlitePostRepo(db);
  await repo.save({
    id: "post-1",
    workspaceId: "workspace-local",
    title: "Fixture Post",
    slug: "fixture-post",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  });
  const entry = await repo.findById({ workspaceId: "workspace-local", id: "post-1" });
  assert.ok(entry, "fixture post was inserted");

  const result = await setEntrySeoOverrides({
    deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: () => {}, clock },
    input: {
      workspaceId: "workspace-local",
      entryId: entry.id,
      patch: { title: "SQLite Round Trip Title", description: "A description" },
      callerPrincipalId: "principal-1",
    },
  });

  assert.equal(result.overrides.title, "SQLite Round Trip Title");

  const reread = await repo.findById({ workspaceId: "workspace-local", id: entry.id });
  assert.ok(reread?.seoExtJson);
  const parsed = JSON.parse(reread!.seoExtJson!);
  assert.equal(parsed.title, "SQLite Round Trip Title");
  assert.equal(parsed.description, "A description");
});

test("setEntrySeoOverrides: entry-not-found against the real SQLite adapter rejects SeoEntryNotFoundError", async () => {
  const db = openTestDb();
  const repo = new SqlitePostRepo(db);

  await assert.rejects(
    () =>
      setEntrySeoOverrides({
        deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: () => {}, clock },
        input: {
          workspaceId: "workspace-local",
          entryId: "does-not-exist",
          patch: { title: "x" },
          callerPrincipalId: "principal-1",
        },
      }),
    SeoEntryNotFoundError
  );
});

test("setEntrySeoOverrides: SQLite retries a stale read and preserves the competing content and SEO save", async () => {
  const repo = new SqlitePostRepo(openTestDb());
  await repo.save({ id: "post-race", workspaceId: "workspace-local", title: "Original", slug: "race",
    bodyJson: { type: "doc", content: [] }, status: "published", kind: "post", updatedAt: "2026-01-01T00:00:00.000Z", version: 1 });
  const read = repo.findById.bind(repo);
  let raced = false;
  repo.findById = async (input) => {
    const stale = await read(input);
    if (!raced && stale) {
      raced = true;
      await repo.save({ ...stale, title: "Concurrent content title", bodyJson: { type: "doc", content: [
        { type: "paragraph", content: [{ type: "text", text: "Concurrent body" }] },
      ] },
        seoExtJson: JSON.stringify({ description: "Concurrent SEO description" }), version: 2 });
    }
    return stale;
  };
  await setEntrySeoOverrides({ deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: () => {}, clock },
    input: { workspaceId: "workspace-local", entryId: "post-race", patch: { title: "SEO title" }, callerPrincipalId: "seo-editor" } });
  const landed = await read({ workspaceId: "workspace-local", id: "post-race" });
  assert.equal(landed?.title, "Concurrent content title");
  assert.deepEqual(landed?.bodyJson, { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Concurrent body" }] },
  ] });
  assert.equal(landed?.version, 3);
  assert.deepEqual(JSON.parse(landed!.seoExtJson!), { description: "Concurrent SEO description", title: "SEO title" });
  const revisions = await repo.listRevisions({ workspaceId: "workspace-local", postId: "post-race" });
  assert.deepEqual(revisions.map((r) => r.seq), [3]);
  assert.equal(revisions[0]?.stateJson.title, "Concurrent content title");
});

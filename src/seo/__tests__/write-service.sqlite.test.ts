import assert from "node:assert/strict";
import test from "node:test";

import { SqlitePostRepo } from "../../features/post";
import { openContentDb } from "../../infra/sqlite/content-db";
import { SeoEntryNotFoundError } from "../errors";
import { setEntrySeoOverrides } from "../write-service";

/**
 * @file T015 — failing-first integration certification of
 * `setEntrySeoOverrides` against the REAL SQLite `PostRepoPort` adapter
 * (Contract Test requirement, tasks.md Constraints): PUT-then-GET round trip
 * persists into `posts.seo_ext_json`; entry-not-found -> `SeoEntryNotFoundError`.
 */

const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function openTestDb() {
  // openContentDb(":memory:") seeds the demo workspace + posts (infra/sqlite/content-db.ts).
  return openContentDb(":memory:");
}

test("setEntrySeoOverrides: PUT-then-GET round trip persists into posts.seo_ext_json via the real SQLite adapter", async () => {
  const db = openTestDb();
  const repo = new SqlitePostRepo(db);
  const seeded = await repo.list({ workspaceId: "workspace-local" });
  const entry = seeded[0];
  assert.ok(entry, "content-db.ts must seed at least one post for workspace-1");

  const result = await setEntrySeoOverrides({
    deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: () => {} },
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
        deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: () => {} },
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

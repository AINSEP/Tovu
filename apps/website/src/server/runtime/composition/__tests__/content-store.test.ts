import assert from "node:assert/strict";
import test from "node:test";

import { SqlitePostRepo } from "#src/features/post/repo.sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { contentStoreIsPglite, pgliteDataDir, selectPostRepo } from "../content-store.js";

/**
 * @file The `TOVU_CONTENT_STORE` switch: off means the SQLite repo exactly as before, a typo is a
 * loud error rather than a silent SQLite fallback, and the daemon (`client`) never opens the dir.
 */

test("unset or 'sqlite' keeps the SQLite post repo", () => {
  const db = openContentDb(":memory:");
  for (const env of [{}, { TOVU_CONTENT_STORE: "" }, { TOVU_CONTENT_STORE: "sqlite" }]) {
    assert.ok(selectPostRepo({ db, contentDbPath: "/x/content.db", env, role: "owner" }) instanceof SqlitePostRepo);
  }
});

test("an unknown store name throws instead of falling back", () => {
  assert.throws(() => contentStoreIsPglite({ TOVU_CONTENT_STORE: "pgltie" }), /TOVU_CONTENT_STORE='pgltie' is not a store/);
});

test("the data dir defaults beside content.db and TOVU_PGLITE_DIR overrides it", () => {
  assert.equal(pgliteDataDir({}, "/sites/a/content.db"), "/sites/a/pglite/content");
  assert.equal(pgliteDataDir({ TOVU_PGLITE_DIR: "/elsewhere" }, "/sites/a/content.db"), "/elsewhere");
});

test("the daemon (client) gets a repo that refuses every call and opens nothing", async () => {
  const repo = selectPostRepo({
    db: openContentDb(":memory:"),
    contentDbPath: "/nonexistent/content.db",
    env: { TOVU_CONTENT_STORE: "pglite" },
    role: "client",
  });
  await assert.rejects(repo.list({ workspaceId: "ws" }), /owned by the site's API process/);
  assert.equal(await Promise.resolve(repo), repo, "awaiting the repo itself must not hang");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";

import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import { postSearch } from "../0001_post_search.js";

// F1.5/F2.6: configuration presence alone misses using English's stop list or simple's no-stemming.
test("search migration stems English words, retains stop words, and builds a GIN projection with cascading ownership", async () => {
  const kernel = openPgliteKernel<unknown>();
  try {
    await kernel.execute(sql`CREATE TABLE posts (id text PRIMARY KEY)`);
    const step = postSearch("independent-checksum");
    assert.equal(step.id, "0001_post_search");
    assert.equal(step.checksum, "independent-checksum");
    await step.up(kernel);
    assert.deepEqual(await kernel.query(sql`SELECT to_tsvector('tovu_search', 'Cats running the')::text AS tokens`),
      [{ tokens: "'cat':1 'run':2 'the':3" }]);
    assert.deepEqual(await kernel.query(sql`SELECT am.amname AS method, pg_get_indexdef(i.indexrelid, 1, true) AS column
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_am am ON am.oid = c.relam
      WHERE c.relname = 'post_search_document_search_idx'`), [{ method: "gin", column: "search" }]);
    await kernel.execute(sql`INSERT INTO posts VALUES ('kept'), ('deleted')`);
    for (const id of ["kept", "deleted"]) {
      await kernel.execute(sql`INSERT INTO post_search_document (post_id, title, slug, body_text, search)
        VALUES (${id}, 'Cats running the', ${id}, 'Cats running the', to_tsvector('tovu_search', 'Cats running the'))`);
    }
    assert.deepEqual(await kernel.query(sql`SELECT post_id FROM post_search_document
      WHERE search @@ plainto_tsquery('tovu_search', 'cat runs the') ORDER BY post_id`),
      [{ post_id: "deleted" }, { post_id: "kept" }]);
    await assert.rejects(kernel.execute(sql`INSERT INTO post_search_document (post_id, title, slug, body_text, search)
      VALUES ('orphan', 'Title', 'slug', 'body', to_tsvector('tovu_search', 'body'))`), { code: "23503" });
    await kernel.execute(sql`DELETE FROM posts WHERE id = 'deleted'`);
    assert.deepEqual(await kernel.query(sql`SELECT post_id, title, slug, body_text FROM post_search_document ORDER BY post_id`),
      [{ post_id: "kept", title: "Cats running the", slug: "kept", body_text: "Cats running the" }]);
  } finally {
    await kernel.close();
  }
});

// F6.2: the SQLite guard must run before any Postgres-only DDL reaches the engine.
test("search step leaves SQLite schema and existing values unchanged", async () => {
  const kernel = openMemorySqliteKernel<unknown>();
  try {
    await kernel.execute(sql`CREATE TABLE marker (payload text NOT NULL)`);
    await kernel.execute(sql`INSERT INTO marker VALUES ('keep SQLite search')`);
    await postSearch("sqlite-checksum").up(kernel);
    assert.deepEqual(await kernel.query(sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`), [{ name: "marker" }]);
    assert.deepEqual(await kernel.query(sql`SELECT * FROM marker`), [{ payload: "keep SQLite search" }]);
  } finally {
    await kernel.close();
  }
});

// F6.2: swallowing execute failures would report a successful but incomplete search migration.
test("search migration propagates missing-posts DDL failure and rolls back in its caller's transaction", async () => {
  const kernel = openPgliteKernel<unknown>();
  try {
    await assert.rejects(kernel.transaction(() => postSearch("failed-checksum").up(kernel)), { code: "42P01" });
    assert.deepEqual(await kernel.query(sql`SELECT cfgname FROM pg_ts_config WHERE cfgname = 'tovu_search'`), []);
    await kernel.execute(sql`CREATE TABLE posts (id text PRIMARY KEY)`);
    await kernel.transaction(() => postSearch("retry-checksum").up(kernel));
    assert.deepEqual(await kernel.query(sql`SELECT to_tsvector('tovu_search', 'running the')::text AS tokens`),
      [{ tokens: "'run':1 'the':2" }]);
  } finally {
    await kernel.close();
  }
});

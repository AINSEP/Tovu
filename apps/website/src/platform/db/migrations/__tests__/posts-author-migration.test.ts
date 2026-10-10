import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { listColumns, toBool } from "#src/platform/db/kernel/dialect";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

const ID = "0009_posts_author";

// The coordinator owns the additive migration. This proves its behavior against a pre-feature row.
for (const adapter of eachDialect({ tables: ["posts"], make: kernel => kernel })) {
  test(`[${adapter.name}] post-author migration keeps legacy content intact, NULL author and false toggle, and applies once`, async () => {
    const kernel = adapter.make();
    try {
      const step = CONTENT_MIGRATIONS.find(entry => entry.id === ID);
      assert.ok(step, "the post-author migration must be registered in the active kernel history (ADR-066)");
      assert.equal(step.checksum, MIGRATION_CHECKSUMS[ID]);
      for (const column of ["author", "show_author"] as const) {
        await kernel.execute(sql`ALTER TABLE posts DROP COLUMN ${sql.raw(column)}`);
      }
      await kernel.execute(sql`INSERT INTO posts (id, workspace_id, title, slug, body_json, status, updated_at, version)
        VALUES ('author-legacy', 'ws', 'Legacy title', 'author-legacy', '{"type":"doc"}', 'published', '2026-01-01', 7)`);
      const options = { ledgerTable: "author_contract_migrations" };
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, [step], options)).applied, [step.id]);
      const rows = await kernel.query<{ title: string; body_json: string; status: string; version: number; author: string | null; show_author: boolean | number }>(
        sql`SELECT title, body_json, status, version, author, show_author FROM posts WHERE id = 'author-legacy'`);
      assert.equal(rows.length, 1);
      assert.deepEqual({ ...rows[0], show_author: toBool(rows[0]!.show_author) }, {
        title: "Legacy title", body_json: '{"type":"doc"}', status: "published", version: 7, author: null, show_author: false,
      });
      const columns = await listColumns(kernel, "posts");
      assert.equal(columns.find(column => column.name === "author")?.notNull, false);
      assert.equal(columns.find(column => column.name === "author")?.type.toLowerCase(), "text");
      assert.equal(columns.find(column => column.name === "show_author")?.notNull, true);
      assert.equal(columns.find(column => column.name === "show_author")?.type.toLowerCase(),
        adapter.dialect === "postgres" ? "boolean" : "integer");
      await kernel.execute(sql`INSERT INTO posts (id, workspace_id, title, slug, body_json, status, updated_at, version)
        VALUES ('author-new', 'ws', 'New title', 'author-new', '{"type":"doc"}', 'draft', '2026-01-02', 1)`);
      const defaults = await kernel.query<{ author: string | null; show_author: boolean | number }>(
        sql`SELECT author, show_author FROM posts WHERE id = 'author-new'`);
      assert.equal(defaults[0]?.author, null);
      assert.equal(toBool(defaults[0]!.show_author), false);
      await assert.rejects(kernel.execute(sql`UPDATE posts SET show_author = NULL WHERE id = 'author-new'`),
        /NOT NULL|not-null/);
      await kernel.execute(sql`UPDATE posts SET author = 'Ada & Co.', show_author = true WHERE id = 'author-legacy'`);
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, [step], options)).applied, []);
      const saved = await kernel.query<{ author: string; show_author: boolean | number }>(
        sql`SELECT author, show_author FROM posts WHERE id = 'author-legacy'`);
      assert.equal(saved[0]?.author, "Ada & Co.");
      assert.equal(toBool(saved[0]!.show_author), true);
      assert.deepEqual(await kernel.query<{ id: string }>(sql`SELECT id FROM author_contract_migrations`), [{ id: ID }]);
    } finally {
      await kernel.execute(sql`DELETE FROM posts WHERE id IN ('author-legacy', 'author-new')`);
      if (adapter.name === "sqlite") await kernel.close();
    }
  });
}

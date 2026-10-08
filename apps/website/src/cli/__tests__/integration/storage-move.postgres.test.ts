import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { sql } from "kysely";

import { readCatalog } from "#src/features/database-transfer/pg-store-copy";
import { openPgliteKernel } from "#src/platform/db/kernel/drivers/pglite";
import type { StorageKernel } from "#src/platform/db/kernel/index";
import { openSiteStore } from "#src/server/runtime/composition/open-site-store";
import { resolveSiteStorage } from "#src/platform/site-dir/site-storage";
import { dropDatabase, freshPostgresDatabase } from "#src/platform/db/__tests__/postgres-database";
import { ValidationError } from "#src/platform/site-dir/errors";
import { initSite } from "#src/platform/site-dir/init-site";
import { SITE_META_FILENAME } from "#src/platform/site-dir/site-storage";
import { STORAGE_SECRET_FILENAME } from "#src/server/runtime/composition/storage-secret";
import { createProgram } from "../../program.js";
import { runStorageMoveCommand } from "../../commands/storage-move.js";

/**
 * @file `tovu storage move` (R1g): the command's own refusals, its wiring in the program, and a real
 * move with `--storage-env` (the site then reads that variable; nothing is sealed). The move itself
 * is covered in `server/runtime/composition/__tests__/move-site-storage.postgres.test.ts`.
 */

async function counts(kernel: StorageKernel<unknown>): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of await readCatalog(kernel)) {
    const [row] = await kernel.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.table(`${table.schema}.${table.name}`)}`);
    result[`${table.schema}.${table.name}`] = row.n;
  }
  return result;
}

const DB = "tovu_storage_move_cli_test";
const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-move-cli-"));
let url: string;

before(() => {
  url = freshPostgresDatabase(DB);
});
after(() => {
  dropDatabase({ database: DB });
  fs.rmSync(parent, { recursive: true, force: true });
});

test("refuses a target other than postgres, and a --storage-env that is not set", async () => {
  await assert.rejects(runStorageMoveCommand({ dir: parent, to: "sqlite" }), (err: unknown) => {
    assert.ok(err instanceof ValidationError);
    assert.equal(err.message, "storage move: --to must be postgres (the only target a PGlite site moves to)");
    return true;
  });
  await assert.rejects(runStorageMoveCommand({ dir: parent, to: "postgres", storageEnv: "TOVU_MOVE_UNSET", env: {} }), (err: unknown) => {
    assert.ok(err instanceof ValidationError);
    assert.equal(err.message, "storage move: the environment variable TOVU_MOVE_UNSET is not set");
    return true;
  });
});

test("the program routes `storage move` to the command", async () => {
  await assert.rejects(createProgram().parseAsync(["node", "tovu", "storage", "move", parent, "--to", "mysql"]), (err: unknown) => {
    assert.ok(err instanceof ValidationError);
    assert.match(err.message, /^storage move: --to must be postgres/);
    return true;
  });
});

test("--storage-env moves the site and leaves the connection string in that variable", async () => {
  const site = await initSite({ dir: path.join(parent, "site"), name: "Cli Move", storage: { kind: "pglite" } });
  const source = openPgliteKernel<unknown>({ dataDir: path.join(site.dir, "pglite") });
  let sourceCounts: Record<string, number>;
  let sourcePosts: Array<{ id: string; title: string; slug: string; body_json: string }>;
  try {
    // A persisted edit distinguishes a real copy from a target silently re-seeded on open.
    await source.execute(sql`UPDATE posts SET title = 'CLI move persisted welcome' WHERE slug = 'welcome'`);
    sourceCounts = await counts(source);
    sourcePosts = await source.query(sql`SELECT id, title, slug, body_json FROM posts ORDER BY id`);
    assert.ok(sourcePosts.some((post) => post.slug === "welcome" && post.title === "CLI move persisted welcome"));
    assert.ok(sourcePosts.some((post) => post.slug === "about" && post.title === "What Is Tovu?"));
  } finally {
    await source.close();
  }
  const lines: string[] = [];
  const result = await runStorageMoveCommand({
    dir: site.dir,
    to: "postgres",
    storageEnv: "TOVU_MOVE_URL",
    env: { TOVU_MOVE_URL: url },
    write: (line) => lines.push(line),
  });
  const meta = JSON.parse(fs.readFileSync(path.join(site.dir, SITE_META_FILENAME), "utf8"));
  assert.deepEqual(meta.storage, { kind: "postgres", secretRef: { env: "TOVU_MOVE_URL" } });
  assert.equal(fs.existsSync(path.join(site.dir, STORAGE_SECRET_FILENAME)), false, "nothing sealed with --storage-env");
  const rows = result.tables.reduce((sum, t) => sum + t.rows, 0);
  assert.ok(rows > 0);
  assert.deepEqual(lines, [
    `moved site at ${site.dir} to postgres: ${result.tables.length} tables, ${rows} rows`,
    `the PGlite data dir is kept at ${path.join(site.dir, "pglite")}; remove it yourself once the site checks out`,
  ]);
  const storage = resolveSiteStorage(site.dir);
  const target = await openSiteStore({
    storage, dbPath: path.join(site.dir, "content.db"), chatDbPath: path.join(site.dir, "chat.db"), role: "owner",
  }, { env: { TOVU_MOVE_URL: url } });
  try {
    assert.equal(target.storage.kind, "postgres", "reopen through the moved site's metadata");
    assert.deepEqual(await counts(target.content as unknown as StorageKernel<unknown>), sourceCounts, "every destination table must retain its source row count");
    assert.deepEqual(await target.content.run((db) => db.selectFrom("posts").select(["id", "title", "slug", "body_json"]).orderBy("id").execute()), sourcePosts);
    assert.deepEqual(await target.content.run((db) => db.selectFrom("workspaces").select(["id", "slug"]).execute()), [
      { id: "workspace-local", slug: "local-tovu" },
    ]);
  } finally {
    await target.close();
  }

});

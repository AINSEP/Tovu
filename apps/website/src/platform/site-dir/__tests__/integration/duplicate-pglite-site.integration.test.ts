import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { sql } from "kysely";

import { OWNER_LOCK_FILE } from "../../../db/kernel/drivers/pglite-owner.js";
import { duplicateSite } from "../../duplicate-site.js";
import { ValidationError } from "../../errors.js";
import { initSite } from "../../init-site.js";
import { PGLITE_DATA_DIR_NAME } from "../../layout.js";
import { openSiteStore, PG_SOCKET_ENV, type SiteStore } from "#src/server/runtime/composition/open-site-store";

/**
 * @file R1g: duplicating a site stored on PGlite. The copy is its own database (a dump of the
 * source's data dir): both sites boot side by side, writes stay apart, AI chat stays behind, and a
 * source run by another live process is refused before anything is written.
 */

const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-dup-pglite-"));
after(() => fs.rmSync(parent, { recursive: true, force: true }));

/** Opens a site's store as owner, its socket in a short private dir of its own. */
async function openOwner(siteDir: string): Promise<SiteStore> {
  const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-sock-"));
  return openSiteStore(
    { storage: { kind: "pglite" }, dbPath: path.join(siteDir, "content.db"), chatDbPath: path.join(siteDir, "chat.db"), role: "owner" },
    { env: { [PG_SOCKET_ENV]: path.join(socketDir, ".s.PGSQL.5432") } }
  );
}

async function count(store: SiteStore, table: string): Promise<number> {
  const [row] = await store.content.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.table(table)}`);
  return row.n;
}

async function addChat(store: SiteStore, id: string): Promise<void> {
  await store.content.execute(
    sql`INSERT INTO ai_chat.ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at) VALUES (${id}, 'ws', 'user', 'u1', 1, 1)`
  );
}

async function addPublish(store: SiteStore, project: string): Promise<void> {
  await store.content.execute(
    sql`INSERT INTO publish_history (workspace_id, target, url, reachable, status, project_name, published_at, triggered_by)
        SELECT id, 'static', 'https://example.test', true, 'ok', ${project}, '2026-09-28T00:00:00Z', 'test' FROM workspaces LIMIT 1`
  );
}

test("a PGlite site duplicates while it runs in this process and while stopped; both copies boot on their own", async () => {
  const source = await initSite({ dir: path.join(parent, "source"), name: "Pglite Source", storage: { kind: "pglite" } }, { withSampleContent: true });
  const running = await openOwner(source.dir);
  let posts: number;
  let expectedPosts: unknown[];
  let expectedHistory: unknown[];
  try {
    posts = await count(running, "posts");
    assert.ok(posts > 0, "the starter template seeds posts");
    await addChat(running, "chat-1");
    await addPublish(running, "before-copy");
    await running.content.execute(sql`UPDATE posts SET title = 'Distinctive copy title', body_json = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Copy this exact body"}]}]}'`);
    expectedPosts = await running.content.query(sql`SELECT * FROM posts ORDER BY id`);
    expectedHistory = await running.content.query(sql`SELECT * FROM publish_history ORDER BY id`);
    // Served by this process: the copy goes through its owner's exclusive window.
    await duplicateSite({ sourceDir: source.dir, targetDir: path.join(parent, "hot-copy") });
  } finally {
    await running.close();
  }
  // Stopped: the copy takes the data dir's owner lock itself, and releases it.
  await duplicateSite({ sourceDir: source.dir, targetDir: path.join(parent, "cold-copy") });
  assert.equal(fs.existsSync(path.join(source.dir, PGLITE_DATA_DIR_NAME, OWNER_LOCK_FILE)), false);

  for (const copyName of ["hot-copy", "cold-copy"]) {
    const copyDir = path.join(parent, copyName);
    const meta = JSON.parse(fs.readFileSync(path.join(copyDir, ".site-meta.json"), "utf8"));
    assert.deepEqual(meta.storage, { kind: "pglite" });
    assert.equal(fs.existsSync(path.join(copyDir, "content.db")), false, "a PGlite duplicate has no content.db");

    const [a, b] = [await openOwner(source.dir), await openOwner(copyDir)];
    try {
      assert.equal(await count(b, "posts"), posts, `${copyName}: posts copied`);
      assert.equal(await count(b, "publish_history"), 1, `${copyName}: other content copied`);
      assert.deepEqual(await b.content.query(sql`SELECT * FROM posts ORDER BY id`), expectedPosts, `${copyName}: complete post records survive`);
      assert.deepEqual(await b.content.query(sql`SELECT * FROM publish_history ORDER BY id`), expectedHistory, `${copyName}: complete publish history survives`);
      assert.equal(await count(b, "ai_chat.ai_chats"), 0, `${copyName}: AI chat stays behind`);
      assert.ok((await count(b, "ai_chat.tovu_chat_migrations")) > 0, `${copyName}: the chat ledger is kept (at head)`);
      assert.equal(await count(a, "ai_chat.ai_chats"), 1, "the source keeps its chat");
      // Identity counters came along: a new row gets a fresh id, and it stays in the copy.
      await addPublish(b, `after-${copyName}`);
      assert.equal(await count(b, "publish_history"), 2);
      assert.equal(await count(a, "publish_history"), 1, "a write to the copy never reaches the source");
    } finally {
      await b.close();
      await a.close();
    }
  }
});

test("a PGlite source run by another live process is refused before anything is written", async () => {
  const source = await initSite({ dir: path.join(parent, "busy"), name: "Busy", storage: { kind: "pglite" } });
  const lock = path.join(source.dir, PGLITE_DATA_DIR_NAME, OWNER_LOCK_FILE);
  fs.writeFileSync(lock, `${process.ppid}\n`); // a live pid that is not this process
  const target = path.join(parent, "busy-copy");
  try {
    await assert.rejects(duplicateSite({ sourceDir: source.dir, targetDir: target }), (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.equal(
        err.message,
        `the site being duplicated is running (process ${process.ppid}); stop it, or duplicate it from inside that site, then retry`
      );
      return true;
    });
    assert.equal(fs.existsSync(target), false, "nothing is left behind");
  } finally {
    fs.rmSync(lock, { force: true });
  }
});

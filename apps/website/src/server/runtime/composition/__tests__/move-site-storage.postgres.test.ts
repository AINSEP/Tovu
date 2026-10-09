import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { sql } from "kysely";

import { copyPgStore, nonEmptyTables, readCatalog, StoreCopyError } from "#src/features/database-transfer/pg-store-copy";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { dropDatabase, freshPostgresDatabase, psql } from "#src/platform/db/__tests__/postgres-database";
import { openPgliteKernel } from "#src/platform/db/kernel/drivers/pglite";
import { openPostgresKernel, type StorageKernel } from "#src/platform/db/kernel/index";
import { migrateChatDatabase, migrateContentDatabase } from "#src/platform/db/migrations/index";
import { ValidationError } from "#src/platform/site-dir/errors";
import { initSite } from "#src/platform/site-dir/init-site";
import { SITE_META_FILENAME } from "#src/platform/site-dir/site-storage";
import { moveSiteStorage } from "../move-site-storage.js";
import { openSiteStore, PG_SOCKET_ENV, type SiteStore } from "../open-site-store.js";
import { readSealedConnectionString, STORAGE_SECRET_FILENAME } from "../storage-secret.js";

/**
 * @file R1g: `moveSiteStorage` moves a PGlite site onto a real Postgres server (temp databases,
 * dropped after). Refusals (running site, non-empty target) and a failure injected after the copy
 * leave the site on PGlite untouched; the move itself copies every table (plugin tables included),
 * seals the connection string, switches the meta last, keeps the PGlite dir, and the site then boots
 * on Postgres with the same rows and working identity counters.
 */

const TARGET = "tovu_move_site_test";
const BUSY = "tovu_move_site_busy";
const LATE = "tovu_move_site_late_write";
const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-move-"));
let siteDir: string;
let targetUrl: string;
let busyUrl: string;
let lateUrl: string;
const keyring = new InMemoryKeyring();
const sealing = { keyring, sealer: new AesGcmSecretSealer(keyring) };

async function openOwner(storageSite: string, optional: { sealer?: AesGcmSecretSealer } = {}): Promise<SiteStore> {
  const meta = JSON.parse(fs.readFileSync(path.join(storageSite, SITE_META_FILENAME), "utf8"));
  const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-sock-"));
  return openSiteStore(
    { storage: meta.storage, dbPath: path.join(storageSite, "content.db"), chatDbPath: path.join(storageSite, "chat.db"), role: "owner" },
    { env: { [PG_SOCKET_ENV]: path.join(socketDir, ".s.PGSQL.5432") }, sealer: optional.sealer }
  );
}

async function counts(kernel: StorageKernel<unknown>): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of await readCatalog(kernel)) {
    const [row] = await kernel.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.table(`${table.schema}.${table.name}`)}`);
    out[`${table.schema}.${table.name}`] = row.n;
  }
  return out;
}

const metaText = () => fs.readFileSync(path.join(siteDir, SITE_META_FILENAME), "utf8");

before(async () => {
  targetUrl = freshPostgresDatabase(TARGET);
  busyUrl = freshPostgresDatabase(BUSY);
  lateUrl = freshPostgresDatabase(LATE);
  const created = psql({ database: BUSY, sql: "CREATE TABLE someone_elses (id text); INSERT INTO someone_elses VALUES ('x');" });
  assert.ok(created.ok, created.stderr);
  siteDir = (await initSite({ dir: path.join(parent, "site"), name: "Move Me", storage: { kind: "pglite" } }, { withSampleContent: true })).dir;
  const store = await openOwner(siteDir);
  try {
    const k = store.content;
    await k.execute(sql`INSERT INTO ai_chat.ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at) VALUES ('chat-1', 'ws', 'user', 'u1', 1, 1)`);
    await k.execute(sql`INSERT INTO ai_chat.ai_chat_messages (id, conversation_id, role, content, position, created_at)
                        VALUES ('m-1', 'chat-1', 'user', 'hello', 0, 1)`);
    await k.execute(
      sql`INSERT INTO publish_history (workspace_id, target, url, reachable, status, project_name, published_at, triggered_by)
          SELECT id, 'static', 'https://example.test', true, 'ok', 'p', '2026-09-28T00:00:00Z', 'test' FROM workspaces LIMIT 1`
    );
    // A plugin-style table no migration creates: identity, FK, jsonb, array, own index; > one batch of rows.
    await k.execute(sql`CREATE TABLE p_demo__items (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      post_id text REFERENCES posts (id) ON DELETE CASCADE,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      tags text[],
      note text CHECK (note <> '')
    )`);
    await k.execute(sql`CREATE INDEX p_demo__items_post_idx ON p_demo__items (post_id)`);
    await k.execute(sql`INSERT INTO p_demo__items (post_id, data, tags, note)
      SELECT (SELECT id FROM posts ORDER BY id LIMIT 1), jsonb_build_object('n', g, 'list', jsonb_build_array(g, 'x')), ARRAY['a', 'b,c'], 'row ' || g
      FROM generate_series(1, 1200) g`);
  } finally {
    await store.close();
  }
});

after(() => {
  dropDatabase({ database: TARGET });
  dropDatabase({ database: BUSY });
  dropDatabase({ database: LATE });
  fs.rmSync(parent, { recursive: true, force: true });
});

test("a running site is refused; nothing changes", async () => {
  const before = metaText();
  const store = await openOwner(siteDir);
  try {
    await assert.rejects(moveSiteStorage({ siteDir, connectionString: targetUrl, secretRef: "site" }, { sealer: sealing }), (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.equal(err.message, `storage move: the site is running (process ${process.pid}); stop it, then move it`);
      return true;
    });
  } finally {
    await store.close();
  }
  assert.equal(metaText(), before);
});

test("a target that already holds data is refused; nothing changes", async () => {
  const before = metaText();
  await assert.rejects(moveSiteStorage({ siteDir, connectionString: busyUrl, secretRef: "site" }, { sealer: sealing }), (err: unknown) => {
    assert.ok(err instanceof ValidationError);
    assert.equal(err.message, "storage move: the target database already holds data (public.someone_elses); move into an empty database");
    return true;
  });
  assert.equal(metaText(), before);
  assert.equal(fs.existsSync(path.join(siteDir, STORAGE_SECRET_FILENAME)), false);
});

test("a row written to the target after the emptiness check refuses the copy; nothing is truncated", async () => {
  const source = openPgliteKernel<unknown>({ dataDir: path.join(siteDir, "pglite") });
  const target = openPostgresKernel<unknown>({ connectionString: lateUrl, max: 2 });
  try {
    for (const kernel of [source, target]) {
      await migrateContentDatabase(kernel);
      await migrateChatDatabase(kernel);
    }
    assert.deepEqual(await nonEmptyTables(target), [], "the pre-check passes");
    // Another process writes between the move's pre-check and its copy transaction.
    await target.execute(sql`INSERT INTO ai_chat.ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at) VALUES ('late', 'ws', 'user', 'u9', 1, 1)`);
    await assert.rejects(copyPgStore(source, target), (err: unknown) => {
      assert.ok(err instanceof StoreCopyError);
      assert.equal(err.message, "the target database already holds data (ai_chat.ai_chats); nothing was copied");
      return true;
    });
    const rows = await target.query<{ id: string }>(sql`SELECT id FROM ai_chat.ai_chats`);
    assert.deepEqual(rows.map((row) => row.id), ["late"], "the late row survives");
  } finally {
    await target.close();
    await source.close();
  }
});

test("a failure after the copy rolls the target back and leaves the site on PGlite", async () => {
  const before = metaText();
  await assert.rejects(
    moveSiteStorage(
      { siteDir, connectionString: targetUrl, secretRef: "site" },
      {
        sealer: sealing,
        onCopied: async () => {
          throw new Error("injected after copy");
        },
      }
    ),
    /^Error: injected after copy$/
  );
  assert.equal(metaText(), before);
  assert.equal(fs.existsSync(path.join(siteDir, STORAGE_SECRET_FILENAME)), false);
  const target = openPostgresKernel<unknown>({ connectionString: targetUrl });
  try {
    assert.deepEqual(await nonEmptyTables(target), [], "the target is migrated but empty, so a retry is allowed");
  } finally {
    await target.close();
  }
});

test("the move copies every table, seals the secret, switches the meta last, and the site boots on Postgres", async () => {
  const pgliteDir = path.join(siteDir, "pglite");
  const source = openPgliteKernel<unknown>({ dataDir: pgliteDir });
  const sourceCounts = await counts(source);
  // PGlite hands jsonb back as a string while node-postgres parses it, so both sides read the row as text.
  const sourceMessages = (await source.query<{ message: string }>(sql`SELECT to_jsonb(m)::text AS message FROM ai_chat.ai_chat_messages AS m ORDER BY id`))
    .map((row) => JSON.parse(row.message) as Record<string, unknown>);
  assert.equal(sourceMessages.length, 1);
  assert.equal(sourceMessages[0].content, "hello", "the copy fixture must contain actual message text");
  await source.close();

  const metaBefore = JSON.parse(metaText());
  const result = await moveSiteStorage({ siteDir, connectionString: targetUrl, secretRef: "site" }, { sealer: sealing });

  assert.deepEqual(result.storage, { kind: "postgres", secretRef: "site" });
  assert.equal(result.keptPgliteDir, pgliteDir);
  assert.ok(fs.existsSync(path.join(pgliteDir, "PG_VERSION")), "the PGlite data dir is kept");
  const metaAfter = JSON.parse(metaText());
  assert.deepEqual(metaAfter, { ...metaBefore, storage: { kind: "postgres", secretRef: "site" } });
  const secretPath = path.join(siteDir, STORAGE_SECRET_FILENAME);
  assert.equal(fs.statSync(secretPath).mode & 0o777, 0o600);
  assert.ok(!fs.readFileSync(secretPath, "utf8").includes(TARGET), "the secret file holds no plaintext");
  assert.equal(await readSealedConnectionString({ siteDir }, { sealer: sealing.sealer }), targetUrl);

  const copied = Object.fromEntries(result.tables.map((t) => [t.table, t.rows]));
  assert.equal(copied["public.p_demo__items"], 1200);
  assert.equal(result.tables.find((t) => t.table === "public.p_demo__items")?.created, true);
  assert.equal(copied["ai_chat.ai_chats"], 1);
  assert.equal(copied["ai_chat.ai_chat_messages"], 1);

  const store = await openOwner(siteDir, { sealer: sealing.sealer });
  try {
    const targetCounts = await counts(store.content as unknown as StorageKernel<unknown>);
    assert.deepEqual(targetCounts, sourceCounts, "every table has the same rows on Postgres");
    const targetMessages = (await store.content.query<{ message: string }>(sql`SELECT to_jsonb(m)::text AS message FROM ai_chat.ai_chat_messages AS m ORDER BY id`))
      .map((row) => JSON.parse(row.message) as Record<string, unknown>);
    assert.deepEqual(targetMessages, sourceMessages, "all chat-message columns, including content, must survive the move");
    const [chat] = await store.content.query<{ id: string }>(sql`SELECT id FROM ai_chat.ai_chats`);
    assert.equal(chat.id, "chat-1");
    const [item] = await store.content.query<{ data: string; kind: string; tags: string[] }>(
      sql`SELECT data, jsonb_typeof(data) AS kind, tags FROM p_demo__items WHERE id = 1200`
    );
    // jsonb comes back as text on every driver (@jini-ai/db/core); it is still an object on the server.
    // pg-types.ts (platform/db/kernel/drivers/pg-types.ts) was deleted 2026-10-03: unused; see development/DELETED-CODE.md.
    assert.deepEqual(item, { data: '{"n":1200,"list":[1200,"x"]}', kind: "object", tags: ["a", "b,c"] });
    // Identity counters moved past the copied ids: new rows insert without a duplicate key.
    await store.content.execute(sql`INSERT INTO p_demo__items (note) VALUES ('after the move')`);
    await store.content.execute(
      sql`INSERT INTO publish_history (workspace_id, target, url, reachable, status, project_name, published_at, triggered_by)
          SELECT id, 'static', 'https://example.test', true, 'ok', 'after', '2026-09-28T00:00:00Z', 'test' FROM workspaces LIMIT 1`
    );
    const [next] = await store.content.query<{ id: number }>(sql`SELECT max(id)::int AS id FROM p_demo__items`);
    assert.equal(next.id, 1201);
    // The copied foreign key is live on the target.
    await assert.rejects(store.content.execute(sql`INSERT INTO p_demo__items (post_id) VALUES ('no-such-post')`), /foreign key/);
  } finally {
    await store.close();
  }
});

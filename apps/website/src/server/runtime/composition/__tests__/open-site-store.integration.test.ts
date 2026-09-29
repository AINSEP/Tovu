import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import type { SiteStorage } from "#src/platform/site-dir/types";
import { createSiteRouteDeps } from "../deps.js";
import { openSiteStore, StorageNotAvailableError } from "../open-site-store.js";
import { StorageSecretError } from "../storage-secret.js";

/**
 * @file R1d — the composition root's store step: `openSiteStore` and how `createSiteRouteDeps` uses it.
 *
 * Outcome Matrix:
 *   Given sqlite storage                         -> content + chat kernels over content.db / chat.db
 *   Given pglite storage                          -> StorageNotAvailableError, nothing created (R1f part 2)
 *   Given postgres storage with no secret         -> StorageSecretError naming where to look, nothing created
 *   (Postgres opening for real: `create-site-route-deps.postgres.test.ts`.)
 *   Given a site folder whose meta says pglite    -> createSiteRouteDeps rejects before opening content.db
 *   Given an expired guest chat in chat.db         -> the API process's composition deletes it (sweep started)
 *   Given the agent daemon's composition (client)  -> no sweep; the expired chat stays
 */

function mkSiteDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-open-site-store-"));
}

function isStorageNotAvailable(kind: string) {
  return (err: unknown) => {
    assert.ok(err instanceof StorageNotAvailableError, `expected StorageNotAvailableError, got ${String(err)}`);
    assert.match(err.message, new RegExp(`stored on ${kind}, which lands in R1 plan slice R1f part 2`));
    return true;
  };
}

/** One expired and one unexpired guest chat, written straight into a fresh chat.db. */
function seedGuestChats(chatDbPath: string): void {
  const chat = openChatDb(chatDbPath);
  try {
    const now = Date.now();
    const insert = chat.prepare(
      `INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, title, title_source, created_at, updated_at, expires_at)
       VALUES (?, 'workspace-local', 'guest', 'hashed-session', 't', 'fallback', ?, ?, ?)`
    );
    insert.run("expired", now, now, now - 1);
    insert.run("fresh", now, now, now + 3_600_000);
  } finally {
    chat.close();
  }
}

function chatIds(chatDbPath: string): string[] {
  const chat = openChatDb(chatDbPath);
  try {
    return (chat.prepare("SELECT id FROM ai_chats ORDER BY id").all() as { id: string }[]).map((row) => row.id);
  } finally {
    chat.close();
  }
}

async function waitFor(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`timed out waiting for: ${label}`);
}

test("sqlite: opens content.db and chat.db beside it and hands back both kernels", async () => {
  const dir = mkSiteDir();
  try {
    const store = await openSiteStore({ storage: { kind: "sqlite" }, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" });
    assert.equal(store.content.dialect, "sqlite");
    assert.equal(store.chat.dialect, "sqlite");
    assert.ok(store.sqliteDb, "SQLite exposes its Drizzle handle for sqliteOnlyServices");
    assert.ok(fs.existsSync(path.join(dir, "content.db")) && fs.existsSync(path.join(dir, "chat.db")));
    await store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pglite is refused before anything is opened or created", async () => {
  const dir = mkSiteDir();
  try {
    await assert.rejects(
      openSiteStore({ storage: { kind: "pglite" }, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" }),
      isStorageNotAvailable("pglite")
    );
    assert.deepEqual(fs.readdirSync(dir), [], "no file is created for a refused store");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("postgres without its connection string is refused with where to look, before anything is created", async () => {
  const dir = mkSiteDir();
  try {
    const kinds: SiteStorage[] = [{ kind: "postgres", secretRef: "site" }, { kind: "postgres", secretRef: { env: "TOVU_R1F_UNSET_PG_URL" } }];
    const expected = [/\.storage-secret\.json, which does not exist/, /environment variable TOVU_R1F_UNSET_PG_URL, which is not set/];
    for (const [i, storage] of kinds.entries()) {
      await assert.rejects(
        openSiteStore({ storage, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" }, { env: {} }),
        (err: unknown) => err instanceof StorageSecretError && expected[i].test(err.message)
      );
    }
    assert.deepEqual(fs.readdirSync(dir), [], "no file is created for a refused store");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("createSiteRouteDeps reads the site's storage choice: a pglite site is refused before content.db is opened", async () => {
  const dir = mkSiteDir();
  try {
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteKeyId: "k", storage: { kind: "pglite" } }));
    await assert.rejects(createSiteRouteDeps(path.join(dir, "content.db")), isStorageNotAvailable("pglite"));
    assert.equal(fs.existsSync(path.join(dir, "content.db")), false, "no SQLite file is created in a pglite site's folder");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the API process's composition starts the guest-chat expiry sweep on chat.db", async () => {
  const dir = mkSiteDir();
  try {
    const chatDbPath = path.join(dir, "chat.db");
    seedGuestChats(chatDbPath);
    const deps = await createSiteRouteDeps(path.join(dir, "content.db"));
    await waitFor(() => !chatIds(chatDbPath).includes("expired"), "the expired guest chat to be swept");
    assert.deepEqual(chatIds(chatDbPath), ["fresh"], "only the expired chat goes");
    await deps.commentsReady; // the last boot write; the folder is removed after it
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the agent daemon's composition (client) leaves the sweep to the API process", async () => {
  const dir = mkSiteDir();
  try {
    const chatDbPath = path.join(dir, "chat.db");
    seedGuestChats(chatDbPath);
    const deps = await createSiteRouteDeps(path.join(dir, "content.db"), { storeRole: "client" });
    await deps.commentsReady;
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(chatIds(chatDbPath), ["expired", "fresh"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

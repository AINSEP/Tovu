import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeSqliteConnection } from "#src/platform/db/kernel/index";
import { defaultPgliteSocketDir, PGLITE_SOCKET_FILE } from "#src/platform/db/kernel/drivers/pglite-owner";
import { sqliteClientOf, sqliteConnectionOf } from "#src/platform/db/kernel/drivers/sqlite";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import type { ContentDbSeedData } from "#src/platform/db/sqlite/content-db";
import type { SiteStorage } from "#src/platform/site-dir/types";
import { seededPosts, seededPresentation, seededWorkspace } from "../../configuration/seed.js";
import { createSiteRouteDeps } from "../deps.js";
import { openSiteContentDb } from "../open-site-content-db.js";
import { openSiteStore, PG_SOCKET_ENV, PGLITE_DATA_DIR_NAME, type SiteStore, StorageNotAvailableError } from "../open-site-store.js";
import { StorageSecretError } from "../storage-secret.js";

/**
 * @file R1d — the composition root's store step: `openSiteStore` and how `createSiteRouteDeps` uses it.
 *
 * Outcome Matrix:
 *   Given sqlite storage                         -> content + chat kernels over content.db / chat.db
 *   Given pglite, client role, no owner serving   -> StorageNotAvailableError naming the socket, nothing created
 *   Given pglite, owner role, TOVU_PG_SOCKET set  -> the owner ignores it, serves its data dir's own socket,
 *                                                    and leaves the named (another site's) socket alone
 *   Given postgres storage with no secret         -> StorageSecretError naming where to look, nothing created
 *   (Postgres opening for real: `create-site-route-deps.postgres.test.ts`.)
 *   (PGlite opening for real: `create-site-route-deps.pglite.integration.test.ts`.)
 *   Given an expired guest chat in chat.db         -> the API process's composition deletes it (sweep started)
 *   Given a chat that expires after startup        -> a later pass on the sweep's interval deletes it
 *   Given the store closing during a sweep pass    -> close waits for the pass, then closes chat.db
 *   Given the agent daemon's composition (client)  -> no sweep; the expired chat stays
 *   Given chat.db cannot open                      -> rejected; an opened content.db is closed, a supplied one stays open
 *   Given a supplied content.db                    -> close() closes chat.db only
 *   Given a PGlite/Postgres preparation failure    -> rejected; the owner lock / the pool is released
 *                                                     (Postgres: `open-site-store.postgres.test.ts`)
 */

/** The demo seed with its first post twice: the second insert breaks the posts primary key mid-preparation. */
function duplicatePostSeed(): ContentDbSeedData {
  const [post] = seededPosts;
  return { workspace: seededWorkspace, posts: [post, post], presentation: seededPresentation };
}

function mkSiteDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-open-site-store-"));
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

/** Every boot-time write the composition started (its `*Ready` promises), so the store can close after. */
async function bootSettled(deps: object): Promise<void> {
  await Promise.all(Object.entries(deps).filter(([key]) => key.endsWith("Ready")).map(([, value]) => value));
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

test("sqlite: a chat.db that cannot open rejects, and the content.db this call opened is closed", async () => {
  const dir = mkSiteDir();
  try {
    const chatDbPath = path.join(dir, "chat.db");
    fs.mkdirSync(chatDbPath); // a directory: SQLite cannot open it as a database file
    await assert.rejects(
      openSiteStore({ storage: { kind: "sqlite" }, dbPath: path.join(dir, "content.db"), chatDbPath, role: "owner" }),
      /unable to open database file/
    );
    // content.db runs in WAL mode; closing its last connection checkpoints and removes -wal and -shm.
    assert.deepEqual(fs.readdirSync(dir).sort(), ["chat.db", "content.db"], "the opened content.db is closed");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sqlite: a chat.db that cannot open leaves a caller-supplied content.db open", async () => {
  const dir = mkSiteDir();
  const db = await openSiteContentDb(path.join(dir, "content.db"));
  try {
    const chatDbPath = path.join(dir, "chat.db");
    fs.mkdirSync(chatDbPath);
    await assert.rejects(
      openSiteStore({ storage: { kind: "sqlite" }, dbPath: path.join(dir, "content.db"), chatDbPath, role: "owner" }, { db }),
      /unable to open database file/
    );
    assert.equal(sqliteClientOf(db).open, true, "the caller's handle is the caller's to close");
  } finally {
    closeSqliteConnection(db);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sqlite: closing a store over a caller-supplied content.db closes chat.db and leaves content.db open", async () => {
  const dir = mkSiteDir();
  const db = await openSiteContentDb(path.join(dir, "content.db"));
  try {
    const store = await openSiteStore(
      { storage: { kind: "sqlite" }, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" },
      { db }
    );
    assert.equal(store.sqliteDb, db, "the supplied handle backs the content kernel");
    await store.close();
    assert.equal(sqliteConnectionOf(store.chat)?.open, false, "chat.db, opened by the call, is closed");
    assert.equal(sqliteClientOf(db).open, true, "content.db, supplied by the caller, stays open");
  } finally {
    closeSqliteConnection(db);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pglite: a failed first-run preparation stops the owner, so the next owner opens the same data dir", async () => {
  const dir = mkSiteDir();
  const required = { storage: { kind: "pglite" } as const, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" as const };
  try {
    await assert.rejects(openSiteStore(required, { seed: duplicatePostSeed() }), /duplicate key value violates unique constraint/);
    const next = await openSiteStore(required);
    await next.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a pglite client (the agent daemon) with no owner serving is refused after its wait, naming the socket", async () => {
  const dir = mkSiteDir();
  const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), "r1f-sock-"));
  const socketPath = path.join(socketDir, ".s.PGSQL.5432");
  try {
    await assert.rejects(
      openSiteStore(
        { storage: { kind: "pglite" }, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "client" },
        { env: { [PG_SOCKET_ENV]: socketPath }, pgliteClientWaitMs: 300 }
      ),
      (err: unknown) => {
        assert.ok(err instanceof StorageNotAvailableError, `expected StorageNotAvailableError, got ${String(err)}`);
        assert.ok(err.message.includes(socketPath), err.message);
        return true;
      }
    );
    assert.deepEqual(fs.readdirSync(dir), [], "a client never creates the data dir or any file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(socketDir, { recursive: true, force: true });
  }
});

test("a pglite owner ignores an inherited TOVU_PG_SOCKET: it serves its own data dir's socket and never unlinks the one named", async () => {
  const dir = mkSiteDir();
  const foreignDir = fs.mkdtempSync(path.join(os.tmpdir(), "r1f-foreign-sock-"));
  const foreignSocket = path.join(foreignDir, ".s.PGSQL.5432");
  fs.writeFileSync(foreignSocket, "another site's live socket");
  try {
    const store = await openSiteStore(
      { storage: { kind: "pglite" }, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" },
      { env: { [PG_SOCKET_ENV]: foreignSocket } }
    );
    try {
      const expected = path.join(defaultPgliteSocketDir(path.join(dir, PGLITE_DATA_DIR_NAME)), PGLITE_SOCKET_FILE);
      assert.equal(store.pgliteSocketPath, expected);
      assert.equal(fs.readFileSync(foreignSocket, "utf8"), "another site's live socket");
    } finally {
      await store.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(foreignDir, { recursive: true, force: true });
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

test("the API process's sweep re-runs on its interval: a chat that expires after startup goes on a later pass", async () => {
  const dir = mkSiteDir();
  let store: SiteStore | undefined;
  try {
    const chatDbPath = path.join(dir, "chat.db");
    seedGuestChats(chatDbPath);
    let clock = Date.now();
    let passes = 0;
    const now = (): number => {
      passes++;
      return clock;
    };
    const deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
      chatExpirySweep: { intervalMs: 20, now },
      onStoreOpened: (opened) => (store = opened),
    });
    await bootSettled(deps);
    await waitFor(() => passes >= 3, "two passes after the boot pass");
    assert.deepEqual(chatIds(chatDbPath), ["fresh"], "the boot pass took the expired chat; later passes keep the unexpired one");
    clock += 2 * 3_600_000; // "fresh" expired an hour ago, by the sweep's clock
    await waitFor(() => chatIds(chatDbPath).length === 0, "a later pass to sweep the chat that expired after startup");
  } finally {
    await store?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("closing the API process's store waits for the sweep pass in flight before closing chat.db", async () => {
  const dir = mkSiteDir();
  let store: SiteStore | undefined;
  try {
    const chatDbPath = path.join(dir, "chat.db");
    seedGuestChats(chatDbPath);
    let clock = Date.now();
    let armed = false;
    let closing: Promise<void> | undefined;
    // A pass reads the clock synchronously, then queries; the queued close therefore starts while
    // that pass's delete is still pending.
    const now = (): number => {
      if (armed && closing === undefined) queueMicrotask(() => (closing = store?.close()));
      return clock;
    };
    const deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
      chatExpirySweep: { intervalMs: 20, now },
      onStoreOpened: (opened) => (store = opened),
    });
    await bootSettled(deps);
    clock += 2 * 3_600_000;
    armed = true;
    await waitFor(() => closing !== undefined, "a pass to start, and the store to start closing during it");
    await closing;
    assert.equal(sqliteConnectionOf(store!.chat)?.open, false, "chat.db is closed");
    assert.deepEqual(chatIds(chatDbPath), [], "the pass in flight finished its delete before chat.db closed");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the agent daemon's composition (client) never starts the sweep", async () => {
  const dir = mkSiteDir();
  let store: SiteStore | undefined;
  try {
    const chatDbPath = path.join(dir, "chat.db");
    seedGuestChats(chatDbPath);
    let passes = 0;
    const now = (): number => {
      passes++;
      return Date.now();
    };
    const deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
      storeRole: "client",
      chatExpirySweep: { intervalMs: 20, now },
      onStoreOpened: (opened) => (store = opened),
    });
    await bootSettled(deps);
    // A started sweep runs its first pass synchronously while the composition opens its store, so a
    // clock never read means no sweep, without waiting on the timer.
    assert.equal(passes, 0, "no sweep pass on a client");
    assert.deepEqual(chatIds(chatDbPath), ["expired", "fresh"]);
  } finally {
    await store?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

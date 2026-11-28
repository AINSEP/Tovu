import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { closeSqliteConnection, openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { resolveWorkspace } from "#src/platform/site-dir/resolve-workspace";
import { openCompositionStore, type StoreCloseRegistration } from "../open-store.js";

/**
 * @file `openCompositionStore` on the paths a client or a caller-supplied store takes: a supplied store is never
 * closed by `release` (only this composition's users are stopped, boot drains first), a client starts no owner
 * sweeps, and a supplied SQLite opener opens the database. Also: which folder decides the storage kind, that a supplied
 * database is never overwritten by the stock seed, and that a failed mail-retention pass is reported.
 */

type Overrides = NonNullable<NonNullable<Parameters<typeof openCompositionStore>[1]>["overrides"]>;

function siteDir(t: test.TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "open-store-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("releasing a supplied client store drains boot work, then disposes registrations, and leaves the store open", async t => {
  const order: string[] = [];
  const supplied = { content: { kernel: "content" }, chat: { kernel: "chat" }, close: async () => { order.push("store closed"); } };
  const opened: unknown[] = [];
  const dbPath = path.join(siteDir(t), "site", "content.db");
  const result = await openCompositionStore({ dbPath }, { overrides: { store: supplied, storeRole: "client", onStoreOpened: ({ store }: { store: unknown }) => { opened.push(store); } } as unknown as Overrides });
  result.beforeClose({ drain: async () => { order.push("drained"); } });
  const registration: StoreCloseRegistration = Promise.resolve(() => { order.push("unregistered"); });
  result.onClose({ registration });
  assert.deepEqual(opened, [result.store]);
  assert.equal(result.store.content, supplied.content);
  await result.release();
  assert.deepEqual(order, ["drained", "unregistered"]);
  await result.store.close();
  assert.deepEqual(order, ["drained", "unregistered", "drained", "store closed"]);
});

test("a supplied SQLite opener opens the client's content database, and closing the store closes it", async t => {
  const dir = siteDir(t);
  const openedFiles: string[] = [];
  const sqliteOpen = ((file: string, options?: Parameters<typeof openNativeSqlite>[1]) => { openedFiles.push(String(file)); return openNativeSqlite(file, options); }) as Overrides["sqliteOpen"];
  const dbPath = path.join(dir, "content.db");
  const { store, release } = await openCompositionStore({ dbPath }, { overrides: { sqliteOpen, storeRole: "client" } as Overrides });
  assert.equal(openedFiles.includes(dbPath), true, openedFiles.join(", "));
  assert.equal(release, store.close);
  await release();
});

/** A site folder whose `.site-meta.json` names a storage kind no store can open. */
function siteWithBogusStorage(t: test.TestContext): { dir: string; name: string } {
  const dir = path.join(siteDir(t), "bound-site");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ storage: { kind: "bogus" } }));
  return { dir, name: "bound-site" };
}

test("a file database takes its storage kind from the bound site's folder, but an in-memory database is always SQLite", async t => {
  const siteBinding = siteWithBogusStorage(t) as Overrides["siteBinding"];
  const dbPath = path.join(siteDir(t), "content.db");
  await assert.rejects(openCompositionStore({ dbPath }, { overrides: { siteBinding, storeRole: "client" } }), /kind "bogus" is not one of "sqlite", "pglite", "postgres"/);
  const { store, release } = await openCompositionStore({ dbPath: ":memory:" }, { overrides: { siteBinding, storeRole: "client" } });
  t.after(release);
  assert.equal((await resolveWorkspace({ kernel: store.content })).id, "workspace-local");
});

test("a supplied database is not overwritten by the site's stock seed", async t => {
  const seedRoot = siteDir(t);
  const previousSeed = process.env.TOVU_STOCK_CONTENT_SEED_DIR;
  process.env.TOVU_STOCK_CONTENT_SEED_DIR = seedRoot;
  t.after(() => { if (previousSeed === undefined) delete process.env.TOVU_STOCK_CONTENT_SEED_DIR; else process.env.TOVU_STOCK_CONTENT_SEED_DIR = previousSeed; });
  fs.mkdirSync(path.join(seedRoot, "site-h"));
  closeSqliteConnection({ source: openContentDb(path.join(seedRoot, "site-h", "content.seed.db")) });
  const dbPath = path.join(siteDir(t), "site-h", "content.db");
  fs.mkdirSync(path.dirname(dbPath));
  const db = openContentDb(":memory:");
  const { release } = await openCompositionStore({ dbPath }, { overrides: { db, storeRole: "client" } });
  t.after(async () => { await release(); closeSqliteConnection({ source: db }); });
  assert.equal(fs.existsSync(dbPath), false, "the stock seed was copied to the database path");
});

test("a mail-retention pass that fails on the owner's store is reported as a warning", async t => {
  const real = await openCompositionStore({ dbPath: ":memory:" }, { overrides: { storeRole: "client" } });
  t.after(real.release);
  const down = new Proxy({}, { get: () => () => Promise.reject(new Error("database down")) });
  const warnings = t.mock.method(console, "warn", () => undefined);
  const supplied = { ...real.store, content: down } as unknown as Overrides["store"];
  const { release } = await openCompositionStore({ dbPath: ":memory:" }, { overrides: { store: supplied, chatExpirySweep: { intervalMs: 3_600_000 } } });
  await release();
  assert.deepEqual(warnings.mock.calls.map(call => call.arguments).filter(([message]) => String(message).startsWith("[mail-retention]")), [["[mail-retention] purge failed"]]);
});

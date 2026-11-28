import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { openCompositionStore, type StoreCloseRegistration } from "../open-store.js";

/**
 * @file `openCompositionStore` on the paths a client or a caller-supplied store takes: a supplied store is never
 * closed by `release` (only this composition's users are stopped, boot drains first), a client starts no owner
 * sweeps, and a supplied SQLite opener opens the database.
 */

type Overrides = NonNullable<Parameters<typeof openCompositionStore>[1]>["overrides"];

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
  const result = await openCompositionStore({ dbPath }, { overrides: { store: supplied, storeRole: "client", onStoreOpened: ({ store }) => { opened.push(store); } } as unknown as Overrides });
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

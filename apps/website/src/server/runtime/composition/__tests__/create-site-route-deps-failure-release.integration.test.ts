import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { sqliteClientOf, sqliteConnectionOf } from "#src/platform/db/kernel/drivers/sqlite";
import { initSite } from "#src/platform/site-dir/init-site";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { openSiteStore, PG_SOCKET_ENV, type SiteStore } from "../open-site-store.js";

/**
 * @file A composition that fails after its store opened closes that store before rejecting: the
 * SQLite handles are closed, and a PGlite owner releases its lock and socket so the next owner can
 * open the data dir. The failure is a real post-open one: a requested workspace with no row.
 */

let parent: string;
let socketDir: string;
const savedSocketEnv = process.env[PG_SOCKET_ENV];

before(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "composition-release-"));
  socketDir = fs.mkdtempSync("/tmp/cr-");
  process.env[PG_SOCKET_ENV] = path.join(socketDir, ".s.PGSQL.5432");
});

after(() => {
  if (savedSocketEnv === undefined) delete process.env[PG_SOCKET_ENV];
  else process.env[PG_SOCKET_ENV] = savedSocketEnv;
  fs.rmSync(parent, { recursive: true, force: true });
  fs.rmSync(socketDir, { recursive: true, force: true });
});

async function composeMissingWorkspace(siteDir: string): Promise<SiteStore | undefined> {
  let opened: SiteStore | undefined;
  await assert.rejects(
    createSiteRouteDeps(path.join(siteDir, "content.db"), {
      requestedWorkspaceId: "no-such-workspace",
      themesDir: path.join(siteDir, "themes"),
      onStoreOpened: (store) => (opened = store),
    })
  );
  return opened;
}

test("SQLite: a composition failing after the open closes content.db and chat.db", async () => {
  const siteDir = path.join(parent, "sqlite-site");
  await initSite({ dir: siteDir, name: "Release SQLite" });
  const opened = await composeMissingWorkspace(siteDir);
  assert.ok(opened?.sqliteDb, "the composition opened a SQLite store");
  assert.equal(sqliteClientOf(opened.sqliteDb).open, false, "content.db is closed");
  assert.equal(sqliteConnectionOf(opened.chat)?.open, false, "chat.db is closed");
});

test("PGlite: a composition failing after the open releases the owner lock, so the next owner opens", async () => {
  const siteDir = path.join(parent, "pglite-site");
  await initSite({ dir: siteDir, name: "Release PGlite", storage: { kind: "pglite" } });
  assert.notEqual(await composeMissingWorkspace(siteDir), undefined);
  const next = await openSiteStore({
    storage: { kind: "pglite" },
    dbPath: path.join(siteDir, "content.db"),
    chatDbPath: path.join(siteDir, "chat.db"),
    role: "owner",
  });
  await next.close();
});
